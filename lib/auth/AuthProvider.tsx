/**
 * Auth Provider
 * Single owner of the combined authentication state exposed to the rest of
 * the app: it merges Microsoft (MSAL) and Google (GIS) state into one
 * `UseAuthReturn` value, computed once per render here rather than
 * independently inside every `useAuth()` call site, and exposes it via
 * context. `useAuth()` (re-exported from `lib/auth/useAuth.ts` for existing
 * import paths) is a thin `useContext` consumer — it owns no merging logic
 * of its own.
 *
 * `AuthProvider` owns the Google SDK lifecycle directly: it calls
 * `useGoogleAuthState()` (GIS script loading, the credential callback,
 * renewal, and post-resolution MSAL account selection) itself, rather than
 * reading it from a separately-mounted provider, and re-provides
 * `GoogleAuthContext` for the one other consumer that needs raw Google state
 * (`GoogleSignInButton`). `MsalProvider` initializes MSAL and hands off a
 * captured redirect result but never selects an account itself. `AuthProvider`
 * is mounted directly inside `MsalProvider` (`app/layout.tsx`) and is the
 * single owner of the merged state exposed to the rest of the app.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useMsal } from '@azure/msal-react';
import { BrowserAuthErrorCodes, InteractionStatus } from '@azure/msal-browser';
import { BYPASS_ACCESS_TOKEN, isBypassAuthEnabled } from '@/lib/auth/bypass';
import { ONE_MINUTE_IN_MS } from '@/lib/constants/common';
import { loginRequest } from './msalConfig';
import {
  GoogleAuthContext,
  useGoogleAuthState,
  type GoogleAuthContextValue,
} from './GoogleAuthProvider';
import {
  acquireMsToken,
  clearMsToken,
  clearMsTokenError,
  getMsTokenSnapshot,
  setMsTokenFromResult,
  subscribeMsToken,
} from './msTokenStore';
import {
  clearLastGoogleSub,
  getAuthProviderMarker,
  setAuthProviderMarker,
  type AuthProviderId,
} from './authProviderMarker';

export type { AuthProviderId } from './authProviderMarker';

export interface UseAuthReturn {
  status: 'resolving' | 'unauthenticated' | 'authenticated';
  isAuthenticated: boolean;
  provider: AuthProviderId | null;
  /** Stable per-account cache key: `microsoft:<homeAccountId>` or `google:<sub>`. */
  authIdentityKey: string | null;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
  accessToken: string | null;
  login: (provider?: AuthProviderId) => Promise<void>;
  logout: () => Promise<void>;
  acquireToken: () => Promise<string | null>;
  /**
   * Acquire a Microsoft Graph token for the given scopes on behalf of the
   * active Microsoft session. Returns `null` outside a resolved Microsoft
   * session (Google active, resolving, unauthenticated) or on failure — the
   * sole mediator consumers like `useProfilePhoto` use instead of calling
   * `useMsal()`/`acquireTokenSilent` themselves.
   */
  acquireGraphToken: (scopes: string[]) => Promise<string | null>;
  isLoading: boolean;
  error: Error | null;
  /**
   * Clears the currently-displayed auth error — the local login/logout-
   * attempt error, and, since `error` also surfaces `msToken.error` and
   * `googleAuth.error`, any sticky Microsoft token-acquisition failure or
   * Google credential-rejection error (e.g. an unverified-email response) —
   * so a sign-in surface can offer a dismiss affordance instead of leaving
   * the alert stuck until a fresh attempt happens to succeed.
   */
  clearError: () => void;
  /** A Google renewal was suppressed/rejected while the token is still valid. */
  needsReauth: boolean;
}

const AuthContext = createContext<UseAuthReturn | null>(null);

const isEmbeddedContext = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasOpener = window.opener != null;

  try {
    // Accessing window.top can throw in cross-origin iframes; guard accordingly.
    const isFramed = window.top !== window.self;
    return hasOpener || isFramed;
  } catch {
    return hasOpener;
  }
};

// Allow forcing redirect flow (e.g., to avoid popup loops in hosted environments)
const preferRedirectFlow =
  process.env.NEXT_PUBLIC_MSAL_LOGIN_FLOW === 'redirect';

