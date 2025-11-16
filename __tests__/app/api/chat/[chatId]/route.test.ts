import { GET, DELETE } from '@/app/api/chat/[chatId]/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import * as dbModule from '@/lib/db';

jest.mock('next-auth');
jest.mock('@/lib/db', () => ({
  prisma: {
    chat: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
  },
}));

type MockDbClient = {
  chat: {
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
  message: {
    findMany: jest.Mock;
  };
};

const mockDb = dbModule.prisma as unknown as MockDbClient;
const buildContext = (chatId: string) => ({
  params: Promise.resolve({ chatId }),
});

describe('Chat Management API', () => {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  describe('GET /api/chat/[chatId]', () => {
    it('returns chat with messages for valid chatId', async () => {
      mockDb.chat.findUnique.mockResolvedValue({
        id: 'chat-123',
        userId: 'test-user-id',
        title: 'Test Chat',
      });
      mockDb.message.findMany.mockResolvedValue([
        { id: 'msg-1', content: 'Hello', role: 'user' },
        { id: 'msg-2', content: 'Hi there', role: 'assistant' },
      ]);

      const request = new NextRequest(
        'http://localhost:3000/api/chat/chat-123',
      );
      const response = await GET(request, buildContext('chat-123'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.chat.id).toBe('chat-123');
      expect(data.messages).toHaveLength(2);
    });

    it('returns 404 for non-existent chat', async () => {
      mockDb.chat.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/chat/invalid');
      const response = await GET(request, buildContext('invalid'));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Chat not found');
    });

    it("returns 403 when accessing another user's chat", async () => {
      mockDb.chat.findUnique.mockResolvedValue({
        id: 'chat-123',
        userId: 'other-user-id',
      });

      const request = new NextRequest(
        'http://localhost:3000/api/chat/chat-123',
      );
      const response = await GET(request, buildContext('chat-123'));

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('DELETE /api/chat/[chatId]', () => {
    it("successfully deletes user's chat", async () => {
      mockDb.chat.findUnique.mockResolvedValue({
        id: 'chat-123',
        userId: 'test-user-id',
      });
      mockDb.chat.delete.mockResolvedValue({ id: 'chat-123' });

      const request = new NextRequest(
        'http://localhost:3000/api/chat/chat-123',
      );
      const response = await DELETE(request, buildContext('chat-123'));

      expect(response.status).toBe(200);
      expect(mockDb.chat.delete).toHaveBeenCalledWith({
        where: { id: 'chat-123' },
      });
    });

    it('returns 404 when trying to delete non-existent chat', async () => {
      mockDb.chat.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/chat/invalid');
      const response = await DELETE(request, buildContext('invalid'));

      expect(response.status).toBe(404);
    });
  });
});
