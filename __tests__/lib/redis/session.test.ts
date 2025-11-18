import * as sessionOps from '@/lib/redis/session';
import { getRedisClient } from '@/lib/redis/client';
import { sessionKey, userSessionsKey } from '@/lib/redis/keys';
import type { SessionModel } from '@/types/models';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

const mockRedis = {
  setex: jest.fn(),
  sadd: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  srem: jest.fn(),
};

(getRedisClient as jest.Mock).mockReturnValue(mockRedis);

const buildSessionRecord = (overrides: Partial<SessionModel> = {}): SessionModel => ({
  id: 'session-123',
  userId: 'user-123',
  csrfToken: 'csrf',
  data: {
    lastActivityAt: new Date(),
  },
  expiresAt: new Date(Date.now() + 3600_000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('Redis Session Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  describe('createSession', () => {
    it('persists session with TTL and user mapping', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.sadd.mockResolvedValue(1);

      const session = await sessionOps.createSession('user-123', { userAgent: 'jest' });

      expect(session.userId).toBe('user-123');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        sessionKey(session.id),
        expect.any(Number),
        expect.stringContaining('"userId":"user-123"'),
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        userSessionsKey(session.userId),
        session.id,
      );
    });
  });

  describe('getSession', () => {
    it('hydrates stored session payloads', async () => {
      const stored = buildSessionRecord();
      mockRedis.get.mockResolvedValue(JSON.stringify(stored));

      const session = await sessionOps.getSession(stored.id);

      expect(session?.id).toBe(stored.id);
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.data.lastActivityAt).toBeInstanceOf(Date);
    });
  });

  describe('updateSession', () => {
    it('updates existing session values', async () => {
      const stored = buildSessionRecord();
      mockRedis.get.mockResolvedValue(JSON.stringify(stored));
      mockRedis.setex.mockResolvedValue('OK');

      const updated = await sessionOps.updateSession(stored.id, {
        data: { ...stored.data, userAgent: 'jest' },
      });

      expect(updated).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        sessionKey(stored.id),
        expect.any(Number),
        expect.stringContaining('"userAgent":"jest"'),
      );
    });
  });

  describe('deleteSession', () => {
    it('removes session and user reference', async () => {
      const stored = buildSessionRecord();
      mockRedis.get.mockResolvedValue(JSON.stringify(stored));
      mockRedis.del.mockResolvedValue(1);
      mockRedis.srem.mockResolvedValue(1);

      const removed = await sessionOps.deleteSession(stored.id);

      expect(removed).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith(sessionKey(stored.id));
      expect(mockRedis.srem).toHaveBeenCalledWith(
        userSessionsKey(stored.userId),
        stored.id,
      );
    });
  });
});
