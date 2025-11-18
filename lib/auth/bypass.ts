'use client';

import { TEST_AUTH_STORAGE_KEY } from '@/lib/constants/test-auth';

export const BYPASS_ACCESS_TOKEN = 'bypass-token';
export const BYPASS_CSRF_TOKEN = 'bypass-csrf-token';

// Only allow bypass in non-production environments
const isTestEnvironment = () => {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE === 'true'
  );
};

export function hasClientBypassFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Never allow bypass in production
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE !== 'true'
  ) {
    return false;
  }

  // Check window flag only in test environments
  if (isTestEnvironment() && window.__BYPASS_AUTH__ === true) {
    return true;
  }

  try {
    // Check localStorage only in test environments
    return (
      isTestEnvironment() &&
      window.localStorage.getItem(TEST_AUTH_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

export function isBypassAuthEnabled(): boolean {
  // Never allow bypass in production unless explicitly enabled for testing
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_TEST_AUTH_MODE !== 'true'
  ) {
    return false;
  }

  return (
    process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true' || hasClientBypassFlag()
  );
}
