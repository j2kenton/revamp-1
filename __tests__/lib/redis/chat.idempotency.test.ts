/**
 * Regression coverage for the idempotency data layer's real Redis behavior.
 *
 * `chat.test.ts` (and the route-level tests in
 * `__tests__/app/api/chat/stream/route.test.ts`) mock every function this
 * module exports, which proves callers pass the right arguments but never
 * exercises the Lua scripts themselves — a broken fence (e.g. an inverted
 * comparison, or a script that writes before checking the token) would pass
 * every one of those suites while silently defeating the guarantee the whole
 * mechanism exists to provide.
 *
 * This file runs the same functions against `ioredis-mock`, a real (if
 * in-memory) Redis implementation that actually executes `EVAL`/Lua, `SET
 * ... NX EX`, `EXPIRE`, `TTL`, etc. A stale-token write here is rejected (or
 * accepted) by Redis's own scripting engine, not by a jest mock standing in
 * for one.
 */
import * as chatOps from '@/lib/redis/chat';
import { getRedisClient } from '@/lib/redis/client';
import type { MessageModel } from '@/types/models';
// @ts-expect-error - ioredis-mock does not publish TypeScript definitions
import RedisMock from 'ioredis-mock';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

const redis = new RedisMock();
(getRedisClient as jest.Mock).mockReturnValue(redis);

const USER_ID = 'user-1';
const IDEMPOTENCY_KEY = 'client-temp-key-1';

