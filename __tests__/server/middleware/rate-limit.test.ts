import { NextRequest } from 'next/server';
import {
  withRateLimit,
  requireRateLimit,
  withChatRateLimit,
} from '@/server/middleware/rate-limit';
import { getRedisClient } from '@/lib/redis/client';
import { redisCircuitBreaker } from '@/lib/redis/circuit-breaker';
import {
  checkRateLimit,
  RATE_LIMITS,
  type RateLimitResult,
} from '@/lib/rate-limiter';
import { getSessionFromRequest } from '@/server/middleware/session';
import { tooManyRequests, serverError } from '@/server/api-response';
import { chatRateLimit } from '@/server/middleware/enhanced-rate-limit';

// Store original env values
const originalEnv = { ...process.env };

// Helper to safely modify NODE_ENV in tests
const setNodeEnv = (value: string) => {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    writable: true,
    configurable: true,
  });
};

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('@/lib/redis/circuit-breaker', () => ({
  redisCircuitBreaker: {
    getState: jest.fn(() => 'CLOSED'),
  },
}));

jest.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: jest.fn(),
  RATE_LIMITS: {
    API_DEFAULT: {
      maxRequests: 10,
      windowSeconds: 60,
      keyPrefix: 'ratelimit:zset:api',
    },
    CHAT_MESSAGE: {
      maxRequests: 5,
      windowSeconds: 60,
      keyPrefix: 'ratelimit:zset:chat',
    },
    AUTH: {
      maxRequests: 5,
      windowSeconds: 60,
      keyPrefix: 'ratelimit:zset:auth',
    },
    LLM_GLOBAL: {
      maxRequests: 15,
      windowSeconds: 60,
      keyPrefix: 'ratelimit:zset:llm-global',
    },
  },
}));

jest.mock('@/server/middleware/session', () => ({
  getSessionFromRequest: jest.fn(),
}));

