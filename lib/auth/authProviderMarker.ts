/**
 * Auth Provider Marker
 * Tracks which identity provider the user last signed in with so that a
 * stale/cached Microsoft or Google session isn't silently resurrected after
 * the user has explicitly switched providers or signed out.
 */

'use client';

export type AuthProviderId = 'microsoft' | 'google';
export type AuthProviderMarker = AuthProviderId | 'signed-out';

const MARKER_KEY = 'auth:lastProvider';
const LAST_GOOGLE_SUB_KEY = 'auth:lastGoogleSub';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getAuthProviderMarker(): AuthProviderMarker | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  const value = storage.getItem(MARKER_KEY);
  if (value === 'microsoft' || value === 'google' || value === 'signed-out') {
    return value;
  }
  return null;
}

export function setAuthProviderMarker(marker: AuthProviderMarker): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(MARKER_KEY, marker);
  } catch {
    // Ignore storage failures (e.g., private browsing quota errors)
  }
}

export function getLastGoogleSub(): string | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  return storage.getItem(LAST_GOOGLE_SUB_KEY);
}

export function setLastGoogleSub(sub: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(LAST_GOOGLE_SUB_KEY, sub);
  } catch {
    // Ignore storage failures
  }
}

export function clearLastGoogleSub(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(LAST_GOOGLE_SUB_KEY);
}
