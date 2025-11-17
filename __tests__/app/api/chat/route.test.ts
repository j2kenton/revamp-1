import { NextRequest } from 'next/server';

import { POST } from '@/app/api/chat/route';
import { requireSession } from '@/server/middleware/session';
import { withCsrfProtection } from '@/server/middleware/csrf';
import { withChatRateLimit } from '@/server/middleware/rate-limit';
import { withRequestDedup } from '@/server/middleware/request-dedup';
import {
  createChat,
  getChat,
  addMessage,
  getChatMessages,
} from '@/lib/redis/chat';
import { withTransaction, txSet } from '@/lib/redis/transactions';
import { callLLMWithRetry, truncateMessagesToFit } from '@/lib/llm/service';

jest.mock('@/server/middleware/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/server/middleware/csrf', () => ({
  withCsrfProtection: jest.fn(),
}));

jest.mock('@/server/middleware/rate-limit', () => ({
  withChatRateLimit: jest.fn((handler) => handler),
}));

jest.mock('@/server/middleware/request-dedup', () => ({
  withRequestDedup: jest.fn((handler) => handler),
}));

jest.mock('@/lib/redis/chat', () => ({
  createChat: jest.fn(),
  getChat: jest.fn(),
  addMessage: jest.fn(),
  getChatMessages: jest.fn(),
}));

jest.mock('@/lib/redis/transactions', () => ({
  withTransaction: jest.fn((cb) => cb({})),
  txSet: jest.fn(),
}));

jest.mock('@/lib/llm/service', () => ({
  callLLMWithRetry: jest.fn(),
  truncateMessagesToFit: jest.fn(),
}));

const mockSession = {
  userId: 'test-user',
  email: 'test@example.com',
};

const buildRequest = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('POST /api/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireSession as jest.Mock).mockResolvedValue(mockSession);
    (withCsrfProtection as jest.Mock).mockResolvedValue({ valid: true });
    (getChat as jest.Mock).mockResolvedValue(null);
    (createChat as jest.Mock).mockResolvedValue({
      id: 'chat-123',
      userId: mockSession.userId,
      title: 'First message',
    });
    (addMessage as jest.Mock).mockResolvedValue(undefined);
    (getChatMessages as jest.Mock).mockResolvedValue([]);
    (callLLMWithRetry as jest.Mock).mockResolvedValue({
      content: 'AI response',
      model: 'mock-model',
      tokensUsed: 42,
      processingTime: 10,
    });
    (truncateMessagesToFit as jest.Mock).mockReturnValue({
      messages: [],
      truncated: false,
      removedCount: 0,
    });
  });

  it('returns 401 when session is missing', async () => {
    (requireSession as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    const response = await POST(buildRequest({ content: 'Hello' }));
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error.message).toBe('Unauthorized');
  });

  it('validates request body', async () => {
    const response = await POST(buildRequest({ content: '' }));
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.message).toBe('Invalid request');
  });

  it('creates a chat and returns AI response', async () => {
    const response = await POST(buildRequest({ content: 'Hello' }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.chatId).toBe('chat-123');
    expect(payload.data.userMessage.role).toBe('user');
    expect(payload.data.aiMessage.content).toBe('AI response');
    expect(callLLMWithRetry).toHaveBeenCalled();
    expect(addMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects access to chats owned by another user', async () => {
    (getChat as jest.Mock).mockResolvedValue({
      id: 'chat-1',
      userId: 'different-user',
    });

    const response = await POST(
      buildRequest({ content: 'Hi', chatId: 'chat-1' }),
    );
    expect(response.status).toBe(401);
  });

  it('returns server error when persistence fails', async () => {
    (createChat as jest.Mock).mockRejectedValue(new Error('Redis down'));

    const response = await POST(buildRequest({ content: 'Hello' }));
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error.message).toBe('Failed to process message');
  });
});
