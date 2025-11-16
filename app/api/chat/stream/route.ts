/**
 * Chat Streaming API Endpoint
 * POST /api/chat/stream - Stream AI responses using Server-Sent Events (SSE)
 */

import { NextRequest } from 'next/server';
import { chatMessageSchema } from '@/lib/validation/chat.schema';
import { sanitizeChatMessage } from '@/lib/sanitizer';
import { requireSession } from '@/server/middleware/session';
import { withCsrfProtection } from '@/server/middleware/csrf';
import { badRequest, unauthorized } from '@/server/api-response';
import { createChat, getChat, addMessage, getChatMessages } from '@/lib/redis/chat';
import {
  callLLMStreamWithRetry,
  truncateMessagesToFit,
  getFallbackMessage,
  getCircuitBreaker,
} from '@/lib/llm/service';
import { logError, logInfo, logWarn } from '@/utils/logger';
import type { MessageModel } from '@/types/models';

/**
 * POST /api/chat/stream
 * Stream AI response as Server-Sent Events
 */
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfCheck = await withCsrfProtection(request);
    if (!csrfCheck.valid && csrfCheck.error) {
      return csrfCheck.error;
    }

    // Require authenticated session
    const session = await requireSession(request);

    // Parse and validate request body
    const body = await request.json();
    const validation = chatMessageSchema.safeParse(body);

    if (!validation.success) {
      return badRequest('Invalid request', {
        errors: validation.error.errors,
      });
    }

    const { content, chatId, parentMessageId } = validation.data;
    const sanitizedContent = sanitizeChatMessage(content);

    // Get or create chat
    let chat = chatId ? await getChat(chatId) : null;

    if (chatId && !chat) {
      return badRequest('Chat not found');
    }

    if (chat && chat.userId !== session.userId) {
      return unauthorized('You do not have access to this chat');
    }

    if (!chat) {
      const title = sanitizedContent.slice(0, 50) + (sanitizedContent.length > 50 ? '...' : '');
      chat = await createChat(session.userId, title);
    }

    // Get chat history
    const chatHistory = await getChatMessages(chat.id);

    // Prepare messages with smart truncation
    const allMessages = [
      ...chatHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: sanitizedContent },
    ];

    const { messages: truncatedMessages, truncated, removedCount } =
      truncateMessagesToFit(allMessages, 8000);

    if (truncated) {
      logWarn('Context truncated for streaming request', {
        chatId: chat.id,
        removedCount,
        originalCount: allMessages.length,
        keptCount: truncatedMessages.length,
      });
    }

    // Create user message
    const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const userMessage: MessageModel = {
      id: userMessageId,
      chatId: chat.id,
      role: 'user',
      content: sanitizedContent,
      status: 'sent',
      parentMessageId: parentMessageId || null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await addMessage(chat.id, userMessage);

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        const sendHeartbeat = () => {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        };

        // Send initial message confirmation
        sendEvent('message_created', {
          messageId: userMessageId,
          chatId: chat!.id,
          truncated,
          removedCount,
        });

        const aiMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let accumulatedContent = '';
        let heartbeatCount = 0;

        try {
          // Check circuit breaker state
          const circuitBreaker = getCircuitBreaker();
          const circuitState = circuitBreaker.getState();

          if (circuitState === 'OPEN') {
            // Circuit is open, send fallback message immediately
            const fallbackMsg = getFallbackMessage();
            accumulatedContent = fallbackMsg;
            const fallbackMetadata = {
              model: 'fallback',
              tokensUsed: 0,
              processingTime: 0,
              circuitBreakerOpen: true,
            };

            sendEvent('fallback', {
              messageId: aiMessageId,
              message: fallbackMsg,
              metadata: fallbackMetadata,
            });

            // Persist fallback message to database
            const aiMessage: MessageModel = {
              id: aiMessageId,
              chatId: chat!.id,
              role: 'assistant',
              content: accumulatedContent,
              status: 'sent',
              parentMessageId: userMessageId,
              metadata: fallbackMetadata,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await addMessage(chat!.id, aiMessage);

            logWarn('Circuit breaker open - sent fallback message', {
              chatId: chat!.id,
              userId: session.userId,
            });
          } else {
            // Stream LLM response
            const startTime = Date.now();

            const response = await callLLMStreamWithRetry(
              truncatedMessages,
              (chunk: string) => {
                accumulatedContent += chunk;
                heartbeatCount++;

                sendEvent('content_delta', {
                  messageId: aiMessageId,
                  delta: chunk,
                  accumulatedContent,
                });

                // Send heartbeat periodically
                if (heartbeatCount % 10 === 0) {
                  sendHeartbeat();
                }
              },
              {
                model: 'gpt-4',
                maxTokens: 2000,
                temperature: 0.7,
              }
            );

            const processingTime = Date.now() - startTime;

            // Save complete AI message
            const aiMessage: MessageModel = {
              id: aiMessageId,
              chatId: chat!.id,
              role: 'assistant',
              content: accumulatedContent,
              status: 'sent',
              parentMessageId: userMessageId,
              metadata: {
                model: response.model,
                tokensUsed: response.tokensUsed,
                processingTime,
                contextTruncated: truncated,
                messagesRemoved: truncated ? removedCount : undefined,
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            await addMessage(chat!.id, aiMessage);

            // Send completion event
            sendEvent('message_complete', {
              messageId: aiMessageId,
              content: accumulatedContent,
              metadata: aiMessage.metadata,
            });

            logInfo('Streaming completed', {
              chatId: chat!.id,
              userId: session.userId,
              messageId: aiMessageId,
              tokensUsed: response.tokensUsed,
              processingTime,
            });
          }
        } catch (error) {
          logError('Streaming error', error);

          // Check if circuit breaker is now open
          const isCircuitOpen =
            error instanceof Error &&
            error.message.includes('Circuit breaker is OPEN');

          if (isCircuitOpen) {
            // Send fallback message
            const fallbackMsg = getFallbackMessage();
            const fallbackMetadata = {
              model: 'fallback',
              tokensUsed: 0,
              processingTime: 0,
              circuitBreakerOpen: true,
            };
            sendEvent('fallback', {
              messageId: aiMessageId,
              message: fallbackMsg,
              metadata: fallbackMetadata,
            });
          } else {
            sendEvent('error', {
              message: 'Failed to generate response',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  } catch (error) {
    logError('Stream API error', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return unauthorized();
    }

    return badRequest('Failed to initialize stream');
  }
}
