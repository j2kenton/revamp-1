/**
 * Idempotency helpers for API requests.
 * Stores responses keyed by user + idempotency key for a limited time.
 */

import { getRedisClient } from '@/lib/redis/client';
import { logWarn } from '@/utils/logger';

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function buildRedisKey(userId: string, key: string): string {
  return `idempotency:${userId}:${key}`;
}

export async function checkIdempotency<T>(
  userId: string,
  idempotencyKey: string,
): Promise<T | null> {
  const redis = getRedisClient();
  const key = buildRedisKey(userId, idempotencyKey);

  try {
    const cached = await redis.get(key);
    if (!cached) {
      return null;
    }

    return JSON.parse(cached) as T;
  } catch (error) {
    logWarn('Idempotency lookup failed', { userId, idempotencyKey, error });
    return null;
  }
}

export async function storeIdempotencyKey(
  userId: string,
  idempotencyKey: string,
  payload: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const redis = getRedisClient();
  const key = buildRedisKey(userId, idempotencyKey);
  const serialized = JSON.stringify(payload);

  try {
    const client = redis as typeof redis & {
      setEx?: (k: string, ttl: number, value: string) => Promise<'OK' | null>;
      setex?: (k: string, ttl: number, value: string) => Promise<'OK' | null>;
    };
    const strategies: Array<
      (redisKey: string, ttl: number, value: string) => Promise<'OK' | null>
    > = [];

    if (typeof client.setex === 'function') {
      strategies.push(client.setex.bind(client));
    }
    if (typeof client.setEx === 'function') {
      strategies.push(client.setEx.bind(client));
    }

    if (strategies.length === 0) {
      throw new Error('Redis client missing TTL command');
    }

    let lastError: unknown = null;

    for (const handler of strategies) {
      try {
        await handler(key, ttlSeconds, serialized);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  } catch (error) {
    logWarn('Failed to store idempotency payload', { userId, idempotencyKey, error });
  }
}