jest.mock('@/server/middleware/enhanced-rate-limit', () => ({
  chatRateLimit: jest.fn(),
  enhancedRateLimit: jest.fn(),
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

describe('Rate Limit Middleware', () => {
  const redisClient = {};

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    process.env = { ...originalEnv };
    (getRedisClient as jest.Mock).mockReturnValue(redisClient);
    (getSessionFromRequest as jest.Mock).mockResolvedValue({
      userId: 'user-123',
    });
    (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('withRateLimit', () => {
    it('allows requests when under the limit', async () => {
      const allowResult: RateLimitResult = {
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: new Date(Date.now() + 1000),
      };
      // Mock for both identifiers (IP and user) checked by checkAllRateLimits
      (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

      const result = await withRateLimit(
        requestFactory(),
        RATE_LIMITS.API_DEFAULT,
      );

      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
      // Called twice: once for IP identifier, once for user identifier
      expect(checkRateLimit).toHaveBeenCalledTimes(2);
    });

    it('blocks requests that exceed the limit', async () => {
      const denyResult: RateLimitResult = {
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: new Date(Date.now() + 5000),
      };
      // First identifier (IP) is rate limited - stops checking further
      (checkRateLimit as jest.Mock).mockResolvedValueOnce(denyResult);

      const result = await withRateLimit(
        requestFactory(),
        RATE_LIMITS.API_DEFAULT,
      );

      expect(result.allowed).toBe(false);
      expect(result.error?.status).toBe(429);
      expect(tooManyRequests).toHaveBeenCalled();
    });

    // SECURITY TEST: CRIT-01 - Fail-closed on Redis errors
    describe('CRIT-01: Fail-closed on Redis errors', () => {
      it('should deny request when checkRateLimit throws an error', async () => {
        (checkRateLimit as jest.Mock).mockRejectedValue(
          new Error('Redis connection failed'),
        );

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(500);
        expect(serverError).toHaveBeenCalledWith(
          expect.stringContaining(
            'Rate limiting service temporarily unavailable',
          ),
        );
      });

      it('should fail closed on any Redis error to prevent LLM cost abuse', async () => {
        (checkRateLimit as jest.Mock).mockRejectedValue(
          new Error('ECONNREFUSED'),
        );

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(false);
        // Should NOT allow the request through
        expect(result.error).toBeDefined();
      });
    });

    // SECURITY TEST: CRIT-03 - Production environment check for rate limit disable
    describe('CRIT-03: Production environment check for rate limit disable', () => {
      it('should allow rate limit bypass in non-production when ENABLE_RATE_LIMITING=false', async () => {
        process.env.ENABLE_RATE_LIMITING = 'false';
        setNodeEnv('development');

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(true);
        expect(checkRateLimit).not.toHaveBeenCalled();
      });

      it('should IGNORE rate limit disable flag in production and continue rate limiting', async () => {
        process.env.ENABLE_RATE_LIMITING = 'false';
        setNodeEnv('production');

        const denyResult: RateLimitResult = {
          allowed: false,
          limit: 10,
          remaining: 0,
          resetAt: new Date(Date.now() + 5000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(denyResult);

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        // Should still check rate limit in production
        expect(checkRateLimit).toHaveBeenCalled();
        // Should deny rate-limited request
        expect(result.allowed).toBe(false);
      });

      it('should allow requests in production when under rate limit (ignoring disable flag)', async () => {
        process.env.ENABLE_RATE_LIMITING = 'false';
        setNodeEnv('production');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(true);
        expect(checkRateLimit).toHaveBeenCalled();
      });
    });

    // SECURITY TEST: MED-03 - Circuit breaker consistency
    describe('MED-03: Circuit breaker consistency', () => {
      it('should deny request when Redis circuit breaker is OPEN', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(500);
        expect(serverError).toHaveBeenCalledWith(
          expect.stringContaining('Service temporarily unavailable'),
        );
        // Should not even attempt to check rate limit
        expect(checkRateLimit).not.toHaveBeenCalled();
      });

      it('should allow request when Redis circuit breaker is CLOSED', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(true);
        expect(checkRateLimit).toHaveBeenCalled();
      });

      it('should allow request when Redis circuit breaker is HALF_OPEN', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue(
          'HALF_OPEN',
        );

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(true);
        expect(checkRateLimit).toHaveBeenCalled();
      });
    });

    // SECURITY TEST: MED-01 - Dual identifier rate limiting
    describe('MED-01: Dual identifier rate limiting', () => {
      it('should check both IP and user identifiers for authenticated users', async () => {
        (getSessionFromRequest as jest.Mock).mockResolvedValue({
          userId: 'user-123',
        });

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

        await withRateLimit(requestFactory(), RATE_LIMITS.API_DEFAULT);

        // Should be called for both IP and user identifiers
        expect(checkRateLimit).toHaveBeenCalledTimes(2);

        const calls = (checkRateLimit as jest.Mock).mock.calls;
        const identifiers = calls.map(
          (call: [unknown, string, unknown]) => call[1],
        );
        expect(identifiers).toContainEqual(expect.stringContaining('ip:'));
        expect(identifiers).toContainEqual(expect.stringContaining('user:'));
      });

      it('should only check IP identifier for unauthenticated users', async () => {
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

        await withRateLimit(requestFactory(), RATE_LIMITS.API_DEFAULT);

        // Should only be called for IP identifier
        expect(checkRateLimit).toHaveBeenCalledTimes(1);

        const call = (checkRateLimit as jest.Mock).mock.calls[0];
        expect(call[1]).toContain('ip:');
      });

      it('should deny if either IP or user identifier is rate limited', async () => {
        (getSessionFromRequest as jest.Mock).mockResolvedValue({
          userId: 'user-123',
        });

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        const denyResult: RateLimitResult = {
          allowed: false,
          limit: 10,
          remaining: 0,
          resetAt: new Date(Date.now() + 5000),
        };

        // First check (IP) passes, second check (user) fails
        (checkRateLimit as jest.Mock)
          .mockResolvedValueOnce(allowResult)
          .mockResolvedValueOnce(denyResult);

        const result = await withRateLimit(
          requestFactory(),
          RATE_LIMITS.API_DEFAULT,
        );

        expect(result.allowed).toBe(false);
        expect(result.error?.status).toBe(429);
      });

      it('should prevent login/logout rate limit bypass', async () => {
        // This test verifies that switching between authenticated and unauthenticated
        // doesn't allow doubling the rate limit because IP is always tracked

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

        // First request as authenticated user - should check IP and user
        (getSessionFromRequest as jest.Mock).mockResolvedValue({
          userId: 'user-123',
        });
        await withRateLimit(requestFactory(), RATE_LIMITS.API_DEFAULT);

        expect(checkRateLimit).toHaveBeenCalledTimes(2);

        jest.clearAllMocks();

        // Second request as unauthenticated - should still check same IP
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        await withRateLimit(requestFactory(), RATE_LIMITS.API_DEFAULT);

        // IP should be checked with the same identifier
        expect(checkRateLimit).toHaveBeenCalledTimes(1);
        const call = (checkRateLimit as jest.Mock).mock.calls[0];
        expect(call[1]).toContain('ip:127.0.0.1');
      });
    });

    // SECURITY TEST: HIGH-01 - IP spoofing prevention
    describe('HIGH-01: IP spoofing prevention', () => {
      it('should use last IP in X-Forwarded-For chain when no trusted proxies configured', async () => {
        process.env.TRUSTED_PROXY_IPS = '';
        setNodeEnv('development');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);

        // Spoofed X-Forwarded-For with multiple IPs
        const request = new NextRequest('http://localhost/api/test', {
          headers: new Headers([
            ['x-forwarded-for', 'spoofed.ip.1.1, real.proxy.1.1, 192.168.1.1'],
          ]),
        });

        await withRateLimit(request, RATE_LIMITS.API_DEFAULT);

        // Should use the last IP (closest proxy) not the first (attacker-controlled)
        const call = (checkRateLimit as jest.Mock).mock.calls[0];
        expect(call[1]).toContain('192.168.1.1');
        expect(call[1]).not.toContain('spoofed');
      });

      it('should use x-real-ip header when available', async () => {
        process.env.TRUSTED_PROXY_IPS = '';
        setNodeEnv('development');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost/api/test', {
          headers: new Headers([
            ['x-real-ip', '10.0.0.1'],
            ['x-forwarded-for', 'spoofed.ip.1.1'],
          ]),
        });

        await withRateLimit(request, RATE_LIMITS.API_DEFAULT);

        const call = (checkRateLimit as jest.Mock).mock.calls[0];
        expect(call[1]).toContain('10.0.0.1');
      });

      it('should trust first X-Forwarded-For IP when request comes from trusted proxy', async () => {
        process.env.TRUSTED_PROXY_IPS = '192.168.1.1';
        setNodeEnv('development');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost/api/test', {
          headers: new Headers([
            ['x-forwarded-for', 'client.real.ip, 192.168.1.1'],
            ['x-real-ip', '192.168.1.1'],
          ]),
        });

        await withRateLimit(request, RATE_LIMITS.API_DEFAULT);

        // Should trust the first IP because the connecting IP is in trusted proxies
        const call = (checkRateLimit as jest.Mock).mock.calls[0];
        expect(call[1]).toContain('client.real.ip');
      });

      it('should trust Vercel headers in production when no trusted proxies configured', async () => {
        process.env.TRUSTED_PROXY_IPS = '';
        setNodeEnv('production');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);

        const request = new NextRequest('http://localhost/api/test', {
          headers: new Headers([
            ['x-forwarded-for', 'real.client.ip, vercel.edge.ip'],
          ]),
        });

        await withRateLimit(request, RATE_LIMITS.API_DEFAULT);

        // In production without trusted proxies, trust Vercel's X-Forwarded-For
        const call = (checkRateLimit as jest.Mock).mock.calls[0];
        expect(call[1]).toContain('real.client.ip');
      });

      it('should prevent attackers from spoofing IPs to bypass rate limit', async () => {
        process.env.TRUSTED_PROXY_IPS = '';
        setNodeEnv('development');

        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 10,
          remaining: 9,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (getSessionFromRequest as jest.Mock).mockResolvedValue(null);

        // Attacker tries to spoof different IPs
        const spoofedIps = ['fake.1.1.1', 'fake.2.2.2', 'fake.3.3.3'];
        const actualLastIp = '192.168.1.100';

        for (const spoofedIp of spoofedIps) {
          jest.clearAllMocks();
          (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

          const request = new NextRequest('http://localhost/api/test', {
            headers: new Headers([
              ['x-forwarded-for', `${spoofedIp}, ${actualLastIp}`],
            ]),
          });

          await withRateLimit(request, RATE_LIMITS.API_DEFAULT);

          // All requests should use the same actual IP, not the spoofed one
          const call = (checkRateLimit as jest.Mock).mock.calls[0];
          expect(call[1]).toContain(actualLastIp);
          expect(call[1]).not.toContain(spoofedIp);
        }
      });
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

  // SECURITY TEST: HIGH-02 & HIGH-03 - Chat rate limiting
  describe('withChatRateLimit', () => {
    // SECURITY TEST: HIGH-02 - Consolidated rate limiting (no duplicate)
    describe('HIGH-02: Consolidated rate limiting', () => {
      it('should apply rate limiting checks (not duplicate ineffective limiters)', async () => {
        // This test verifies that rate limiting is applied and not bypassed
        // The key security concern is that we don't have duplicate rate limiters
        // that could be inconsistent or cause race conditions

        const denyResult: RateLimitResult = {
          allowed: false,
          limit: 15,
          remaining: 0,
          resetAt: new Date(Date.now() + 5000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(denyResult);

        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const limitedHandler = withChatRateLimit(handler);

        const response = await limitedHandler(requestFactory());

        // When rate limited, handler should NOT be called
        expect(handler).not.toHaveBeenCalled();
        // Response should be 429 (rate limited)
        expect(response.status).toBe(429);
        // Rate limit check should have been performed
        expect(checkRateLimit).toHaveBeenCalled();
      });
    });

    // SECURITY TEST: HIGH-03 - Global LLM rate limit
    describe('HIGH-03: Global LLM rate limit', () => {
      it('should check global LLM rate limit before chat-specific rate limit', async () => {
        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 15,
          remaining: 14,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (chatRateLimit as jest.Mock).mockResolvedValue({ allowed: true });

        const handler = jest.fn(
          async () => new Response('ok', { status: 200 }),
        );
        const limitedHandler = withChatRateLimit(handler);

        await limitedHandler(requestFactory());

        // Should check global LLM rate limit (checkRateLimit with LLM_GLOBAL config)
        expect(checkRateLimit).toHaveBeenCalledWith(
          expect.anything(),
          expect.any(String),
          expect.objectContaining({ keyPrefix: 'ratelimit:zset:llm-global' }),
        );
        // Then check chat-specific rate limit
        expect(chatRateLimit).toHaveBeenCalled();
      });

      it('should deny request if global LLM rate limit is exceeded', async () => {
        const denyResult: RateLimitResult = {
          allowed: false,
          limit: 15,
          remaining: 0,
          resetAt: new Date(Date.now() + 5000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(denyResult);

        const handler = jest.fn();
        const limitedHandler = withChatRateLimit(handler);

        const response = await limitedHandler(requestFactory());

        expect(response.status).toBe(429);
        // Should not proceed to chatRateLimit or handler
        expect(chatRateLimit).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
      });

      it('should deny request if chat-specific rate limit is exceeded (after global passes)', async () => {
        const allowResult: RateLimitResult = {
          allowed: true,
          limit: 15,
          remaining: 14,
          resetAt: new Date(Date.now() + 1000),
        };
        (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);
        (chatRateLimit as jest.Mock).mockResolvedValue({
          allowed: false,
          error: new Response('Rate limited', { status: 429 }),
        });

        const handler = jest.fn();
        const limitedHandler = withChatRateLimit(handler);

        const response = await limitedHandler(requestFactory());

        expect(response.status).toBe(429);
        expect(handler).not.toHaveBeenCalled();
      });

      it('should use shared global rate limit across different LLM endpoints', async () => {
        // This test verifies the LLM_GLOBAL rate limit config exists
        expect(RATE_LIMITS.LLM_GLOBAL).toBeDefined();
        expect(RATE_LIMITS.LLM_GLOBAL.keyPrefix).toBe(
          'ratelimit:zset:llm-global',
        );
        expect(RATE_LIMITS.LLM_GLOBAL.maxRequests).toBe(15);
      });

      it('should fail closed when Redis circuit breaker is open for global LLM limit', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        const handler = jest.fn();
        const limitedHandler = withChatRateLimit(handler);

        const response = await limitedHandler(requestFactory());

        expect(response.status).toBe(500);
        expect(checkRateLimit).not.toHaveBeenCalled();
        expect(chatRateLimit).not.toHaveBeenCalled();
        expect(handler).not.toHaveBeenCalled();
      });
    });

    it('should handle session extraction errors gracefully', async () => {
      (getSessionFromRequest as jest.Mock).mockRejectedValue(
        new Error('Session error'),
      );
      (chatRateLimit as jest.Mock).mockResolvedValue({ allowed: true });

      // Mock global rate limit check to pass
      const allowResult: RateLimitResult = {
        allowed: true,
        limit: 15,
        remaining: 14,
        resetAt: new Date(Date.now() + 1000),
      };
      (checkRateLimit as jest.Mock).mockResolvedValue(allowResult);

      const handler = jest.fn(async () => new Response('ok', { status: 200 }));
      const limitedHandler = withChatRateLimit(handler);

      const response = await limitedHandler(requestFactory());

      // Should still work with null userId
      expect(response.status).toBe(200);
      expect(chatRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), null);
    });
  });
});
