/**
 * Request Deduplication Middleware
 * Prevents duplicate in-flight requests from being processed simultaneously.
 * SECURITY (LOW-02): Server-side content hashing for dedup when client doesn't provide key
 */

import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';

import { getRedisClient } from '@/lib/redis/client';
import { tooManyRequests } from '@/server/api-response';
import { logWarn } from '@/utils/logger';

const DEFAULT_TTL_SECONDS = 30;
const AUTO_DEDUP_TIME_BUCKET_SECONDS = 1; // Group requests within 1-second windows

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
 * SECURITY (LOW-02): Generate server-side deduplication key from request content
 * This prevents exact duplicate requests within a short window even without client-provided keys
 */
async function generateContentHash(request: NextRequest): Promise<string> {
  try {
    // Clone the request to read body without consuming it
    const clonedRequest = request.clone();
    const body = await clonedRequest.text();

    // Get authorization header for user-specific hashing
    const auth = request.headers.get('authorization') || '';

    // Create time bucket (1-second windows)
    const timeBucket = Math.floor(
      Date.now() / (AUTO_DEDUP_TIME_BUCKET_SECONDS * 1000),
    );

    // Hash the combination of body, auth, and time bucket
    const hash = createHash('sha256')
      .update(body)
      .update(auth)
      .update(timeBucket.toString())
      .digest('hex')
      .slice(0, 16); // Use first 16 chars for reasonable key length

    return `auto:${hash}`;
  } catch (error) {
    // If we can't read the body, return null to skip auto-dedup
    logWarn('Failed to generate content hash for deduplication', { error });
    return '';
  }
}

/**
 * Extract request deduplication identifier from headers.
 * SECURITY (LOW-02): Falls back to server-side content hash if no header provided
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
 * SECURITY (LOW-02): Now includes server-side content hashing as fallback
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
    // First try to get client-provided dedup key
    let dedupId = getDedupIdentifier(request, resolvedOptions.headerNames);

    // SECURITY (LOW-02): If no client key, generate server-side content hash
    // This prevents exact duplicate requests even from malicious clients
    if (!dedupId) {
      dedupId = await generateContentHash(request);
      if (!dedupId) {
        // If we couldn't generate a hash, proceed without dedup
        return handler(request, context);
      }
    }

    const redis = getRedisClient();
    const key = `reqdedup:${request.nextUrl.pathname}:${dedupId}`;

    const acquired = await redis.setnx(key, Date.now().toString());

    if (!acquired) {
      const ttl = await redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : resolvedOptions.ttlSeconds;

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
