import { NextRequest } from 'next/server';
import {
  enhancedRateLimit,
  chatRateLimit,
} from '@/server/middleware/enhanced-rate-limit';
import { getRedisClient } from '@/lib/redis/client';
import {
  withCircuitBreaker,
  redisCircuitBreaker,
} from '@/lib/redis/circuit-breaker';
import { tooManyRequests, serverError } from '@/server/api-response';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('@/lib/redis/circuit-breaker', () => ({
  withCircuitBreaker: jest.fn(),
  redisCircuitBreaker: {
    getState: jest.fn(() => 'CLOSED'),
  },
}));

jest.mock('@/server/api-response', () => ({
  tooManyRequests: jest.fn(
    (message: string) => new Response(message, { status: 429 }),
  ),
  serverError: jest.fn(
    (message: string) => new Response(message, { status: 500 }),
  ),
}));

const requestFactory = (
  url = 'http://localhost/api/test',
  headers: Record<string, string> = {},
): NextRequest =>
  new NextRequest(url, {
    headers: new Headers([
      ['x-forwarded-for', '127.0.0.1'],
      ...Object.entries(headers),
    ]),
  });

describe('Enhanced Rate Limit Middleware', () => {
  let mockRedis: {
    get: jest.Mock;
    incr: jest.Mock;
    pexpire: jest.Mock;
    pttl: jest.Mock;
    expire: jest.Mock;
    setex: jest.Mock;
    ttl: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      pexpire: jest.fn().mockResolvedValue(1),
      pttl: jest.fn().mockResolvedValue(60000),
      expire: jest.fn().mockResolvedValue(1),
      setex: jest.fn().mockResolvedValue('OK'),
      ttl: jest.fn().mockResolvedValue(60),
      del: jest.fn().mockResolvedValue(1),
    };

    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');

    // Mock withCircuitBreaker to execute the function directly
    (withCircuitBreaker as jest.Mock).mockImplementation(
      async (fn: () => Promise<unknown>, fallback: () => unknown) => {
        try {
          return await fn();
        } catch {
          return fallback();
        }
      },
    );
  });

  describe('enhancedRateLimit', () => {
    it('allows requests when under the limit', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const result = await enhancedRateLimit(
        requestFactory(),
        'user:test-user',
        'chat',
        { maxRequests: 10 },
      );

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('blocks requests that exceed the limit', async () => {
      mockRedis.incr.mockResolvedValue(11);

      const result = await enhancedRateLimit(
        requestFactory(),
        'user:test-user',
        'chat',
        { maxRequests: 10 },
      );

      expect(result.allowed).toBe(false);
      expect(result.error?.status).toBe(429);
      expect(tooManyRequests).toHaveBeenCalled();
    });

    // SECURITY TEST: CRIT-02 - Fail-closed on Redis errors
    describe('CRIT-02: Fail-closed on Redis errors', () => {
      it('should deny request when Redis circuit breaker is OPEN', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
        );

        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(500);
        expect(serverError).toHaveBeenCalledWith(
          expect.stringContaining('Service temporarily unavailable'),
        );
        // Should not attempt any Redis operations
        expect(mockRedis.get).not.toHaveBeenCalled();
        expect(mockRedis.incr).not.toHaveBeenCalled();
      });

      it('should fail closed when lockout check fails (assume locked out)', async () => {
        // Mock withCircuitBreaker to use fallback for lockout check
        (withCircuitBreaker as jest.Mock).mockImplementation(
          async (_fn: () => Promise<unknown>, fallback: () => unknown) => {
            // Return fallback (which should return true = assume locked out)
            return fallback();
          },
        );

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
          { enableAccountLockout: true },
        );

        // Should assume locked out (fail closed)
        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(429);
      });

      it('should fail closed when rate limit check fails (trigger rate limit)', async () => {
        // First call for lockout check passes, second call for rate limit fails
        let callCount = 0;
        (withCircuitBreaker as jest.Mock).mockImplementation(
          async (fn: () => Promise<unknown>, fallback: () => unknown) => {
            callCount++;
            if (callCount === 1) {
              // Lockout check passes
              return false;
            }
            // Rate limit check fails - use fallback
            return fallback();
          },
        );

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
          {
            enableAccountLockout: true,
            maxRequests: 10,
          },
        );

        // Fallback returns maxRequests + 1, which triggers rate limit exceeded
        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(429);
      });

      it('should fail closed on Redis operation errors', async () => {
        // Mock Redis client that returns but operations fail
        const failingRedis = {
          get: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          incr: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          pexpire: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          pttl: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          expire: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          setex: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          ttl: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
          del: jest
            .fn()
            .mockRejectedValue(new Error('Redis connection failed')),
        };
        (getRedisClient as jest.Mock).mockReturnValue(failingRedis);

        // Mock withCircuitBreaker to throw error which triggers main try-catch
        (withCircuitBreaker as jest.Mock).mockImplementation(async () => {
          throw new Error('Redis connection failed');
        });

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
          { maxRequests: 10 },
        );

        // When there's an unhandled error, it fails closed with 500
        expect(result.allowed).toBe(false);
        // The implementation returns 500 for unhandled errors (fail closed)
        expect(result.error?.status).toBe(500);
        expect(serverError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Rate limiting service temporarily unavailable',
          ),
        );
      });

      it('should NOT fail open on Redis errors (security regression test)', async () => {
        // This test ensures we never allow requests when Redis fails
        // This was the original vulnerability

        // Simulate circuit breaker using fallback due to Redis errors
        (withCircuitBreaker as jest.Mock).mockImplementation(
          async (_fn: () => Promise<unknown>, fallback: () => unknown) => {
            return fallback();
          },
        );

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
          { maxRequests: 10 },
        );

        // CRITICAL: Must NOT allow the request when fallback is triggered
        // Fallback returns maxRequests + 1, which exceeds the limit
        expect(result.allowed).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('Account lockout functionality', () => {
      it('should block locked out users', async () => {
        mockRedis.get.mockResolvedValue('locked');
        mockRedis.ttl.mockResolvedValue(300);

        // Mock withCircuitBreaker to properly check lockout
        (withCircuitBreaker as jest.Mock).mockImplementation(
          async (fn: () => Promise<unknown>) => fn(),
        );

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
          { enableAccountLockout: true },
        );

        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(429);
      });

      it('should lockout user after exceeding threshold', async () => {
        // First call returns not locked, second call (incr) returns over limit
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValueOnce(11); // Rate limit exceeded
        mockRedis.incr.mockResolvedValueOnce(5); // Attempt counter at threshold

        (withCircuitBreaker as jest.Mock).mockImplementation(
          async (fn: () => Promise<unknown>) => fn(),
        );

        const result = await enhancedRateLimit(
          requestFactory(),
          'user:test-user',
          'chat',
          {
            enableAccountLockout: true,
            maxRequests: 10,
            lockoutThreshold: 5,
          },
        );

        expect(result.allowed).toBe(false);
        // Should have called setex to set lockout
        expect(mockRedis.setex).toHaveBeenCalled();
      });
    });
  });

  describe('chatRateLimit', () => {
    it('should call enhancedRateLimit with chat-specific config', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const result = await chatRateLimit(requestFactory(), 'user-123');

      expect(result.allowed).toBe(true);
    });

    it('should use IP-based identifier when userId is null', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const request = new NextRequest('http://localhost/api/test', {
        headers: new Headers([['x-forwarded-for', '192.168.1.100']]),
      });

      const result = await chatRateLimit(request, null);

      expect(result.allowed).toBe(true);
    });

    it('should use user-based identifier when userId is provided', async () => {
      mockRedis.incr.mockResolvedValue(1);

      const result = await chatRateLimit(requestFactory(), 'user-123');

      expect(result.allowed).toBe(true);
    });

    // SECURITY TEST: CRIT-02 via chatRateLimit
    it('should fail closed when Redis circuit breaker is OPEN', async () => {
      (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

      const result = await chatRateLimit(requestFactory(), 'user-123');

      expect(result.allowed).toBe(false);
      expect(result.error?.status).toBe(500);
      expect(serverError).toHaveBeenCalledWith(
        expect.stringContaining('Service temporarily unavailable'),
      );
    });
  });
});
