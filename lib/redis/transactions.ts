/**
 * Redis Transaction Support
 * Provides transaction-like behavior for atomic operations
 */

import { getRedisClient } from './client';
import { logError, logWarn } from '@/utils/logger';

/**
 * Transaction context for tracking operations
 */
interface TransactionContext {
  id: string;
  operations: Array<{
    type: 'set' | 'del' | 'sadd' | 'srem' | 'incr' | 'decr';
    key: string;
    value?: string | number;
    ttl?: number;
  }>;
  rollbackOperations: Array<() => Promise<void>>;
  committed: boolean;
}

/**
 * Create a new transaction context
 */
export function createTransaction(): TransactionContext {
  return {
    id: `txn_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    operations: [],
    rollbackOperations: [],
    committed: false,
  };
}

/**
 * Execute a function within a transaction with automatic rollback on error
 */
export async function withTransaction<T>(
  fn: (ctx: TransactionContext) => Promise<T>
): Promise<T> {
  const ctx = createTransaction();

  try {
    const result = await fn(ctx);
    await commitTransaction(ctx);
    return result;
  } catch (error) {
    logError('Transaction failed, rolling back', error, { txnId: ctx.id });
    await rollbackTransaction(ctx);
    throw error;
  }
}

/**
 * Set a value within a transaction
 */
export async function txSet(
  ctx: TransactionContext,
  key: string,
  value: string,
  ttl?: number
): Promise<void> {
  if (ctx.committed) {
    throw new Error('Cannot perform operations on committed transaction');
  }

  const redis = getRedisClient();

  // Store the old value for rollback
  const oldValue = await redis.get(key);
  const oldTtl = oldValue ? await redis.ttl(key) : -1;

  // Perform the operation
  if (ttl) {
    await redis.setex(key, ttl, value);
  } else {
    await redis.set(key, value);
  }

  // Track the operation
  ctx.operations.push({ type: 'set', key, value, ttl });

  // Add rollback operation
  ctx.rollbackOperations.push(async () => {
    if (oldValue !== null) {
      // Restore old value
      if (oldTtl > 0) {
        await redis.setex(key, oldTtl, oldValue);
      } else {
        await redis.set(key, oldValue);
      }
    } else {
      // Delete the key if it didn't exist before
      await redis.del(key);
    }
  });
}

/**
 * Delete a key within a transaction
 */
export async function txDel(
  ctx: TransactionContext,
  key: string
): Promise<void> {
  if (ctx.committed) {
    throw new Error('Cannot perform operations on committed transaction');
  }

  const redis = getRedisClient();

  // Store the old value for rollback
  const oldValue = await redis.get(key);
  const oldTtl = oldValue ? await redis.ttl(key) : -1;

  // Perform the operation
  await redis.del(key);

  // Track the operation
  ctx.operations.push({ type: 'del', key });

  // Add rollback operation
  if (oldValue !== null) {
    ctx.rollbackOperations.push(async () => {
      if (oldTtl > 0) {
        await redis.setex(key, oldTtl, oldValue);
      } else {
        await redis.set(key, oldValue);
      }
    });
  }
}

/**
 * Add member to set within a transaction
 */
export async function txSAdd(
  ctx: TransactionContext,
  key: string,
  member: string
): Promise<void> {
  if (ctx.committed) {
    throw new Error('Cannot perform operations on committed transaction');
  }

  const redis = getRedisClient();

  // Check if member already exists
  const exists = await redis.sismember(key, member);

  // Perform the operation
  await redis.sadd(key, member);

  // Track the operation
  ctx.operations.push({ type: 'sadd', key, value: member });

  // Add rollback operation
  if (!exists) {
    ctx.rollbackOperations.push(async () => {
      await redis.srem(key, member);
    });
  }
}

/**
 * Remove member from set within a transaction
 */
export async function txSRem(
  ctx: TransactionContext,
  key: string,
  member: string
): Promise<void> {
  if (ctx.committed) {
    throw new Error('Cannot perform operations on committed transaction');
  }

  const redis = getRedisClient();

  // Check if member exists
  const exists = await redis.sismember(key, member);

  // Perform the operation
  await redis.srem(key, member);

  // Track the operation
  ctx.operations.push({ type: 'srem', key, value: member });

  // Add rollback operation
  if (exists) {
    ctx.rollbackOperations.push(async () => {
      await redis.sadd(key, member);
    });
  }
}

/**
 * Commit a transaction (mark as completed)
 */
export async function commitTransaction(
  ctx: TransactionContext
): Promise<void> {
  if (ctx.committed) {
    logWarn('Transaction already committed', { txnId: ctx.id });
    return;
  }

  ctx.committed = true;
  // Clear rollback operations since we're committing
  ctx.rollbackOperations = [];
}

/**
 * Rollback a transaction
 */
export async function rollbackTransaction(
  ctx: TransactionContext
): Promise<void> {
  if (ctx.committed) {
    throw new Error('Cannot rollback committed transaction');
  }

  // Execute rollback operations in reverse order
  for (let i = ctx.rollbackOperations.length - 1; i >= 0; i--) {
    try {
      await ctx.rollbackOperations[i]();
    } catch (error) {
      logError('Rollback operation failed', error, {
        txnId: ctx.id,
        operationIndex: i,
      });
      // Continue with other rollback operations even if one fails
    }
  }

  ctx.operations = [];
  ctx.rollbackOperations = [];
}

/**
 * Optimistic locking for concurrent edit protection
 */
export async function withOptimisticLock<T>(
  key: string,
  fn: (value: string | null, version: number) => Promise<T>
): Promise<T> {
  const redis = getRedisClient();
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Watch the key for changes
      await redis.watch(key);

      // Get current value and version
      const value = await redis.get(key);
      const versionKey = `${key}:version`;
      const version = parseInt((await redis.get(versionKey)) || '0', 10);

      // Execute the function
      const result = await fn(value, version);

      // Try to update with MULTI/EXEC
      const multi = redis.multi();

      // Increment version
      multi.set(versionKey, (version + 1).toString());

      const execResult = await multi.exec();

      if (execResult === null) {
        // Transaction failed due to concurrent modification
        retries++;
        if (retries >= maxRetries) {
          throw new Error(
            'Optimistic lock failed: too many concurrent modifications'
          );
        }
        // Retry
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
        continue;
      }

      return result;
    } catch (error) {
      await redis.unwatch();
      throw error;
    }
  }

  throw new Error('Optimistic lock failed: max retries exceeded');
}
