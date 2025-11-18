import { NextRequest } from 'next/server';
import {
  withRateLimit,
  requireRateLimit,
} from '@/server/middleware/rate-limit';
import { getRedisClient } from '@/lib/redis/client';
import {
  checkRateLimit,
  RATE_LIMITS,
  type RateLimitResult,
} from '@/lib/rate-limiter';
import { getSessionFromRequest } from '@/server/middleware/session';
import { tooManyRequests } from '@/server/api-response';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn(),
  RATE_LIMITS: {
    API_DEFAULT: { maxRequests: 10, windowSeconds: 60, keyPrefix: 'ratelimit:zset:api' },
    CHAT_MESSAGE: { maxRequests: 5, windowSeconds: 60, keyPrefix: 'ratelimit:zset:chat' },
    AUTH: { maxRequests: 5, windowSeconds: 60, keyPrefix: 'ratelimit:zset:auth' },
  },
}));

jest.mock('@/server/middleware/session', () => ({
  getSessionFromRequest: jest.fn(),
}));

jest.mock('@/server/api-response', () => ({
  tooManyRequests: jest.fn((message: string) => new Response(message, { status: 429 })),
}));

const requestFactory = (url = 'http://localhost/api/test'): NextRequest =>
  new NextRequest(url, {
    headers: new Headers([['x-forwarded-for', '127.0.0.1']]),
  });

describe('Rate Limit Middleware', () => {
  const redisClient = {};

  beforeEach(() => {
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockReturnValue(redisClient);
    (getSessionFromRequest as jest.Mock).mockResolvedValue({ userId: 'user-123' });
  });

  describe('withRateLimit', () => {
    it('allows requests when under the limit', async () => {
      const allowResult: RateLimitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 1000),
      };
      (checkRateLimit as jest.Mock).mockResolvedValueOnce(allowResult);

      const result = await withRateLimit(requestFactory(), RATE_LIMITS.API_DEFAULT);

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
      expect(checkRateLimit).toHaveBeenCalledTimes(1);
    });

    it('blocks requests that exceed the limit', async () => {
      const denyResult: RateLimitResult = {
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: new Date(Date.now() + 5000),
      };
      (checkRateLimit as jest.Mock).mockResolvedValueOnce(denyResult);

      const result = await withRateLimit(requestFactory(), RATE_LIMITS.API_DEFAULT);

      expect(result.allowed).toBe(false);
      expect(result.error?.status).toBe(429);
      expect(tooManyRequests).toHaveBeenCalled();
    });
  });

  describe('requireRateLimit', () => {
    it('invokes handler when allowed', async () => {
      const allowResult: RateLimitResult = {
        allowed: true,
        limit: 10,
        remaining: 8,
        resetAt: new Date(Date.now() + 1000),
      };
      (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

      const handler = jest.fn(async () => new Response('ok', { status: 200 }));
      const limitedHandler = requireRateLimit(RATE_LIMITS.API_DEFAULT, handler);

      const response = await limitedHandler(requestFactory());

      expect(response.status).toBe(200);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('returns 429 when rate limited', async () => {
      const denyResult: RateLimitResult = {
        allowed: false,
        limit: 5,
        remaining: 0,
        resetAt: new Date(Date.now() + 5000),
      };
      (checkRateLimit as jest.Mock)
        .mockResolvedValueOnce(denyResult)
        .mockResolvedValueOnce(denyResult);

      const handler = jest.fn();
      const limitedHandler = requireRateLimit(RATE_LIMITS.API_DEFAULT, handler);

      const response = await limitedHandler(requestFactory());

      expect(response.status).toBe(429);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
