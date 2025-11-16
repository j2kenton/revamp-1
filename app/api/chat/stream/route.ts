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
import { validateTokenCount } from '@/lib/llm/service';
import { logError, logInfo } from '@/utils/logger';
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

    // Validate token count
    const allMessages = [
      ...chatHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: sanitizedContent },
    ];

    if (!validateTokenCount(allMessages)) {
      return badRequest('Message thread is too long. Please start a new chat.');
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
        });

        try {
          // Simulate streaming response
          // In production, replace with actual streaming LLM API
          const mockResponse = `This is a streaming response to: "${sanitizedContent}".

In a production environment, this would stream tokens from a real LLM API.

To implement real streaming:
1. Use OpenAI's streaming API or similar
2. Stream tokens as they arrive
3. Handle connection drops gracefully
4. Implement reconnection logic`;

          const words = mockResponse.split(' ');
          let accumulatedContent = '';

          const aiMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          // Stream words with delay to simulate real streaming
          for (let i = 0; i < words.length; i++) {
            accumulatedContent += (i > 0 ? ' ' : '') + words[i];

            sendEvent('content_delta', {
              messageId: aiMessageId,
              delta: words[i] + ' ',
              accumulatedContent,
            });

            // Heartbeat every few words
            if (i % 10 === 0) {
              sendHeartbeat();
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          // Save complete AI message
          const aiMessage: MessageModel = {
            id: aiMessageId,
            chatId: chat!.id,
            role: 'assistant',
            content: accumulatedContent,
            status: 'sent',
            parentMessageId: userMessageId,
            metadata: {
              model: 'mock-streaming',
              tokensUsed: words.length,
              processingTime: words.length * 50,
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
          });
        } catch (error) {
          logError('Streaming error', error);
          sendEvent('error', {
            message: 'Failed to generate response',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
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
