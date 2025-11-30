import {
  checkRateLimit,
  RATE_LIMITS,
  type RateLimitConfig,
} from '@/lib/rate-limiter';

// Store original env values
const originalEnv = { ...process.env };

// Mock Redis client
const createMockRedis = () => ({
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zrange: jest.fn().mockResolvedValue([]),
  zadd: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
});

describe('Rate Limiter', () => {
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockRedis = createMockRedis();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('checkRateLimit', () => {
    it('allows requests when under the limit', async () => {
      mockRedis.zrange.mockResolvedValue([]);

      const result = await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'user:test-user',
        RATE_LIMITS.API_DEFAULT,
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('blocks requests that exceed the limit', async () => {
      // Simulate 100 requests (at the limit for API_DEFAULT)
      const timestamps = Array.from(
        { length: 100 },
        (_, i) => `${Date.now() - i * 100}-${Math.random()}`,
      );
      mockRedis.zrange.mockResolvedValue(timestamps);

      const result = await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'user:test-user',
        RATE_LIMITS.API_DEFAULT,
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('removes old entries outside the window', async () => {
      await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'user:test-user',
        RATE_LIMITS.API_DEFAULT,
      );

      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
    });

    it('adds current request to the sorted set', async () => {
      mockRedis.zrange.mockResolvedValue([]);

      await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'user:test-user',
        RATE_LIMITS.API_DEFAULT,
      );

      expect(mockRedis.zadd).toHaveBeenCalled();
    });

    it('sets expiration on the key', async () => {
      mockRedis.zrange.mockResolvedValue([]);

      await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'user:test-user',
        RATE_LIMITS.API_DEFAULT,
      );

      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.any(String),
        RATE_LIMITS.API_DEFAULT.windowSeconds,
      );
    });

    // SECURITY TEST: Fail closed for auth endpoints on Redis error
    describe('Redis error handling', () => {
      it('should fail closed for auth endpoints on Redis error', async () => {
        mockRedis.zremrangebyscore.mockRejectedValue(
          new Error('Redis connection failed'),
        );

        const authConfig: RateLimitConfig = {
          ...RATE_LIMITS.AUTH,
          keyPrefix: 'ratelimit:zset:auth',
        };

        const result = await checkRateLimit(
          mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
          'user:test-user',
          authConfig,
        );

        // Should deny request for auth endpoint
        expect(result.allowed).toBe(false);
      });

      it('should fail closed for login endpoints on Redis error', async () => {
        mockRedis.zremrangebyscore.mockRejectedValue(
          new Error('Redis connection failed'),
        );

        const loginConfig: RateLimitConfig = {
          maxRequests: 5,
          windowSeconds: 60,
          keyPrefix: 'ratelimit:zset:login',
        };

        const result = await checkRateLimit(
          mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
          'user:test-user',
          loginConfig,
        );

        // Should deny request for login endpoint
        expect(result.allowed).toBe(false);
      });

      it('should use in-memory fallback for non-critical endpoints on Redis error', async () => {
        mockRedis.zremrangebyscore.mockRejectedValue(
          new Error('Redis connection failed'),
        );

        const result = await checkRateLimit(
          mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
          'user:test-user',
          RATE_LIMITS.API_DEFAULT,
        );

        // Should use in-memory fallback for non-critical endpoint
        // First request should be allowed
        expect(result.allowed).toBe(true);
      });
    });
  });

  // SECURITY TEST: LOW-01 - Instance count adjustment
  // Note: INSTANCE_COUNT is read at module load time, so we test the behavior
  // with the default configuration (INSTANCE_COUNT=1 or undefined)
  describe('LOW-01: Instance count adjustment for in-memory fallback', () => {
    it('should use in-memory fallback when Redis fails', async () => {
      // Force Redis error to trigger in-memory fallback
      mockRedis.zremrangebyscore.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      const config: RateLimitConfig = {
        maxRequests: 100,
        windowSeconds: 60,
        keyPrefix: 'ratelimit:zset:api-test',
      };

      const result = await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'user:test-user',
        config,
      );

      // With default INSTANCE_COUNT=1, should use original limit
      // The in-memory fallback should be used when Redis fails
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
    });

    it('should track requests in-memory when Redis is down', async () => {
      mockRedis.zremrangebyscore.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      const config: RateLimitConfig = {
        maxRequests: 100,
        windowSeconds: 60,
        keyPrefix: 'ratelimit:zset:api-test',
      };

      const result = await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'unique-user-inmemory-test',
        config,
      );

      // First request should be allowed with remaining reduced by 1
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should have minimum of 1 request per instance with adjusted limits', async () => {
      // This test documents the behavior when INSTANCE_COUNT is configured
      // The implementation uses Math.max(1, Math.ceil(maxRequests / INSTANCE_COUNT))
      // ensuring at least 1 request is allowed per instance
      mockRedis.zremrangebyscore.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      const config: RateLimitConfig = {
        maxRequests: 10,
        windowSeconds: 60,
        keyPrefix: 'ratelimit:zset:api-test',
      };

      const result = await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'unique-user-min-test',
        config,
      );

      // Should have minimum of 1 request allowed
      expect(result.limit).toBeGreaterThanOrEqual(1);
    });

    it('should properly calculate remaining requests', async () => {
      mockRedis.zremrangebyscore.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      const config: RateLimitConfig = {
        maxRequests: 100,
        windowSeconds: 60,
        keyPrefix: 'ratelimit:zset:api-test',
      };

      // First request
      const result1 = await checkRateLimit(
        mockRedis as unknown as Parameters<typeof checkRateLimit>[0],
        'unique-user-remaining-test',
        config,
      );

      // With default INSTANCE_COUNT=1, limit should be 100
      expect(result1.limit).toBe(100);
      expect(result1.remaining).toBe(99);
    });
  });

  describe('RATE_LIMITS configuration', () => {
    it('should have LLM_GLOBAL rate limit defined (HIGH-03)', () => {
      expect(RATE_LIMITS.LLM_GLOBAL).toBeDefined();
      expect(RATE_LIMITS.LLM_GLOBAL.maxRequests).toBe(15);
      expect(RATE_LIMITS.LLM_GLOBAL.windowSeconds).toBe(60);
      expect(RATE_LIMITS.LLM_GLOBAL.keyPrefix).toBe(
        'ratelimit:zset:llm-global',
      );
    });

    it('should have all required rate limit configurations', () => {
      expect(RATE_LIMITS.CHAT_MESSAGE).toBeDefined();
      expect(RATE_LIMITS.API_DEFAULT).toBeDefined();
      expect(RATE_LIMITS.AUTH).toBeDefined();
      expect(RATE_LIMITS.LLM_GLOBAL).toBeDefined();
    });

    it('should have appropriate limits for different endpoints', () => {
      // API_DEFAULT should have highest limit
      expect(RATE_LIMITS.API_DEFAULT.maxRequests).toBeGreaterThan(
        RATE_LIMITS.AUTH.maxRequests,
      );

      // AUTH should have lowest limit (most restrictive)
      expect(RATE_LIMITS.AUTH.maxRequests).toBeLessThanOrEqual(
        RATE_LIMITS.CHAT_MESSAGE.maxRequests,
      );
    });
  });
});
