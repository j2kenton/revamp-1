import { NextResponse } from 'next/server';

import { getRedisClient } from '@/lib/redis/client';
import { isTestAuthModeEnabled } from '@/server/utils/test-auth';
import { logWarn } from '@/utils/logger';

const NOT_FOUND_STATUS = 404;

/**
 * Test-support endpoint: clears rate-limit state between E2E tests.
 *
 * The Playwright suite drives one shared test identity through a single dev
 * server backed by the in-memory Redis mock. The app issues several
 * rate-limited requests per user action (list fetch, stream POST, invalidation
 * refetch, history fetch), so a handful of tests exhaust the shared
 * per-identity windows and unrelated tests start seeing 429s. Resetting the
 * buckets in each test's setup gives every test a deterministic rate budget.
 *
 * Safety: this only exists for the mocked test stack — it 404s unless
 * TEST_AUTH_MODE is on, the process is not production, and MOCK_REDIS is
 * active (so it can never delete keys from a real Redis).
 */
const isResetAllowed = (): boolean =>
  isTestAuthModeEnabled() &&
  process.env.NODE_ENV !== 'production' &&
  process.env.MOCK_REDIS === 'true';

const RATE_LIMIT_KEY_PATTERNS = [
  'ratelimit:*',
  'lockout:*',
  'attempts:*',
] as const;

export async function POST(): Promise<Response> {
  if (!isResetAllowed()) {
    return NextResponse.json(
      {
        error: {
          code: 'test_support_disabled',
          message: 'Test-support rate-limit reset is not available.',
        },
      },
      { status: NOT_FOUND_STATUS },
    );
  }

  try {
    const redis = getRedisClient();
    let cleared = 0;

    for (const pattern of RATE_LIMIT_KEY_PATTERNS) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        cleared += await redis.del(...keys);
      }
    }

    return NextResponse.json({
      data: {
        message: 'Rate limit state cleared',
        cleared,
      },
    });
  } catch (error) {
    // Test infrastructure only: a failed reset must not crash the dev server.
    logWarn('Failed to clear rate limit state for tests', { error });
    return NextResponse.json(
      {
        error: {
          code: 'reset_failed',
          message: 'Failed to clear rate limit state.',
        },
      },
      { status: 500 },
    );
  }
}
