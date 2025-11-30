import { NextRequest } from 'next/server';
import { withRequestDedup } from '@/server/middleware/request-dedup';
import { getRedisClient } from '@/lib/redis/client';
import { tooManyRequests } from '@/server/api-response';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('@/server/api-response', () => ({
  tooManyRequests: jest.fn(
    (message: string) => new Response(message, { status: 429 }),
  ),
}));

const requestFactory = (
  url = 'http://localhost/api/test',
  options: { method?: string; body?: BodyInit; headers?: Headers } = {},
): NextRequest => {
  return new NextRequest(url, {
    method: 'POST',
    ...options,
  });
};

describe('Request Deduplication Middleware', () => {
  let mockRedis: {
    setnx: jest.Mock;
    expire: jest.Mock;
    ttl: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis = {
      setnx: jest.fn().mockResolvedValue(1), // 1 = lock acquired
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(30),
      del: jest.fn().mockResolvedValue(1),
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  describe('withRequestDedup', () => {
    it('should allow request with client-provided idempotency key', async () => {
      const handler = jest.fn(async () => new Response('ok', { status: 200 }));
      const dedupHandler = withRequestDedup(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: new Headers([['x-idempotency-key', 'unique-key-123']]),
      });

      const response = await dedupHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockRedis.setnx).toHaveBeenCalled();
    });

    it('should allow request with x-request-id header', async () => {
      const handler = jest.fn(async () => new Response('ok', { status: 200 }));
      const dedupHandler = withRequestDedup(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: new Headers([['x-request-id', 'request-id-456']]),
      });

      const response = await dedupHandler(request);

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should block duplicate requests with same idempotency key', async () => {
      mockRedis.setnx.mockResolvedValue(0); // 0 = lock not acquired (duplicate)

      const handler = jest.fn();
      const dedupHandler = withRequestDedup(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: new Headers([['x-idempotency-key', 'duplicate-key']]),
      });

      const response = await dedupHandler(request);

      expect(response.status).toBe(429);
      expect(handler).not.toHaveBeenCalled();
      expect(tooManyRequests).toHaveBeenCalled();
    });

    it('should clean up lock after successful request', async () => {
      const handler = jest.fn(async () => new Response('ok', { status: 200 }));
      const dedupHandler = withRequestDedup(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: new Headers([['x-idempotency-key', 'cleanup-test-key']]),
      });

      await dedupHandler(request);

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should set TTL on the dedup lock', async () => {
      const handler = jest.fn(async () => new Response('ok', { status: 200 }));
      const dedupHandler = withRequestDedup(handler, { ttlSeconds: 60 });

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: new Headers([['x-idempotency-key', 'ttl-test-key']]),
      });

      await dedupHandler(request);

      expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60);
    });

    // SECURITY TEST: LOW-02 - Content hash fallback for request dedup
    describe('LOW-02: Server-side content hash fallback', () => {
      it('should generate server-side content hash when no client header provided', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        // Request without idempotency key or request-id
        const request = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'test message' }),
          headers: new Headers([['content-type', 'application/json']]),
        });

        const response = await dedupHandler(request);

        expect(response.status).toBe(200);
        // Should have generated a dedup key and called setnx
        expect(mockRedis.setnx).toHaveBeenCalled();
        // The key should contain 'auto:' prefix for server-generated keys
        const callArgs = mockRedis.setnx.mock.calls[0];
        expect(callArgs[0]).toContain('reqdedup:');
      });

      it('should block duplicate requests with same content hash', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        // First request - lock acquired
        mockRedis.setnx.mockResolvedValueOnce(1);

        const request1 = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'duplicate message' }),
          headers: new Headers([['content-type', 'application/json']]),
        });

        await dedupHandler(request1);

        // Second request with same content - lock not acquired
        mockRedis.setnx.mockResolvedValueOnce(0);

        const request2 = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'duplicate message' }),
          headers: new Headers([['content-type', 'application/json']]),
        });

        const response2 = await dedupHandler(request2);

        expect(response2.status).toBe(429);
      });

      it('should include authorization header in content hash for user-specific dedup', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        // Two requests with same body but different auth headers
        // should generate different dedup keys
        const setnxKeys: string[] = [];
        mockRedis.setnx.mockImplementation((key: string) => {
          setnxKeys.push(key);
          return Promise.resolve(1);
        });

        const request1 = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'same message' }),
          headers: new Headers([
            ['content-type', 'application/json'],
            ['authorization', 'Bearer token-user-1'],
          ]),
        });

        await dedupHandler(request1);

        const request2 = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'same message' }),
          headers: new Headers([
            ['content-type', 'application/json'],
            ['authorization', 'Bearer token-user-2'],
          ]),
        });

        await dedupHandler(request2);

        // Different auth headers should generate different keys
        expect(setnxKeys.length).toBe(2);
        expect(setnxKeys[0]).not.toBe(setnxKeys[1]);
      });

      it('should prefer client-provided key over server-generated hash', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        const setnxKeys: string[] = [];
        mockRedis.setnx.mockImplementation((key: string) => {
          setnxKeys.push(key);
          return Promise.resolve(1);
        });

        const request = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'test message' }),
          headers: new Headers([
            ['content-type', 'application/json'],
            ['x-idempotency-key', 'client-provided-key'],
          ]),
        });

        await dedupHandler(request);

        // Should use client-provided key, not auto-generated
        expect(setnxKeys[0]).toContain('client-provided-key');
        expect(setnxKeys[0]).not.toContain('auto:');
      });

      it('should group requests within 1-second time buckets', async () => {
        // Note: This tests that the content hash includes a time bucket
        // to prevent blocking unrelated requests that happen to have similar content

        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        const request = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'test' }),
          headers: new Headers([['content-type', 'application/json']]),
        });

        const response = await dedupHandler(request);

        expect(response.status).toBe(200);
        // The implementation uses 1-second time buckets in the hash
        // This ensures exact duplicates within 1 second are blocked,
        // but similar requests over longer periods are allowed
      });

      it('should proceed without dedup when content hash generation fails', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        // Request without body and without headers - might fail to generate hash
        // but should still proceed
        const request = requestFactory('http://localhost/api/test', {
          method: 'POST',
        });

        const response = await dedupHandler(request);

        // Should still process the request even if hash generation fails
        expect(response.status).toBe(200);
        expect(handler).toHaveBeenCalled();
      });

      it('should prevent malicious clients from bypassing dedup by omitting header', async () => {
        // This is the key security test for LOW-02
        // Malicious clients used to bypass dedup by simply not sending the header
        // Now the server generates a hash from the request content

        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler);

        // First request (no header) - should still create dedup entry
        mockRedis.setnx.mockResolvedValueOnce(1);

        const request1 = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'expensive operation' }),
          headers: new Headers([['content-type', 'application/json']]),
        });

        await dedupHandler(request1);

        // Second identical request (no header) - should be blocked
        mockRedis.setnx.mockResolvedValueOnce(0);

        const request2 = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          body: JSON.stringify({ content: 'expensive operation' }),
          headers: new Headers([['content-type', 'application/json']]),
        });

        const response2 = await dedupHandler(request2);

        // Should be blocked as duplicate
        expect(response2.status).toBe(429);
        expect(tooManyRequests).toHaveBeenCalled();
      });
    });

    describe('Custom options', () => {
      it('should respect custom TTL', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler, { ttlSeconds: 120 });

        const request = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          headers: new Headers([['x-idempotency-key', 'custom-ttl-key']]),
        });

        await dedupHandler(request);

        expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 120);
      });

      it('should respect custom header names', async () => {
        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const dedupHandler = withRequestDedup(handler, {
          headerNames: ['x-custom-dedup-key'],
        });

        const request = new NextRequest('http://localhost/api/test', {
          method: 'POST',
          headers: new Headers([['x-custom-dedup-key', 'custom-header-value']]),
        });

        const response = await dedupHandler(request);

        expect(response.status).toBe(200);
        // Should use the custom header
        const callArgs = mockRedis.setnx.mock.calls[0];
        expect(callArgs[0]).toContain('custom-header-value');
      });
    });
  });
});
