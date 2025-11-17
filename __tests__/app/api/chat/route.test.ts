import { POST } from '@/app/api/chat/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import * as dbModule from '@/lib/db';

jest.mock('next-auth');
jest.mock('@/lib/db', () => ({
  prisma: {
    chat: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    message: {
      create: jest.fn(),
    },
  },
}));

type ChatRouteMockDb = {
  chat: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  message: {
    create: jest.Mock;
  };
};

const mockDb = dbModule.prisma as unknown as ChatRouteMockDb;

describe('POST /api/chat', () => {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  describe('Authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Input Validation', () => {
    it('returns 400 for empty message', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: '' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Message is required');
    });

    it('returns 400 for whitespace-only message', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: '   \n\t  ' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
    });

    it('returns 413 for message exceeding length limit', async () => {
      const longMessage = 'a'.repeat(10001);
      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: longMessage }),
      });

      const response = await POST(request);
      expect(response.status).toBe(413);

      const data = await response.json();
      expect(data.error).toContain('too long');
    });

    it('sanitizes XSS attempts in messages', async () => {
      const xssMessage = '<script>alert("xss")</script>Hello';
      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: xssMessage }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.userMessage).not.toContain('<script>');
      expect(data.userMessage).toContain('Hello');
    });
  });

  describe('Happy Path', () => {
    it('successfully creates a chat and returns AI response', async () => {
      mockDb.chat.create.mockResolvedValue({
        id: 'chat-123',
        userId: 'test-user-id',
        title: 'New Chat',
      });
      mockDb.message.create.mockResolvedValue({
        id: 'msg-123',
        content: 'Hello AI',
      });

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello AI' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('chatId');
      expect(data).toHaveProperty('userMessage');
      expect(data).toHaveProperty('aiResponse');
      expect(data.userMessage).toBe('Hello AI');
    });

    it('reuses existing chat when chatId is provided', async () => {
      mockDb.chat.findMany.mockResolvedValue([
        {
          id: 'existing-chat',
          userId: 'test-user-id',
        },
      ]);

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Follow-up message',
          chatId: 'existing-chat',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockDb.chat.create).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('returns 500 when database operation fails', async () => {
      mockDb.chat.create.mockRejectedValue(new Error('DB connection lost'));

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBe('Failed to process chat request');
    });

    it('returns 503 when AI service is unavailable', async () => {
      // Mock AI service failure
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('Service unavailable'));

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(503);
    });
  });

  describe('Rate Limiting', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      // Simulate multiple rapid requests
      for (let i = 0; i < 10; i++) {
        const request = new NextRequest('http://localhost:3000/api/chat', {
          method: 'POST',
        body: JSON.stringify({ content: `Message ${i}` }),
          headers: { 'X-Forwarded-For': '192.168.1.1' },
        });
        await POST(request);
      }

      const request = new NextRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: JSON.stringify({ content: 'Too many requests' }),
        headers: { 'X-Forwarded-For': '192.168.1.1' },
      });

      const response = await POST(request);
      expect(response.status).toBe(429);
    });
  });
});