function useComputedAuth(googleAuth: GoogleAuthContextValue): UseAuthReturn {
  const msalContext = useMsal();
  const { instance, accounts, inProgress } = msalContext;
  const bypassAuth = isBypassAuthEnabled();
  // Shared across the whole app (see msTokenStore.ts) — not per-consumer
  // state, so every consumer of this provider's context observes the same
  // token and sees a renewal the instant it lands, and concurrent
  // acquisitions coalesce instead of racing separate (or duplicate
  // interactive) MSAL calls.
  const msToken = useSyncExternalStore(
    subscribeMsToken,
    getMsTokenSnapshot,
    getMsTokenSnapshot,
  );
  const msAccessToken = msToken.accessToken;
  const tokenExpiresAt = msToken.expiresAt;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const bypassUser = {
    id: 'bypass-user',
    email: 'test-user@example.com',
    name: 'Test User',
  } as const;

  // Bootstrap resolution (rule 0): MSAL's PublicClientApplication restores
  // its own cached "active account" pointer internally on `initialize()`,
  // independent of anything this app's code does — so `getActiveAccount()`
  // can already return a value before `useGoogleAuthState()`'s bootstrap
  // effect has read the persisted provider marker and settled selection.
  // Until that effect flips `isRestoring` to false, no provider, identity,
  // or token may be exposed, even if MSAL's own cache already has an
  // account selected — everything below is forced to the unauthenticated
  // shape while resolving; only afterward do the marker-corroborated
  // MSAL/Google reads (state-machine rule 2) take effect.
  const resolving = googleAuth.isRestoring;

  const authProviderMarker = getAuthProviderMarker();
  const activeMsalAccount = instance.getActiveAccount();
  const msalActive =
    !resolving &&
    accounts.length > 0 &&
    activeMsalAccount != null &&
    (authProviderMarker === null || authProviderMarker === 'microsoft');
  const googleActive = !resolving && Boolean(googleAuth.credential) && !googleAuth.isExpired;

  // Google takes priority if somehow both are momentarily active — the
  // exclusivity effect below actively prevents that from persisting.
  const provider: AuthProviderId | null = googleActive
    ? 'google'
    : msalActive
      ? 'microsoft'
      : null;

  const status: UseAuthReturn['status'] = resolving
    ? 'resolving'
    : provider
      ? 'authenticated'
      : 'unauthenticated';

  const isAuthenticated = status === 'authenticated';

  const user =
    provider === 'microsoft' && activeMsalAccount
      ? {
          id: activeMsalAccount.localAccountId,
          email: activeMsalAccount.username,
          name: activeMsalAccount.name || activeMsalAccount.username,
        }
      : provider === 'google' && googleAuth.credential
        ? {
            id: `google:${googleAuth.credential.sub}`,
            email: googleAuth.credential.email,
            name: googleAuth.credential.name,
          }
        : null;

  const authIdentityKey =
    provider === 'microsoft' && activeMsalAccount
      ? `microsoft:${activeMsalAccount.homeAccountId}`
      : provider === 'google' && googleAuth.credential
        ? `google:${googleAuth.credential.sub}`
        : null;

  const accessToken = resolving
    ? null
    : provider === 'google'
      ? googleAuth.idToken
      : provider === 'microsoft'
        ? msAccessToken
        : null;

  // --- Mutual exclusivity -------------------------------------------------
  // Google taking over from an active Microsoft session needs no MSAL-side
  // cleanup: `msalActive` above is gated on the marker directly, so once
  // Google sets the marker to 'google' (in `handleCredentialResponse`),
  // MSAL's cached active account stops counting as authenticated on the
  // very next read — no `setActiveAccount(null)` call needed, and account
  // selection stays confined to exactly two call sites codebase-wide: the
  // post-resolution controller in `useGoogleAuthState()`'s bootstrap effect,
  // and the explicit popup/redirect login path below. The reverse
  // direction still needs an explicit action: Google's own credential state
  // doesn't know to clear itself when Microsoft becomes active, so that
  // transition is driven by the effect below.
  const prevMsalActiveRef = useRef(msalActive);
  useEffect(() => {
    if (msalActive && !prevMsalActiveRef.current && googleAuth.credential) {
      googleAuth.logout('microsoft');
    }
    prevMsalActiveRef.current = msalActive;
    // googleAuth is a stable context value reference per render; only the
    // msalActive transition should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msalActive]);

  /**
   * Acquire access token silently with automatic retry (Microsoft only —
   * the Google ID token is kept fresh by GoogleAuthProvider's renewal timer).
   * Delegates to the shared `msTokenStore` so every consumer's call
   * coalesces into the same acquisition and observes the same result.
   */
  const acquireToken = useCallback(async (): Promise<string | null> => {
    if (bypassAuth) {
      return BYPASS_ACCESS_TOKEN;
    }

    if (resolving) {
      return null;
    }

    if (provider === 'google') {
      return googleAuth.idToken;
    }

    // Outside a resolved, marker-corroborated Microsoft session (signed out,
    // Google active, or no selection at all), fail closed rather than
    // falling through to MSAL's own internally-restored active-account
    // pointer — `instance.getActiveAccount()` can be non-null here even when
    // this provider has deliberately not selected/authenticated it (state-
    // machine rules 1-2), and acquiring against it would leak a Microsoft
    // token outside the active provider.
    if (provider !== 'microsoft') {
      return null;
    }

    if (inProgress !== InteractionStatus.None) {
      return null;
    }

    const account = instance.getActiveAccount();
    return acquireMsToken(instance, account);
  }, [instance, inProgress, bypassAuth, resolving, provider, googleAuth.idToken]);

  /**
   * Acquire a Microsoft Graph token for arbitrary scopes (e.g. `User.Read`
   * for the profile photo). Separate from `acquireToken`, which acquires
   * this app's own API scope — Graph needs its own token with its own
   * scopes, silently, against the same active Microsoft account this
   * provider already owns selection of.
   */
  const acquireGraphToken = useCallback(
    async (scopes: string[]): Promise<string | null> => {
      if (bypassAuth || resolving || provider !== 'microsoft') {
        return null;
      }

      if (inProgress !== InteractionStatus.None) {
        return null;
      }

      const account = instance.getActiveAccount();
      if (!account) {
        return null;
      }

      try {
        const tokenResponse = await instance.acquireTokenSilent({ scopes, account });
        return tokenResponse.accessToken;
      } catch (err) {
        console.error('Graph token acquisition failed:', err);
        return null;
      }
    },
    [instance, inProgress, bypassAuth, resolving, provider],
  );

  /**
   * Sign in with the given provider. Microsoft uses MSAL's popup (falling
   * back to redirect); Google's primary UX is the rendered
   * `GoogleSignInButton`, but `login('google')` also supports a
   * programmatic One Tap/silent prompt.
   */
  const login = useCallback(async (targetProvider: AuthProviderId = 'microsoft') => {
    if (bypassAuth) {
      return;
    }

    if (targetProvider === 'google') {
      setError(null);
      try {
        await googleAuth.ensureInitialized();
        await googleAuth.requestCredential();
      } catch (err) {
        console.error('Google sign-in failed:', err);
        setError(err as Error);
        throw err;
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (preferRedirectFlow || isEmbeddedContext()) {
        // Persist the marker before navigation departs the page so a
        // returning redirect is recognized as an explicit Microsoft login.
        // Clear the Google restoration pin here too: the exclusivity effect
        // below only clears it when a live Google credential exists, which
        // misses the case where the marker was 'google' but no credential
        // was ever restored this session (e.g. the prior restoration prompt
        // was suppressed) — leaving a stale pin that could satisfy a later
        // automatic Google credential's identity check after the user has
        // explicitly switched away.
        setAuthProviderMarker('microsoft');
        clearLastGoogleSub();
        await instance.loginRedirect(loginRequest);
        return;
      }

      try {
        const response = await instance.loginPopup(loginRequest);
        setAuthProviderMarker('microsoft');
        clearLastGoogleSub();
        instance.setActiveAccount(response.account);
        setMsTokenFromResult(response);
      } catch (popupErr) {
        const errorCode = (popupErr as { errorCode?: string })?.errorCode;
        const popupBlocked =
          errorCode === BrowserAuthErrorCodes.popupWindowError ||
          errorCode === BrowserAuthErrorCodes.emptyWindowError;

        if (!popupBlocked) {
          throw popupErr;
        }

        // The popup was blocked (not user-cancelled) — fall back to the
        // redirect flow rather than surfacing a dead end. Persist the marker
        // before navigating away for the same reason as the eager-redirect
        // path above: only sessionStorage survives the round trip.
        setAuthProviderMarker('microsoft');
        clearLastGoogleSub();
        await instance.loginRedirect(loginRequest);
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [instance, bypassAuth, googleAuth]);

  const clearError = useCallback(() => {
    setError(null);
    // `error` above also surfaces `msToken.error` and `googleAuth.error` —
    // both must be cleared too, or a dismiss affordance for one could leave
    // the alert reappearing from a different source on the next render.
    clearMsTokenError();
    googleAuth.clearError();
  }, [googleAuth]);

  /**
   * Sign out of whichever provider is currently active.
   */
  const logout = useCallback(async () => {
    if (bypassAuth) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (provider === 'google') {
        googleAuth.logout('signed-out');
      } else {
        const account = instance.getActiveAccount();
        await instance.logoutPopup({
          account,
          postLogoutRedirectUri: '/',
        });
        // Always clear Google's restoration pin on Microsoft logout, not just
        // when a live Google credential happens to be present — otherwise a
        // stale `lastGoogleSub` from an earlier browser session (marker
        // already 'google' but no credential ever restored this page load)
        // survives and could satisfy a later automatic Google credential's
        // identity check after the user explicitly signed out via Microsoft.
        googleAuth.logout('signed-out');
      }
      setAuthProviderMarker('signed-out');
      clearMsToken();
    } catch (err) {
      console.error('Logout failed:', err);
      setError(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [instance, bypassAuth, provider, googleAuth]);

  /**
   * Proactive token refresh before expiration (Microsoft only)
   */
  useEffect(() => {
    if (bypassAuth || resolving || provider !== 'microsoft' || !tokenExpiresAt) {
      return;
    }

    const checkAndRefresh = async () => {
      const now = Date.now();
      if (now >= tokenExpiresAt) {
        // Token is about to expire, refresh it
        await acquireToken();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndRefresh, ONE_MINUTE_IN_MS);

    // Also check immediately
    checkAndRefresh();

    return () => clearInterval(interval);
  }, [bypassAuth, resolving, provider, tokenExpiresAt, acquireToken]);

  /**
   * Acquire initial token on mount (Microsoft only)
   */
  useEffect(() => {
    if (bypassAuth || resolving) {
      return;
    }

    if (provider === 'microsoft' && !msAccessToken && inProgress === InteractionStatus.None) {
      acquireToken();
    }
  }, [bypassAuth, resolving, provider, msAccessToken, inProgress, acquireToken]);

  if (bypassAuth) {
    const noop = async () => {};
    return {
      status: 'authenticated',
      isAuthenticated: true,
      provider: 'microsoft',
      authIdentityKey: 'bypass:bypass-user',
      user: bypassUser,
      accessToken: BYPASS_ACCESS_TOKEN,
      login: noop,
      logout: noop,
      acquireToken: async () => BYPASS_ACCESS_TOKEN,
      acquireGraphToken: async () => null,
      isLoading: false,
      error: null,
      clearError: () => {},
      needsReauth: false,
    };
  }

  return {
    status,
    isAuthenticated,
    provider,
    authIdentityKey,
    user,
    accessToken,
    login,
    logout,
    acquireToken,
    acquireGraphToken,
    isLoading: isLoading || inProgress !== InteractionStatus.None,
    error: error ?? msToken.error ?? googleAuth.error,
    clearError,
    needsReauth: googleAuth.needsReauth,
  };
}

/**
 * Mounted directly inside `MsalProvider` (see `app/layout.tsx`). Owns the
 * Google GIS lifecycle itself (`useGoogleAuthState()`), computes the
 * combined Microsoft/Google auth state once, and exposes both the merged
 * facade and the raw Google state (for `GoogleSignInButton`) via context —
 * the single place this state is owned and merged.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const googleAuth = useGoogleAuthState();
  const value = useComputedAuth(googleAuth);
  return (
    <GoogleAuthContext.Provider value={googleAuth}>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </GoogleAuthContext.Provider>
  );
}

/** Thin context consumer — see `lib/auth/useAuth.ts`, which re-exports this. */
export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be used within an <AuthProvider>.');
  }
  return context;
}
