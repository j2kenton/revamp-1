/**
 * Chat API Endpoint
 * POST /api/chat - Send a message and get AI response
 */

import { NextRequest } from 'next/server';
import { chatMessageSchema } from '@/lib/validation/chat.schema';
import { sanitizeChatMessage } from '@/lib/sanitizer';
import { requireSession } from '@/server/middleware/session';
import { withCsrfProtection } from '@/server/middleware/csrf';
import { withChatRateLimit } from '@/server/middleware/rate-limit';
import { withRequestDedup } from '@/server/middleware/request-dedup';
import {
  success,
  badRequest,
  unauthorized,
  serverError,
} from '@/server/api-response';
import {
  createChat,
  getChat,
  addMessage,
  getChatMessages,
} from '@/lib/redis/chat';
import { withTransaction, txSet } from '@/lib/redis/transactions';
import { callLLMWithRetry, truncateMessagesToFit } from '@/lib/llm/service';
import { logError, logInfo, logWarn } from '@/utils/logger';
import type { MessageModel } from '@/types/models';
import { messageToDTO } from '@/types/models';
// SECURITY (LOW-04): Removed RANDOM_STRING constants, using crypto.randomUUID instead

const IDEMPOTENCY_KEY_TTL_SECONDS = 24 * 60 * 60;
const LLM_TIMEOUT_MS = 30000;
const TITLE_MAX_LENGTH = 50;
const CONTEXT_MAX_TOKENS = 8000;
const LLM_MAX_TOKENS = 1000;
const LLM_TEMPERATURE = 0.7;

async function processChatRequest(request: NextRequest): Promise<Response> {
  try {
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

    const { content, chatId, parentMessageId, idempotencyKey } =
      validation.data;

    // Sanitize message content
    const sanitizedContent = sanitizeChatMessage(content);

    // Check idempotency
    if (idempotencyKey) {
      const idempotencyKeyStore = `idempotency:${session.userId}:${idempotencyKey}`;
      const { getRedisClient } = await import('@/lib/redis/client');
      const redis = getRedisClient();
      const existing = await redis.get(idempotencyKeyStore);

      if (existing) {
        // Return cached response
        return success(JSON.parse(existing), {
          message: 'Message already processed (idempotent)',
        });
      }
    }

    // Get or create chat
    let chat = chatId ? await getChat(chatId) : null;

    if (chatId && !chat) {
      return badRequest('Chat not found');
    }

    if (chat && chat.userId !== session.userId) {
      return unauthorized('You do not have access to this chat');
    }

    if (!chat) {
      // Create new chat with title from first message
      const title =
        sanitizedContent.slice(0, TITLE_MAX_LENGTH) +
        (sanitizedContent.length > TITLE_MAX_LENGTH ? '...' : '');
      chat = await createChat(session.userId, title);
    }

    // Get chat history for context
    const chatHistory = await getChatMessages(chat.id);

    // Build chat history payload with smart truncation
    const allMessages = [
      ...chatHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: sanitizedContent },
    ];

    const {
      messages: truncatedMessages,
      truncated,
      removedCount,
    } = truncateMessagesToFit(allMessages, CONTEXT_MAX_TOKENS);

    if (truncated) {
      logWarn('Context truncated for chat request', {
        chatId: chat.id,
        userId: session.userId,
        removedCount,
        originalCount: allMessages.length,
        keptCount: truncatedMessages.length,
      });
    }

    // Use transaction for atomic operations
    const clientRequestId = idempotencyKey || null;

    const result = await withTransaction(async (ctx) => {
      // SECURITY (LOW-04): Use crypto.randomUUID for secure IDs
      const userMessageId = `msg_${crypto.randomUUID()}`;
      const userMessage: MessageModel = {
        id: userMessageId,
        chatId: chat!.id,
        role: 'user',
        content: sanitizedContent,
        status: 'sent',
        parentMessageId: parentMessageId || null,
        metadata: clientRequestId
          ? {
              clientRequestId,
            }
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save user message
      await addMessage(chat!.id, userMessage);

      // Call LLM with timeout
      let aiResponse;
      let llmMetadata;

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('LLM timeout')), LLM_TIMEOUT_MS),
        );

        const llmPromise = callLLMWithRetry(truncatedMessages, {
          maxTokens: LLM_MAX_TOKENS,
          temperature: LLM_TEMPERATURE,
        });

        aiResponse = (await Promise.race([
          llmPromise,
          timeoutPromise,
        ])) as Awaited<typeof llmPromise>;

        llmMetadata = {
          model: aiResponse.model,
          tokensUsed: aiResponse.tokensUsed,
          processingTime: aiResponse.processingTime,
        };

        logInfo('LLM call successful', {
          chatId: chat!.id,
          userId: session.userId,
          ...llmMetadata,
        });
      } catch (error) {
        logError('LLM call failed', error, {
          chatId: chat!.id,
          userId: session.userId,
        });

        // Mark user message as failed
        const failedMessage: MessageModel = {
          id: `msg_${crypto.randomUUID()}`,
          chatId: chat!.id,
          role: 'assistant',
          content:
            'I apologize, but I encountered an error processing your request. Please try again.',
          status: 'failed',
          parentMessageId: userMessageId,
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            respondingToClientRequestId: clientRequestId ?? undefined,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await addMessage(chat!.id, failedMessage);

        throw error;
      }

      // SECURITY (LOW-04): Use crypto.randomUUID for secure IDs
      const aiMessageId = `msg_${crypto.randomUUID()}`;
      const aiMessage: MessageModel = {
        id: aiMessageId,
        chatId: chat!.id,
        role: 'assistant',
        content: aiResponse.content,
        status: 'sent',
        parentMessageId: userMessageId,
        metadata: {
          ...llmMetadata,
          contextTruncated: truncated || undefined,
          messagesRemoved: truncated ? removedCount : undefined,
          respondingToClientRequestId: clientRequestId ?? undefined,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save AI message
      await addMessage(chat!.id, aiMessage);

      // Store idempotency key if provided
      if (idempotencyKey) {
        const idempotencyKeyStore = `idempotency:${session.userId}:${idempotencyKey}`;
        const responseData = {
          userMessage: messageToDTO(userMessage),
          aiMessage: messageToDTO(aiMessage),
          chatId: chat!.id,
        };

        await txSet(
          ctx,
          idempotencyKeyStore,
          JSON.stringify(responseData),
          IDEMPOTENCY_KEY_TTL_SECONDS,
        );
      }

      return {
        userMessage: messageToDTO(userMessage),
        aiMessage: messageToDTO(aiMessage),
        chatId: chat!.id,
      };
    });

    return success(result, {
      message: 'Message sent successfully',
    });
  } catch (error) {
    logError('Chat API error', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return unauthorized();
    }

    return serverError('Failed to process message');
  }
}

async function handleChatPost(request: NextRequest): Promise<Response> {
  // CRITICAL: Validate CSRF token BEFORE rate limiting
  const csrfCheck = await withCsrfProtection(request);
  if (!csrfCheck.valid && csrfCheck.error) {
    return csrfCheck.error;
  }

  const limitedHandler = withChatRateLimit(processChatRequest);
  return limitedHandler(request);
}

export const POST = withRequestDedup(handleChatPost);
