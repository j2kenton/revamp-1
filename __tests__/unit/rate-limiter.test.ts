import type { Redis } from 'ioredis';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter';

type RedisMock = {
  zremrangebyscore: jest.Mock;
  zcard: jest.Mock;
  zadd: jest.Mock;
  expire: jest.Mock;
  zrange: jest.Mock;
};

const createRedisMock = (
  overrides: Partial<RedisMock> = {},
): RedisMock => ({
  zremrangebyscore: jest.fn().mockResolvedValue(0),
  zcard: jest.fn().mockResolvedValue(0),
  zadd: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  zrange: jest.fn().mockResolvedValue([]),
  ...overrides,
});

describe('checkRateLimit', () => {
  it('allows requests under the configured limit', async () => {
    const redis = createRedisMock();

    const result = await checkRateLimit(
      redis as unknown as Redis,
      'user:1',
      RATE_LIMITS.API_DEFAULT,
    );

    expect(result.allowed).toBe(true);
    expect(redis.zadd).toHaveBeenCalled();
  });

  it('blocks requests when limit is exceeded', async () => {
    const redis = createRedisMock({
      zcard: jest.fn().mockResolvedValue(RATE_LIMITS.API_DEFAULT.maxRequests),
      zrange: jest
        .fn()
        .mockResolvedValue(['entry', `${Date.now() - 1_000}`]),
    });

    const result = await checkRateLimit(
      redis as unknown as Redis,
      'user:1',
      RATE_LIMITS.API_DEFAULT,
    );

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('fails open when Redis errors occur', async () => {
    const redis = createRedisMock({
      zremrangebyscore: jest.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await checkRateLimit(
      redis as unknown as Redis,
      'user:1',
      RATE_LIMITS.API_DEFAULT,
    );

    expect(result.allowed).toBe(true);
  });
});
