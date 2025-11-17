import { NextRequest } from 'next/server';
import { GET } from '@/app/api/chat/[chatId]/route';
import { requireSession } from '@/server/middleware/session';
import { getChat, getChatMessages } from '@/lib/redis/chat';

jest.mock('@/server/middleware/session', () => ({
  requireSession: jest.fn(),
}));

jest.mock('@/server/middleware/rate-limit', () => ({
  withChatRateLimit: jest.fn((handler) => handler),
}));

jest.mock('@/lib/redis/chat', () => ({
  getChat: jest.fn(),
  getChatMessages: jest.fn(),
}));

const buildContext = (chatId: string) => ({
  params: Promise.resolve({ chatId }),
});

const mockSession = { userId: 'test-user' };

describe('GET /api/chat/[chatId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireSession as jest.Mock).mockResolvedValue(mockSession);
    (getChatMessages as jest.Mock).mockResolvedValue([
      {
        id: 'msg-1',
        chatId: 'chat-123',
        role: 'user',
        content: 'Hello',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it('returns chat data for owner', async () => {
    (getChat as jest.Mock).mockResolvedValue({
      id: 'chat-123',
      userId: mockSession.userId,
      title: 'Test',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/chat/chat-123'),
      buildContext('chat-123'),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.chat.id).toBe('chat-123');
  });

  it('returns 404 when chat is missing', async () => {
    (getChat as jest.Mock).mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost:3000/api/chat/missing'),
      buildContext('missing'),
    );

    expect(response.status).toBe(404);
  });

  it('returns 401 for chats owned by other users', async () => {
    (getChat as jest.Mock).mockResolvedValue({
      id: 'chat-123',
      userId: 'other',
      title: 'Test',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await GET(
      new NextRequest('http://localhost:3000/api/chat/chat-123'),
      buildContext('chat-123'),
    );

    expect(response.status).toBe(401);
  });
});
