import {
  withTransaction,
  txSet,
} from '@/lib/redis/transactions';
import { getRedisClient } from '@/lib/redis/client';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

type RedisMock = ReturnType<typeof createRedisMock>;

function createRedisMock() {
  return {
    get: jest.fn(),
    ttl: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    sismember: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
  };
}

let redisMock: RedisMock;

describe('Redis transactions', () => {
  beforeEach(() => {
    redisMock = createRedisMock();
    (getRedisClient as jest.Mock).mockReturnValue(redisMock);
  });

  it('commits operations when the transaction succeeds', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.set.mockResolvedValue('OK');

    const result = await withTransaction(async (ctx) => {
      await txSet(ctx, 'chat:key', JSON.stringify({ value: 1 }));
      return 'committed';
    });

    expect(result).toBe('committed');
    expect(redisMock.set).toHaveBeenCalledWith(
      'chat:key',
      expect.stringContaining('"value":1'),
    );
  });

  it('rolls back writes when the transaction throws', async () => {
    redisMock.get.mockResolvedValueOnce('{"value":0}');
    redisMock.ttl.mockResolvedValueOnce(120);
    redisMock.set.mockResolvedValue('OK');
    redisMock.setex.mockResolvedValue('OK');
    redisMock.del.mockResolvedValue(1);

    await expect(
      withTransaction(async (ctx) => {
        await txSet(ctx, 'chat:key', JSON.stringify({ value: 2 }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(redisMock.setex).toHaveBeenCalledWith('chat:key', 120, '{"value":0}');
  });
});
