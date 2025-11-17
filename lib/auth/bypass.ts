'use client';

import { TEST_AUTH_STORAGE_KEY } from '@/lib/constants/test-auth';

export const BYPASS_ACCESS_TOKEN = 'bypass-token';
export const BYPASS_CSRF_TOKEN = 'bypass-csrf-token';

export function hasClientBypassFlag(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (window.__BYPASS_AUTH__ === true) {
    return true;
  }

  try {
    return window.localStorage.getItem(TEST_AUTH_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function isBypassAuthEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true' ||
    hasClientBypassFlag()
  );
}
