import type { NextRequest } from 'next/server';

import {
  TEST_AUTH_COOKIE_NAME,
  TEST_AUTH_COOKIE_VALUE,
  TEST_AUTH_HEADER_NAME,
} from '@/lib/constants/test-auth';

const TEST_AUTH_ENV_FLAG = 'TEST_AUTH_MODE';

export function isTestAuthModeEnabled(): boolean {
  return process.env[TEST_AUTH_ENV_FLAG] === 'true';
}

export function isTestAuthRequest(request: NextRequest): boolean {
  if (!isTestAuthModeEnabled()) {
    return false;
  }

  const cookieValue = request.cookies.get(TEST_AUTH_COOKIE_NAME)?.value;
  if (cookieValue === TEST_AUTH_COOKIE_VALUE) {
    return true;
  }

  const headerValue = request.headers.get(TEST_AUTH_HEADER_NAME);
  return headerValue?.toLowerCase() === 'true';
}

export function shouldBypassAuth(request: NextRequest): boolean {
  // SECURITY (CRIT-02): Never allow bypass in production
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (process.env.BYPASS_AUTH === 'true') {
    return true;
  }

  return isTestAuthRequest(request);
}

export function getTestAuthCookieName(): string {
  return TEST_AUTH_COOKIE_NAME;
}
