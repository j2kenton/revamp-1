/**
 * MSAL Provider Component
 * Wraps the application with Microsoft Authentication Library context
 */

'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { MsalProvider as MsalReactProvider } from '@azure/msal-react';
import { msalConfig } from './msalConfig';

interface MsalProviderProps {
  children: ReactNode;
}

// Create MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Captured at most once per page load by the init effect below. This file
// never calls `setActiveAccount` — account selection is owned exclusively by
// `useGoogleAuthState()`'s post-resolution bootstrap effect, called from
// within `AuthProvider` (for a restored cached account or a captured
// redirect result), and by the facade's (`useAuth.ts`) explicit
// popup/redirect login path. Keeping selection out
// of this provider means it can never run ahead of the persisted
// provider-marker read, which is what makes the marker's suppression
// guarantees ("don't resurrect a cached account when the user last chose
// Google, or explicitly signed out") enforceable.
let pendingRedirectAccount: AccountInfo | null = null;

/**
 * Read-and-clear the captured redirect account. Clearing on read means a
 * React development/StrictMode remount of the consumer can't reprocess a
 * stale result — a second read simply finds nothing and falls through to
 * the marker-based restoration path, which converges to the same account
 * because the first consumption already persisted the 'microsoft' marker.
 */
export function consumePendingRedirectAccount(): AccountInfo | null {
  const account = pendingRedirectAccount;
  pendingRedirectAccount = null;
  return account;
}

export function MsalProvider({ children }: MsalProviderProps) {
  const [initialized, setInitialized] = useState(false);
  // Guards against React development/StrictMode's double effect
  // invocation: without this, a second `handleRedirectPromise()` call could
  // repopulate `pendingRedirectAccount` after `AuthProvider`'s bootstrap
  // effect already consumed (and cleared) it on the first run, making the
  // holder's consume-once contract unsafe in dev. `initialize()` and
  // `handleRedirectPromise()` are each meant to run exactly once per page
  // load; this ref enforces that regardless of how many times the effect
  // body itself fires.
  const initStartedRef = useRef(false);

  useEffect(() => {
    if (initStartedRef.current) {
      return;
    }
    initStartedRef.current = true;

    const initializeMsal = async () => {
      try {
        await msalInstance.initialize();

        // Process redirect responses (supports redirect fallback when
        // popups are blocked) and hand the result off — this file only
        // initializes MSAL, it never selects an account.
        const redirectResult = await msalInstance.handleRedirectPromise();
        if (redirectResult?.account) {
          pendingRedirectAccount = redirectResult.account;
        }

        setInitialized(true);
      } catch (error) {
        console.error('Failed to initialize MSAL:', error);
      }
    };

    initializeMsal();
  }, []);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 mx-auto"></div>
          <p className="text-gray-600">Initializing authentication...</p>
        </div>
      </div>
    );
  }

  return <MsalReactProvider instance={msalInstance}>{children}</MsalReactProvider>;
}

export { msalInstance };
