/**
 * Request Deduplication Middleware
 * Prevents duplicate in-flight requests from being processed simultaneously.
 */

import type { NextRequest } from 'next/server';

import { getRedisClient } from '@/lib/redis/client';
import { tooManyRequests } from '@/server/api-response';
import { logWarn } from '@/utils/logger';

const DEFAULT_TTL_SECONDS = 30;
const TTL_THRESHOLD = 0;

interface RequestDedupOptions {
  /**
   * TTL for the deduplication lock (in seconds)
   */
  ttlSeconds?: number;

  /**
   * Headers inspected for deduplication keys
   */
  headerNames?: string[];
}

const DEFAULT_OPTIONS: Required<RequestDedupOptions> = {
  ttlSeconds: DEFAULT_TTL_SECONDS,
  headerNames: ['x-idempotency-key', 'x-request-id'],
};

/**
 * Extract request deduplication identifier from headers.
 */
function getDedupIdentifier(
  request: NextRequest,
  headerNames: string[],
): string | null {
  for (const header of headerNames) {
    const value = request.headers.get(header);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Wrap a route handler with request deduplication logic.
 * Rejects duplicate requests with the same identifier that arrive within the TTL window.
 */
export function withRequestDedup(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
  options: RequestDedupOptions = {},
): (request: NextRequest, context?: unknown) => Promise<Response> {
  const resolvedOptions: Required<RequestDedupOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return async (request: NextRequest, context?: unknown) => {
    const dedupId = getDedupIdentifier(request, resolvedOptions.headerNames);

    if (!dedupId) {
      return handler(request, context);
    }

    const redis = getRedisClient();
    const key = `reqdedup:${request.nextUrl.pathname}:${dedupId}`;

    const acquired = await redis.setnx(key, Date.now().toString());

    if (!acquired) {
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > TTL_THRESHOLD ? ttl : resolvedOptions.ttlSeconds;

      logWarn('Duplicate request blocked', {
        dedupId,
        path: request.nextUrl.pathname,
      });

      return tooManyRequests(
        'Duplicate request detected. Please wait before retrying.',
        {
          retryAfter,
          dedupId,
        },
      );
    }

    await redis.expire(key, resolvedOptions.ttlSeconds);

    try {
      const response = await handler(request, context);
      return response;
    } finally {
      await redis.del(key).catch(() => undefined);
    }
  };
}
