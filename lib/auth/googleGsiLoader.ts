/**
 * Google Identity Services (GIS) Script Loader
 * A module-level singleton loader so multiple consumers (the sign-in button,
 * the auth provider's restoration/renewal logic, etc.) share a single
 * `<script>` injection instead of racing to add duplicates.
 */

'use client';

import { isGoogleSignInConfigured } from './googleConfig';
import { MILLISECONDS_PER_SECOND } from '@/lib/constants/common';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GSI_SCRIPT_ID = 'google-gsi-client-script';
/**
 * Bound the load wait so a blocked/hung request (no `load` and no `error`
 * event ever fires — e.g. some adblockers and captive portals silently
 * stall the request) can't pin bootstrap resolution or the Google button in
 * a loading state indefinitely. A genuine network `error` typically fires
 * well before this and is handled immediately, not via this timeout. Set
 * generously (20s) so a slow-but-succeeding load on a poor connection isn't
 * mistaken for a hang.
 */
const GSI_SCRIPT_LOAD_TIMEOUT_MS = 20 * MILLISECONDS_PER_SECOND;

export class GoogleGsiLoadError extends Error {
  constructor(message = 'Failed to load Google Identity Services.') {
    super(message);
    this.name = 'GoogleGsiLoadError';
  }
}

let loadPromise: Promise<void> | null = null;
let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Load the GIS client script, injecting it at most once. Safe to call from
 * multiple consumers concurrently — they all share the same promise. A
 * failed load resets the singleton so a later call can retry.
 */
export function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new GoogleGsiLoadError('Google Identity Services requires a browser environment.'),
    );
  }

  if (!isGoogleSignInConfigured()) {
    return Promise.reject(
      new GoogleGsiLoadError('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.'),
    );
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      GSI_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const timeoutId = setTimeout(() => {
      // Neither `load` nor `error` has fired within the bound — treat it
      // the same as a load failure so the singleton resets and a retry
      // (or the app's own bounded resolving window) isn't stuck waiting
      // on a request that may never settle.
      handleError(existing ?? script);
    }, GSI_SCRIPT_LOAD_TIMEOUT_MS);
    pendingTimeoutId = timeoutId;

    const handleLoad = () => {
      clearTimeout(timeoutId);
      pendingTimeoutId = null;
      resolve();
    };

    const handleError = (failedScript: HTMLScriptElement) => {
      // Reset the singleton AND remove the failed tag so a subsequent call
      // creates a fresh <script> and actually re-issues the network
      // request — merely clearing `loadPromise` while leaving the failed
      // (already-settled, non-retrying) tag in the DOM would make a "retry"
      // just re-attach listeners to a script that will never load or error
      // again.
      clearTimeout(timeoutId);
      pendingTimeoutId = null;
      loadPromise = null;
      failedScript.remove();
      reject(new GoogleGsiLoadError());
    };

    if (existing) {
      existing.addEventListener('load', handleLoad, { once: true });
      existing.addEventListener('error', () => handleError(existing), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GSI_SCRIPT_ID;
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', () => handleError(script), { once: true });
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Test-only escape hatch to reset the singleton between test cases. */
export function resetGoogleGsiLoaderForTests(): void {
  loadPromise = null;
  if (pendingTimeoutId !== null) {
    clearTimeout(pendingTimeoutId);
    pendingTimeoutId = null;
  }
}
