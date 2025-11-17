import { POST } from '@/app/api/chat/stream/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { withCsrfProtection as mockWithCsrfProtection } from '@/server/middleware/csrf';
import { requireSession as mockRequireSession } from '@/server/middleware/session';
import {
  createChat,
  getChat,
  addMessage,
  getChatMessages,
} from '@/lib/redis/chat';
import {
  callLLMStreamWithRetry,
  truncateMessagesToFit,
  getCircuitBreaker,
} from '@/lib/llm/service';

jest.mock('next-auth');
jest.mock('@/server/middleware/csrf', () => ({
  withCsrfProtection: jest.fn().mockResolvedValue({ valid: true }),
}));
jest.mock('@/server/middleware/session', () => ({
  requireSession: jest.fn(),
}));
jest.mock('@/server/middleware/rate-limit', () => ({
  withChatRateLimit: jest.fn(
    (handler: (request: NextRequest) => Promise<Response>) => handler,
  ),
}));
jest.mock('@/lib/redis/chat', () => ({
  createChat: jest.fn(),
  getChat: jest.fn(),
  addMessage: jest.fn(),
  getChatMessages: jest.fn(),
}));
jest.mock('@/lib/llm/service', () => ({
  callLLMStreamWithRetry: jest.fn(),
  truncateMessagesToFit: jest.fn().mockReturnValue({
    messages: [],
    truncated: false,
    removedCount: 0,
  }),
  getFallbackMessage: jest.fn().mockReturnValue('Fallback'),
  getCircuitBreaker: jest.fn().mockReturnValue({ getState: () => 'CLOSED' }),
}));

describe('POST /api/chat/stream', () => {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (mockWithCsrfProtection as jest.Mock).mockResolvedValue({ valid: true });
    (mockRequireSession as jest.Mock).mockResolvedValue({
      userId: mockSession.user.id,
    });
    (getChat as jest.Mock).mockResolvedValue(null);
    (createChat as jest.Mock).mockResolvedValue({
      id: 'chat-123',
      userId: mockSession.user.id,
    });
    (getChatMessages as jest.Mock).mockResolvedValue([]);
    (addMessage as jest.Mock).mockResolvedValue(undefined);
    (callLLMStreamWithRetry as jest.Mock).mockImplementation(
      async (_messages, onToken: (chunk: string) => void) => {
        onToken('Hello');
        onToken(' world');
        return { model: 'mock-model', tokensUsed: 2 };
      },
    );
    (truncateMessagesToFit as jest.Mock).mockReturnValue({
      messages: [],
      truncated: false,
      removedCount: 0,
    });
    (getCircuitBreaker as jest.Mock).mockReturnValue({
      getState: () => 'CLOSED',
    });
  });

  describe('Streaming Response', () => {
    it('returns a ReadableStream for valid requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello streaming' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it('handles stream cancellation gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test cancellation' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();

      // Read first chunk then cancel
      if (reader) {
        await reader.read();
        await reader.cancel();
      }

      expect(response.status).toBe(200);
    });

    it('streams tokens progressively', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test streaming' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      if (reader) {
        let done = false;
        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;
          if (value) {
            chunks.push(decoder.decode(value));
          }
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((chunk) => chunk.includes('data:'))).toBe(true);
    });
  });

  describe('Error Handling in Stream', () => {
    it('sends error event on stream failure', async () => {
      (callLLMStreamWithRetry as jest.Mock).mockImplementationOnce(async () => {
        throw new Error('Stream interrupted');
      });
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test error' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let errorReceived = false;

      if (reader) {
        try {
          let done = false;
          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              const chunk = decoder.decode(value);
              if (chunk.includes('event: error')) {
                errorReceived = true;
                break;
              }
            }
          }
        } catch {
          errorReceived = true;
        }
      }

      expect(errorReceived).toBe(true);
    });
  });

  describe('Abort Signal Handling', () => {
    it('respects abort signal from client', async () => {
      const abortController = new AbortController();
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test abort' }),
        signal: abortController.signal,
      });

      // Start request then abort
      const responsePromise = POST(request);
      abortController.abort();

      const response = await responsePromise;
      expect(response.status).toBe(200); // Stream starts successfully
    });
  });
});
