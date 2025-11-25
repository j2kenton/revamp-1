'use client';

import { TEST_AUTH_STORAGE_KEY } from '@/lib/constants/test-auth';

export const BYPASS_ACCESS_TOKEN = 'bypass-token';
export const BYPASS_CSRF_TOKEN = 'bypass-csrf-token';

// SECURITY (CRIT-02): Only allow bypass in test/development environments
const isTestEnvironment = (): boolean => {
  // Never allow bypass in production - no exceptions
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return (
    process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development'
  );
};

export function hasClientBypassFlag(): boolean {
  // SECURITY (CRIT-02): Never allow bypass in production
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  // Check window flag only in test/development environments
  if (isTestEnvironment() && window.__BYPASS_AUTH__ === true) {
    return true;
  }

  try {
    // Check localStorage only in test/development environments
    return (
      isTestEnvironment() &&
      window.localStorage.getItem(TEST_AUTH_STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

export function isBypassAuthEnabled(): boolean {
  // SECURITY (CRIT-02, CRIT-03): Never allow bypass in production
  // Removed dependency on NEXT_PUBLIC_* variables which could be exposed to client
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  return hasClientBypassFlag();
}
