import { POST } from '@/app/api/chat/stream/route';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';

jest.mock('next-auth');

describe('POST /api/chat/stream', () => {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  describe('Streaming Response', () => {
    it('returns a ReadableStream for valid requests', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello streaming' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it('handles stream cancellation gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ message: 'Test cancellation' }),
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
        body: JSON.stringify({ message: 'Test streaming' }),
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
      // Mock AI service to fail mid-stream
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        throw new Error('Stream interrupted');
      });

      const request = new NextRequest('http://localhost:3000/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify({ message: 'Test error' }),
      });

      const response = await POST(request);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let errorReceived = false;

      if (reader) {
        try {
          const { value } = await reader.read();
          if (value) {
            const chunk = decoder.decode(value);
            errorReceived = chunk.includes('error');
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
        body: JSON.stringify({ message: 'Test abort' }),
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
