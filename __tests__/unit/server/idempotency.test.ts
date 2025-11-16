import { checkIdempotency, storeIdempotencyKey } from '@/server/middleware/idempotency';

const redisMocks = {
  get: jest.fn(),
  setex: jest.fn(),
  setEx: jest.fn(),
};

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: () => redisMocks,
}));

describe('idempotency middleware', () => {
  const userId = 'user-123';
  const key = 'req-456';
  const redisKey = `idempotency:${userId}:${key}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkIdempotency', () => {
    it('returns null when cache miss', async () => {
      redisMocks.get.mockResolvedValue(null);
      const result = await checkIdempotency(userId, key);
      expect(redisMocks.get).toHaveBeenCalledWith(redisKey);
      expect(result).toBeNull();
    });

    it('returns parsed payload when hit', async () => {
      const payload = { data: { messageId: 'msg-1' } };
      redisMocks.get.mockResolvedValue(JSON.stringify(payload));
      const result = await checkIdempotency<typeof payload>(userId, key);
      expect(result).toEqual(payload);
    });

    it('fails open when redis throws', async () => {
      redisMocks.get.mockRejectedValue(new Error('oops'));
      const result = await checkIdempotency(userId, key);
      expect(result).toBeNull();
    });
  });

  describe('storeIdempotencyKey', () => {
    it('persists payload with ttl', async () => {
      const payload = { ok: true };
      redisMocks.setex.mockResolvedValue('OK');
      await storeIdempotencyKey(userId, key, payload);
      expect(redisMocks.setex).toHaveBeenCalledWith(
        redisKey,
        86400,
        JSON.stringify(payload),
      );
    });

    it('uses setEx when available', async () => {
      const payload = { ok: true };
      redisMocks.setex.mockRejectedValueOnce(new Error('unsupported'));
      redisMocks.setEx.mockResolvedValue('OK');
      await storeIdempotencyKey(userId, key, payload, 120);
      expect(redisMocks.setEx).toHaveBeenCalledWith(
        redisKey,
        120,
        JSON.stringify(payload),
      );
    });

    it('swallows redis errors', async () => {
      redisMocks.setex.mockRejectedValue(new Error('down'));
      redisMocks.setEx.mockRejectedValue(new Error('down'));
      await expect(
        storeIdempotencyKey(userId, key, { ok: true }),
      ).resolves.not.toThrow();
    });
  });
});