const baseMessage = (id: string): MessageModel => ({
  id,
  chatId: 'chat-1',
  role: 'user',
  content: 'Hello',
  status: 'sent',
  parentMessageId: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const baseRecord = (): chatOps.StreamIdempotencyRecord => ({
  chatId: 'chat-1',
  userMessageId: 'msg-1',
  truncated: false,
  removedCount: 0,
});

describe('Idempotency data layer (real ioredis-mock, not mocked helpers)', () => {
  beforeEach(async () => {
    await redis.flushall();
  });

  describe('acquireStreamIdempotencyLock', () => {
    it('acquires a fresh lock with a real TTL when none is held', async () => {
      const lock = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );

      expect(lock).not.toBeNull();
      expect(typeof lock?.token).toBe('string');

      // The name of this test is a claim about the TTL specifically — the
      // module's own doc comment calls out a lock written without one
      // (e.g. a SETNX+EXPIRE pair split across two round trips, crashing
      // in between) as the exact failure mode `acquireStreamIdempotencyLock`
      // exists to avoid; only actually reading it back proves that.
      const [key] = await redis.keys('idempotency:stream:lock:*');
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(
        chatOps.STREAM_IDEMPOTENCY_LOCK_TTL_SECONDS,
      );
    });

    it('refuses to acquire while another holder still holds the lock', async () => {
      const first = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(first).not.toBeNull();

      const second = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );

      expect(second).toBeNull();
    });

    it('can be reacquired by a new holder once the previous one releases', async () => {
      const first = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(first).not.toBeNull();

      await chatOps.releaseStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        first!.token,
      );

      const second = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );

      expect(second).not.toBeNull();
      expect(second?.token).not.toBe(first?.token);
    });
  });

  describe('releaseStreamIdempotencyLock', () => {
    it('does not release a lock whose current token no longer matches', async () => {
      const first = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(first).not.toBeNull();

      // Simulate the original holder's lease having already expired and
      // been reclaimed by someone else before its own (stale) release call
      // finally lands.
      await chatOps.releaseStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        first!.token,
      );
      const reclaimer = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(reclaimer).not.toBeNull();

      // The original holder's (stale) release call finally arrives.
      await chatOps.releaseStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        first!.token,
      );

      // Must not have deleted the reclaimer's lock: no one should be able
      // to acquire it again right now.
      const thirdAttempt = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(thirdAttempt).toBeNull();
    });
  });

  describe('renewStreamIdempotencyLock', () => {
    it('extends the TTL for a matching token', async () => {
      const lock = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lock).not.toBeNull();

      // Force the TTL down first so a real extension is unambiguous.
      const [key] = await redis.keys('idempotency:stream:lock:*');
      await redis.expire(key, 1);

      const renewed = await chatOps.renewStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        lock!.token,
      );

      expect(renewed).toBe(true);
      const ttlAfter = await redis.ttl(key);
      expect(ttlAfter).toBeGreaterThan(1);
    });

    it('reports failure and leaves the TTL untouched for a stale token', async () => {
      const lock = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lock).not.toBeNull();

      const [key] = await redis.keys('idempotency:stream:lock:*');
      await redis.expire(key, 1);
      const ttlBefore = await redis.ttl(key);

      const renewed = await chatOps.renewStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        'some-other-holders-token',
      );

      expect(renewed).toBe(false);
      const ttlAfter = await redis.ttl(key);
      expect(ttlAfter).toBeLessThanOrEqual(ttlBefore);
    });
  });

  describe('persistMessageWithIdempotencyRecord (fenced write)', () => {
    it('commits the message and the record together when the token matches', async () => {
      const lock = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lock).not.toBeNull();

      const message = baseMessage('msg-1');
      const ok = await chatOps.persistMessageWithIdempotencyRecord(
        'chat-1',
        message,
        USER_ID,
        IDEMPOTENCY_KEY,
        baseRecord(),
        lock!.token,
      );

      expect(ok).toBe(true);

      const messages = await chatOps.getChatMessages('chat-1');
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg-1');

      const lookup = await chatOps.getStreamIdempotencyRecord(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lookup).toEqual({ status: 'found', record: baseRecord() });
    });

    it('rejects the write without persisting anything when the token is stale', async () => {
      const originalHolder = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(originalHolder).not.toBeNull();

      // Original holder's lease is gone (expired/reclaimed) by the time its
      // write actually reaches Redis: release it and let a new request
      // acquire the lock in its place, exactly as would happen if the
      // original renewal had failed to keep up.
      await chatOps.releaseStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        originalHolder!.token,
      );
      const newHolder = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(newHolder).not.toBeNull();
      expect(newHolder!.token).not.toBe(originalHolder!.token);

      // The original (stale) holder's write finally lands, still carrying
      // its own now-invalid token.
      const message = baseMessage('msg-stale');
      const ok = await chatOps.persistMessageWithIdempotencyRecord(
        'chat-1',
        message,
        USER_ID,
        IDEMPOTENCY_KEY,
        baseRecord(),
        originalHolder!.token,
      );

      expect(ok).toBe(false);

      // Nothing from the rejected write may exist: no message, no record.
      const messages = await chatOps.getChatMessages('chat-1');
      expect(messages).toHaveLength(0);

      const lookup = await chatOps.getStreamIdempotencyRecord(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lookup).toEqual({ status: 'not_found' });
    });
  });

  describe('getStreamIdempotencyRecord (tri-state lookup)', () => {
    it('returns not_found when no record has ever been written', async () => {
      const lookup = await chatOps.getStreamIdempotencyRecord(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lookup).toEqual({ status: 'not_found' });
    });

    it('returns error (never not_found) when the stored value is corrupted', async () => {
      const lock = await chatOps.acquireStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      const ok = await chatOps.persistMessageWithIdempotencyRecord(
        'chat-1',
        baseMessage('msg-1'),
        USER_ID,
        IDEMPOTENCY_KEY,
        baseRecord(),
        lock!.token,
      );
      expect(ok).toBe(true);
      await chatOps.releaseStreamIdempotencyLock(
        USER_ID,
        IDEMPOTENCY_KEY,
        lock!.token,
      );

      // Locate the real record key without hardcoding its private format —
      // only the lock key remains prefixed distinctly, so filter it out.
      const allKeys: string[] = await redis.keys('idempotency:stream:*');
      const recordKeys = allKeys.filter(
        (key) => !key.startsWith('idempotency:stream:lock:'),
      );
      expect(recordKeys).toHaveLength(1);
      await redis.set(recordKeys[0], '{not valid json', 'EX', 3600);

      const lookup = await chatOps.getStreamIdempotencyRecord(
        USER_ID,
        IDEMPOTENCY_KEY,
      );
      expect(lookup).toEqual({ status: 'error' });
    });

    it('returns error (never not_found) when the read itself fails', async () => {
      jest
        .spyOn(redis, 'get')
        .mockRejectedValueOnce(new Error('connection reset'));

      const lookup = await chatOps.getStreamIdempotencyRecord(
        USER_ID,
        IDEMPOTENCY_KEY,
      );

      expect(lookup).toEqual({ status: 'error' });
    });

    describe('shape validation (valid JSON, wrong structure)', () => {
      // `JSON.parse` alone accepts any of these — none of them throw a
      // SyntaxError — so only runtime shape validation catches them. An
      // unvalidated `as StreamIdempotencyRecord` cast would let one of
      // these through as `status: 'found'`, and either crash on the first
      // field access deep inside `resolveIdempotentSend`/the route, or —
      // worse, no crash at all for something like `{}` — silently read as
      // "a real record with no outcome yet," letting a corrupted record be
      // treated as a legitimate, resumable one.
      const writeRawRecord = async (value: unknown) => {
        const lock = await chatOps.acquireStreamIdempotencyLock(
          USER_ID,
          IDEMPOTENCY_KEY,
        );
        const ok = await chatOps.persistMessageWithIdempotencyRecord(
          'chat-1',
          baseMessage('msg-1'),
          USER_ID,
          IDEMPOTENCY_KEY,
          baseRecord(),
          lock!.token,
        );
        expect(ok).toBe(true);
        await chatOps.releaseStreamIdempotencyLock(
          USER_ID,
          IDEMPOTENCY_KEY,
          lock!.token,
        );

        const allKeys: string[] = await redis.keys('idempotency:stream:*');
        const recordKeys = allKeys.filter(
          (key) => !key.startsWith('idempotency:stream:lock:'),
        );
        expect(recordKeys).toHaveLength(1);
        await redis.set(
          recordKeys[0],
          JSON.stringify(value),
          'EX',
          3600,
        );
      };

      it('returns error for null', async () => {
        await writeRawRecord(null);
        const lookup = await chatOps.getStreamIdempotencyRecord(
          USER_ID,
          IDEMPOTENCY_KEY,
        );
        expect(lookup).toEqual({ status: 'error' });
      });

      it('returns error for an empty object', async () => {
        await writeRawRecord({});
        const lookup = await chatOps.getStreamIdempotencyRecord(
          USER_ID,
          IDEMPOTENCY_KEY,
        );
        expect(lookup).toEqual({ status: 'error' });
      });

      it('returns error for a record whose outcome is missing required fields', async () => {
        await writeRawRecord({
          chatId: 'chat-1',
          userMessageId: 'msg-1',
          truncated: false,
          removedCount: 0,
          // Missing `messageId`/`content` — a caller trusting this as a
          // real completed outcome would replay it with `undefined` IDs.
          outcome: { kind: 'complete' },
        });
        const lookup = await chatOps.getStreamIdempotencyRecord(
          USER_ID,
          IDEMPOTENCY_KEY,
        );
        expect(lookup).toEqual({ status: 'error' });
      });

      it('returns error for a record with wrong-typed fields', async () => {
        await writeRawRecord({
          chatId: 'chat-1',
          userMessageId: 'msg-1',
          truncated: 'false', // string, not boolean
          removedCount: 0,
        });
        const lookup = await chatOps.getStreamIdempotencyRecord(
          USER_ID,
          IDEMPOTENCY_KEY,
        );
        expect(lookup).toEqual({ status: 'error' });
      });
    });
  });
});
