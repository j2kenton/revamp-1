/**
 * Shared Microsoft Access Token Store
 * `useAuth()` is called independently by several components/hooks
 * (`ChatPage`, `useFetchChatHistory`, `useStreamingResponse`,
 * `useProfilePhoto`'s sibling `useAuth` calls, etc). Microsoft's account
 * state is already shared via MSAL's own instance/event system
 * (`useMsal()`), but the *access token* this app acquires on top of it
 * (`acquireTokenSilent`/`acquireTokenPopup`, its expiry, its retry/backoff,
 * and its proactive-refresh outcome) was previously local `useState` inside
 * every `useAuth()` call site — meaning each consumer held its own copy that
 * could drift, and, worse, several consumers independently detecting an
 * expired token could each call `acquireTokenPopup()` around the same time,
 * which MSAL rejects as a concurrent interactive request.
 *
 * This module is the single owner of that state: a module-level store
 * (subscribed to via `useSyncExternalStore`) so every consumer reads the
 * identical value and sees a renewal the instant it lands, plus an in-flight
 * guard so concurrent callers coalesce into one acquisition instead of
 * racing separate (or duplicate interactive) MSAL calls.
 */

import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type IPublicClientApplication,
  type SilentRequest,
} from '@azure/msal-browser';
import { ONE_SECOND_IN_MS, FIVE_MINUTES_IN_MS } from '@/lib/constants/common';
import { loginRequest, silentRequest } from './msalConfig';

export interface MsTokenState {
  accessToken: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: Error | null;
}

const TOKEN_EXPIRY_BUFFER = FIVE_MINUTES_IN_MS;
const MAX_RETRY_ATTEMPTS = 3;

let state: MsTokenState = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
  error: null,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<MsTokenState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribeMsToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMsTokenSnapshot(): MsTokenState {
  return state;
}

/** Clears the shared Microsoft token state (e.g. on logout or provider switch). */
export function clearMsToken(): void {
  setState({ accessToken: null, expiresAt: null, isLoading: false, error: null });
}

/**
 * Clears only the store's error, leaving any live token/expiry untouched.
 * Used by the facade's `clearError()` so a dismiss affordance can clear a
 * stuck token-acquisition error (e.g. from a prior failed silent/interactive
 * refresh) without also discarding a still-valid token.
 */
export function clearMsTokenError(): void {
  setState({ error: null });
}

/** Sets the shared state directly from a fresh login/redirect result. */
export function setMsTokenFromResult(response: AuthenticationResult): void {
  setState({
    accessToken: response.accessToken,
    expiresAt: response.expiresOn
      ? response.expiresOn.getTime() - TOKEN_EXPIRY_BUFFER
      : null,
    error: null,
    isLoading: false,
  });
}

const isEmbeddedContext = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  const hasOpener = window.opener != null;
  try {
    // Accessing window.top can throw in cross-origin iframes; guard accordingly.
    return hasOpener || window.top !== window.self;
  } catch {
    return hasOpener;
  }
};

// Allow forcing redirect flow (e.g., to avoid popup loops in hosted environments)
const preferRedirectFlow =
  process.env.NEXT_PUBLIC_MSAL_LOGIN_FLOW === 'redirect';

let inFlightAcquire: Promise<string | null> | null = null;

/**
 * Acquire (or refresh) the shared Microsoft access token. Concurrent callers
 * (e.g. several components' proactive-refresh timers firing around the same
 * moment) coalesce onto the same in-flight promise rather than issuing
 * separate — or, worse, separate *interactive* — MSAL requests.
 */
export function acquireMsToken(
  instance: IPublicClientApplication,
  account: AccountInfo | null,
): Promise<string | null> {
  if (inFlightAcquire) {
    return inFlightAcquire;
  }

  inFlightAcquire = doAcquire(instance, account, 0).finally(() => {
    inFlightAcquire = null;
  });

  return inFlightAcquire;
}

async function doAcquire(
  instance: IPublicClientApplication,
  account: AccountInfo | null,
  retryCount: number,
): Promise<string | null> {
  if (!account) {
    return null;
  }

  setState({ isLoading: true });

  try {
    const request: SilentRequest = { ...silentRequest, account };
    const response: AuthenticationResult = await instance.acquireTokenSilent(request);
    setMsTokenFromResult(response);
    return response.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      try {
        if (preferRedirectFlow || isEmbeddedContext()) {
          await instance.acquireTokenRedirect(loginRequest);
          setState({ isLoading: false });
          return null;
        }
        const response = await instance.acquireTokenPopup(loginRequest);
        setMsTokenFromResult(response);
        return response.accessToken;
      } catch (interactiveError) {
        console.error('Interactive token acquisition failed:', interactiveError);
        setState({ error: interactiveError as Error, isLoading: false });
        return null;
      }
    }

    if (retryCount < MAX_RETRY_ATTEMPTS) {
      const delay = Math.pow(2, retryCount) * ONE_SECOND_IN_MS; // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
      return doAcquire(instance, account, retryCount + 1);
    }

    console.error('Token acquisition failed:', err);
    setState({ error: err as Error, isLoading: false });
    return null;
  }
}

/** Test-only escape hatch to reset the singleton between test cases. */
export function resetMsTokenStoreForTests(): void {
  state = { accessToken: null, expiresAt: null, isLoading: false, error: null };
  inFlightAcquire = null;
  listeners.clear();
}
