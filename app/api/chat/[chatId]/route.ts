/**
 * Chat History API Endpoint
 * GET /api/chat/[chatId] - Get chat messages
 */

import { NextRequest } from 'next/server';
import { requireSession } from '@/server/middleware/session';
import { withChatRateLimit } from '@/server/middleware/rate-limit';
import { success, badRequest, unauthorized, notFound } from '@/server/api-response';
import { getChat, getChatMessages } from '@/lib/redis/chat';
import { logError } from '@/utils/logger';
import { messageToDTO, chatToDTO } from '@/types/models';
import { getMessagesSchema } from '@/lib/validation/chat.schema';

const DEFAULT_OFFSET_PARAM = '0';
const DEFAULT_LIMIT_PARAM = '50';
const CACHE_MAX_AGE_SECONDS = 300;
const PRIVATE_CACHE_CONTROL = `private, max-age=${CACHE_MAX_AGE_SECONDS}`;

interface RouteContext {
  params: Promise<{ chatId: string }>;
}

async function handleChatGet(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  try {
    // Require authenticated session
    const session = await requireSession(request);

    // Get chat ID from params
    const { chatId } = await context.params;

    if (!chatId) {
      return badRequest('Chat ID is required');
    }

    // Get query parameters for pagination
    const searchParams = request.nextUrl.searchParams;
    const queryValidation = getMessagesSchema.safeParse({
      offset: searchParams.get('offset') || DEFAULT_OFFSET_PARAM,
      limit: searchParams.get('limit') || DEFAULT_LIMIT_PARAM,
    });

    if (!queryValidation.success) {
      return badRequest('Invalid query parameters', {
        errors: queryValidation.error.errors,
      });
    }

    const { offset, limit } = queryValidation.data;

    // Get chat
    const chat = await getChat(chatId);

    if (!chat) {
      return notFound('Chat not found');
    }

    // Verify ownership
    if (chat.userId !== session.userId) {
      return unauthorized('You do not have access to this chat');
    }

    // Get messages
    const messages = await getChatMessages(chatId, offset, limit);

    // Convert to DTOs
    const messagesDTO = messages.map(messageToDTO);
    const chatDTO = chatToDTO(chat);

    return success(
      {
        chat: chatDTO,
        messages: messagesDTO,
        pagination: {
          offset,
          limit,
          total: messages.length,
          hasMore: messages.length === limit,
        },
      },
      {
        message: 'Chat retrieved successfully',
      },
      {
        headers: {
          'Cache-Control': PRIVATE_CACHE_CONTROL, // Cache for 5 minutes
        },
      }
    );
  } catch (error) {
    logError('Chat retrieval error', error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return unauthorized();
    }

    return badRequest('Failed to retrieve chat');
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const limitedHandler = withChatRateLimit((req: NextRequest) =>
    handleChatGet(req, context),
  );
  return limitedHandler(request);
}
