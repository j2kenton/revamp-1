/**
 * Google Auth State
 * Owns all Google Identity Services (GIS) state: the current ID token
 * credential, lazy script loading + one-time `initialize()`, silent
 * restoration on reload, pre-expiry renewal, and sign-out. The state is
 * implemented as the `useGoogleAuthState()` hook, which `AuthProvider` calls
 * directly — `AuthProvider` is the single owner of the merged auth state
 * exposed to the app and is mounted directly inside `MsalProvider`
 * (`app/layout.tsx`); it also re-provides `GoogleAuthContext` so
 * `GoogleSignInButton` (the only other consumer that needs raw Google state)
 * can read it without a separately-mounted provider in the tree.
 *
 * `GoogleAuthProvider`, the context-provider component below, is kept as a
 * thin wrapper around the same hook purely so the existing isolated
 * `GoogleAuthProvider.*.test.tsx` suites — which exercise this state machine
 * standalone — continue to work unmodified; it is not mounted in the app
 * tree.
 *
 * This hook is also the sole owner of *post-resolution* MSAL account
 * selection (the other selector is the facade's explicit popup/redirect
 * login path). `MsalProvider` only initializes MSAL and hands off a
 * captured redirect result — it never calls `setActiveAccount` itself, so
 * nothing can select a cached or redirect-resulting account before the
 * bootstrap effect below has read the persisted provider marker. See the
 * bootstrap effect for the full rules.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isBypassAuthEnabled } from '@/lib/auth/bypass';
import { FIVE_MINUTES_IN_MS, MILLISECONDS_PER_SECOND } from '@/lib/constants/common';
import {
  clearLastGoogleSub,
  getAuthProviderMarker,
  getLastGoogleSub,
  setAuthProviderMarker,
  setLastGoogleSub,
  type AuthProviderMarker,
} from './authProviderMarker';
import {
  decodeGoogleCredential,
  GOOGLE_CLIENT_ID,
  isExplicitGoogleSelection,
  isGoogleSignInConfigured,
  type DecodedGoogleCredential,
} from './googleConfig';
import { loadGoogleGsiScript } from './googleGsiLoader';
import { consumePendingRedirectAccount, msalInstance } from './MsalProvider';
import { STRINGS } from '@/lib/constants/strings';

export interface GoogleAuthContextValue {
  isConfigured: boolean;
  /** True once GIS is loaded and `initialize()` has been called. */
  isReady: boolean;
  /** True while resolving the reload-restoration attempt. */
  isRestoring: boolean;
  credential: DecodedGoogleCredential | null;
  idToken: string | null;
  /** True once the current credential's `exp` has passed. */
  isExpired: boolean;
  /** A prior renewal attempt was suppressed/rejected while the token is still valid. */
  needsReauth: boolean;
  error: Error | null;
  ensureInitialized: () => Promise<void>;
  /**
   * Best-effort silent/One Tap prompt; resolves once requested (not once
   * accepted). Pass `{ silent: true }` for automatic (restoration/renewal)
   * attempts so a suppressed/undisplayed prompt can surface the re-auth
   * banner instead of silently doing nothing — explicit user-initiated
   * calls never do, since a dismissed voluntary prompt is a cancellation.
   */
  requestCredential: (options?: { silent?: boolean }) => Promise<void>;
  /** Clears the Google session. `marker` records why (default: explicit sign-out). */
  logout: (marker?: AuthProviderMarker) => void;
  clearError: () => void;
}

export const GoogleAuthContext = createContext<GoogleAuthContextValue | null>(null);

/** How long before actual token expiry the watchdog forces `needsReauth`. */
const REAUTH_WATCHDOG_BUFFER_MS = 30 * MILLISECONDS_PER_SECOND;

/**
 * Upper bound on how long bootstrap resolution (`isRestoring`) may block the
 * rest of the app while a one-shot Google restoration attempt is in flight.
 * The GIS script loader has its own, separately-tuned 20s timeout aimed at
 * not mistaking a slow-but-succeeding load for a hang (see
 * `googleGsiLoader.ts`) — but that figure is wrong for this purpose: while
 * `isRestoring` is true, both sign-in surfaces disable the Microsoft button
 * too, so a hung GIS load would otherwise leave the user with *no* working
 * sign-in path for the full 20s. Capping resolution here, independently,
 * bounds that worst case without shortening the loader's own retry budget —
 * the restoration attempt keeps running in the background past this point
 * and can still land a credential (via `handleCredentialResponse`) whenever
 * it eventually settles.
 */
const BOOTSTRAP_RESOLVING_TIMEOUT_MS = 5 * MILLISECONDS_PER_SECOND;

function computeIsExpired(credential: DecodedGoogleCredential | null): boolean {
  if (!credential) {
    return false;
  }
  return Date.now() >= credential.exp * MILLISECONDS_PER_SECOND;
}

export function useGoogleAuthState(): GoogleAuthContextValue {
  const bypassAuth = isBypassAuthEnabled();
  const configured = isGoogleSignInConfigured();

  const [isReady, setIsReady] = useState(false);
  // True from mount until the bootstrap effect below has read the
  // persisted marker and performed MSAL post-resolution selection (and, if
  // applicable, attempted Google restoration). Not computed from
  // `sessionStorage` here — that read only happens client-side in the
  // effect, never during render, so there's nothing for server/client
  // hydration to disagree about.
  const [isRestoring, setIsRestoring] = useState(!bypassAuth);
  const [credential, setCredential] = useState<DecodedGoogleCredential | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [, forceTick] = useState(0);

  const pinnedSubRef = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const renewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapAttemptedRef = useRef(false);
  /** Set once, by the one-time side-effect block below, to whether this page
   * load needs a bounded wait for a Google restoration attempt. Read on
   * every mount of the bootstrap effect (including a StrictMode remount) so
   * the ~5s cap in `BOOTSTRAP_RESOLVING_TIMEOUT_MS` gets re-armed even when
   * the side effects themselves are guarded to run only once. */
  const restorationNeededRef = useRef(false);
  /** The in-flight restoration promise kicked off by the one-time side-effect
   * block, shared across mounts so a StrictMode remount's freshly-armed cap
   * can attach its own `.finally()` to the SAME attempt rather than starting
   * a second `requestCredential()` call. */
  const restorePromiseRef = useRef<Promise<void> | null>(null);
  /** Mirrors `credential` state; read inside the `.prompt()` moment-listener
   * closure to tell a suppressed *renewal* (a credential was already active)
   * from a suppressed *restoration* (no credential yet this page load). */
  const credentialRef = useRef<DecodedGoogleCredential | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const clearRenewalTimer = useCallback(() => {
    if (renewalTimerRef.current) {
      clearTimeout(renewalTimerRef.current);
      renewalTimerRef.current = null;
    }
  }, []);

  const clearWatchdogTimer = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const requestCredentialRef = useRef<
    (options?: { silent?: boolean }) => Promise<void>
  >(async () => {});

  const scheduleRenewal = useCallback((decoded: DecodedGoogleCredential) => {
    clearRenewalTimer();
    clearWatchdogTimer();
    const expiresAtMs = decoded.exp * MILLISECONDS_PER_SECOND;
    const renewAt = expiresAtMs - FIVE_MINUTES_IN_MS;
    const renewDelay = Math.max(renewAt - Date.now(), 0);
    renewalTimerRef.current = setTimeout(() => {
      void requestCredentialRef.current({ silent: true });
    }, renewDelay);

    // Guarantee the pre-expiry banner even when GIS's moment-notification
    // callback never fires or misreports — a documented gap under FedCM,
    // where `isNotDisplayed()`/`isSkippedMoment()` are unreliable. This
    // watchdog doesn't depend on that callback at all: if the credential
    // scheduled here is still the active one this close to its own expiry
    // (i.e. no renewal — silent or explicit — has landed), it surfaces
    // `needsReauth` unconditionally so continuity never fails silently.
    const watchdogDelay = Math.max(
      expiresAtMs - Date.now() - REAUTH_WATCHDOG_BUFFER_MS,
      0,
    );
    watchdogTimerRef.current = setTimeout(() => {
      if (credentialRef.current?.exp === decoded.exp) {
        setNeedsReauth(true);
      }
    }, watchdogDelay);
  }, [clearRenewalTimer, clearWatchdogTimer]);

  const handleCredentialResponse = useCallback(
    (response: CredentialResponse) => {
      const decoded = decodeGoogleCredential(response.credential);
      if (!decoded) {
        setError(new Error('Received an invalid Google credential.'));
        return;
      }

      if (!decoded.emailVerified) {
        // The server rejects unverified-email Google tokens outright
        // (server/middleware/google-auth.ts), which would otherwise leave a
        // client-side "authenticated" user whose every API call 401s with
        // no explanation. Fail fast here with the standard error region
        // instead, and don't touch the pin/marker/credential state.
        setError(new Error(STRINGS.errors.googleEmailNotVerified));
        return;
      }

      const pinnedSub = pinnedSubRef.current ?? getLastGoogleSub();
      const explicit = isExplicitGoogleSelection(response.select_by);

      if (!explicit && (!pinnedSub || decoded.sub !== pinnedSub)) {
        // An automatic (non-gesture) credential may only establish/renew a
        // session when it matches an existing pin. With no pin at all, an
        // automatic credential must never authenticate the user — only an
        // explicit gesture or a pin match may do that (state-machine rule 4).
        // Only surface the re-auth banner when a pin actually existed and
        // this automatic credential failed to match it; an unpinned
        // automatic credential (no session pending) simply resolves to
        // unauthenticated with no error.
        if (pinnedSub) {
          setNeedsReauth(true);
        }
        return;
      }

      pinnedSubRef.current = decoded.sub;
      credentialRef.current = decoded;
      setCredential(decoded);
      setIdToken(response.credential);
      setNeedsReauth(false);
      setError(null);
      setAuthProviderMarker('google');
      setLastGoogleSub(decoded.sub);
      scheduleRenewal(decoded);
    },
    // Stable on purpose: this closure is registered once with
    // `google.accounts.id.initialize()` and must keep working correctly for
    // the lifetime of the page — it only reads refs/setters, never state.
    [scheduleRenewal],
  );

  const ensureInitialized = useCallback(async (): Promise<void> => {
    if (!configured) {
      throw new Error('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured.');
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    initPromiseRef.current = loadGoogleGsiScript()
      .then(() => {
        window.google?.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: true,
          cancel_on_tap_outside: true,
          context: 'signin',
        });
        setIsReady(true);
        // A retry after a prior load failure must clear that failure — the
        // load succeeded, so the shared error state (surfaced to every
        // `useAuth()` consumer, including the alert regions on both sign-in
        // surfaces) must not keep reporting a now-stale failure.
        setError(null);
      })
      .catch((loadError: Error) => {
        initPromiseRef.current = null;
        setError(loadError);
        throw loadError;
      });

    return initPromiseRef.current;
  }, [configured, handleCredentialResponse]);

  const requestCredential = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      if (bypassAuth || !configured) {
        return;
      }
      const silent = options?.silent ?? false;
      try {
        await ensureInitialized();
        window.google?.accounts.id.prompt((notification) => {
          const suppressed =
            notification.isNotDisplayed() || notification.isSkippedMoment();
          // Only a suppressed automatic (restoration/renewal) attempt with a
          // credential already active surfaces the re-auth banner — a
          // suppressed restoration (no credential yet) or a dismissed
          // explicit prompt should resolve to unauthenticated without error.
          if (silent && suppressed && credentialRef.current) {
            setNeedsReauth(true);
          }
        });
      } catch {
        // ensureInitialized already recorded the error.
      }
    },
    [bypassAuth, configured, ensureInitialized],
  );

  useEffect(() => {
    requestCredentialRef.current = requestCredential;
  }, [requestCredential]);

  // Bootstrap resolution — runs once per page load, after mount (never
  // during render, so there's no server/client hydration disagreement over
  // `sessionStorage`). This is the ONLY place a cached or captured-redirect
  // MSAL account is selected on load; the other (and only other) selection
  // site in the codebase is the facade's explicit popup/redirect login path
  // in `useAuth.ts`. `MsalProvider` itself never selects an account, so
  // nothing can race ahead of the marker read performed here.
  useEffect(() => {
    // The side effects below — MSAL post-resolution selection and kicking
    // off the one-shot Google restoration attempt — must run exactly once
    // per page load, guarded by `bootstrapAttemptedRef`. The bounded wait
    // for that attempt (the cap timer just below), by contrast, must be
    // re-armed on EVERY mount of this effect, including a React
    // development/StrictMode remount (effect runs, cleanup runs, effect
    // runs again on the same fiber) — otherwise the remount's cleanup clears
    // the first run's cap timer and nothing re-arms it, leaving no bound on
    // `isRestoring` for the rest of that mount's lifetime. Splitting the
    // "run once" side effects from the "arm every mount" wait is what keeps
    // both properties true at once; see `restorationNeededRef`/
    // `restorePromiseRef` above.
    if (!bootstrapAttemptedRef.current) {
      bootstrapAttemptedRef.current = true;

      if (bypassAuth) {
        setIsRestoring(false);
        restorationNeededRef.current = false;
      } else {
        // --- MSAL post-resolution account selection ---------------------
        // A captured redirect result is always an explicit Microsoft login
        // (the user just completed an interactive redirect flow) — select
        // it regardless of the stored marker, and record the marker to
        // match.
        const redirectAccount = consumePendingRedirectAccount();
        if (redirectAccount) {
          setAuthProviderMarker('microsoft');
          msalInstance.setActiveAccount(redirectAccount);
        } else {
          // No redirect result: only restore a cached MSAL account when the
          // user's last explicit choice was Microsoft (or this is a first
          // visit with no marker at all). If the user last signed in with
          // Google, or explicitly signed out, a merely-cached MSAL account
          // must not silently resurrect a session — `useAuth.ts` also
          // independently re-checks the marker on every render before
          // trusting MSAL's own (session-persisted) active-account cache,
          // so this restore is belt and braces, not the sole guard.
          const currentMarker = getAuthProviderMarker();
          if (currentMarker === null || currentMarker === 'microsoft') {
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
              msalInstance.setActiveAccount(accounts[0]);
            }
          }
        }

        // --- Google restoration trigger -----------------------------------
        // One-shot silent restoration on reload when the last known
        // provider was Google and we have a pinned subject to restore.
        const marker = getAuthProviderMarker();
        const lastSub = getLastGoogleSub();

        if (!configured || marker !== 'google' || !lastSub) {
          setIsRestoring(false);
          restorationNeededRef.current = false;
        } else {
          pinnedSubRef.current = lastSub;
          restorationNeededRef.current = true;
          restorePromiseRef.current = requestCredential({ silent: true });
        }
      }
    }

    if (!restorationNeededRef.current) {
      return undefined;
    }

    // Bound how long THIS mount may hold `isRestoring` (and thus both
    // sign-in surfaces' Microsoft button) — see
    // `BOOTSTRAP_RESOLVING_TIMEOUT_MS`. Whichever settles first — the shared
    // restoration attempt, or this mount's own cap — flips `isRestoring`;
    // the cap does not cancel the underlying attempt, which keeps running in
    // the background and can still land a credential after the cap fires.
    // Attaching `.finally()` here (rather than only from the run that
    // started the request) is what lets a StrictMode remount observe the
    // SAME shared promise without issuing a second `requestCredential()`
    // call.
    let settled = false;
    const finishRestoring = () => {
      if (!settled) {
        settled = true;
        // Clear the "needed" flag once this attempt has actually settled (or
        // been capped) so the ref's meaning stays "restoration is pending",
        // not "restoration was ever needed" — a later re-run of this effect
        // (e.g. a `bypassAuth`/`configured` flip) won't re-arm a cap against
        // an already-finished attempt.
        restorationNeededRef.current = false;
        setIsRestoring(false);
      }
    };
    const capTimeoutId = setTimeout(finishRestoring, BOOTSTRAP_RESOLVING_TIMEOUT_MS);
    void restorePromiseRef.current?.finally(finishRestoring);

    return () => {
      clearTimeout(capTimeoutId);
    };
    // `bypassAuth`/`configured` both derive from module-level env constants
    // (`isBypassAuthEnabled()`, `isGoogleSignInConfigured()`) that cannot
    // change during a page's lifetime, so this effect only ever mounts once
    // in practice — a dep change mid-restoration re-arming a fresh cap
    // instead of honoring the original deadline is not a reachable path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bypassAuth, configured]);

  // Recompute expiry lazily on an interval so `isExpired` reflects reality
  // without requiring a credential-triggered re-render.
  useEffect(() => {
    if (!credential) {
      return;
    }
    const interval = setInterval(() => forceTick((n) => n + 1), MILLISECONDS_PER_SECOND * 30);
    return () => clearInterval(interval);
  }, [credential]);

  useEffect(() => {
    return () => {
      clearRenewalTimer();
      clearWatchdogTimer();
    };
  }, [clearRenewalTimer, clearWatchdogTimer]);

  const logout = useCallback((marker: AuthProviderMarker = 'signed-out') => {
    clearRenewalTimer();
    clearWatchdogTimer();
    pinnedSubRef.current = null;
    credentialRef.current = null;
    setCredential(null);
    setIdToken(null);
    setNeedsReauth(false);
    clearLastGoogleSub();
    setAuthProviderMarker(marker);
    // Only fully disable auto-select (opt the browser out of silent restore)
    // on a real sign-out — switching to Microsoft shouldn't burn that bridge.
    if (marker === 'signed-out') {
      try {
        window.google?.accounts.id.disableAutoSelect();
      } catch {
        // Best-effort only.
      }
    }
  }, [clearRenewalTimer, clearWatchdogTimer]);

  return {
    isConfigured: configured,
    isReady,
    isRestoring,
    credential,
    idToken,
    isExpired: computeIsExpired(credential),
    needsReauth,
    error,
    ensureInitialized,
    requestCredential,
    logout,
    clearError,
  };
}

/**
 * Thin context-provider wrapper around `useGoogleAuthState()`, kept only for
 * the isolated `GoogleAuthProvider.*.test.tsx` suites — the app itself mounts
 * `AuthProvider`, which calls the hook directly and re-provides
 * `GoogleAuthContext` for `GoogleSignInButton`.
 */
export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const value = useGoogleAuthState();
  return (
    <GoogleAuthContext.Provider value={value}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

/**
 * Falls back to an inert, unconfigured stub when rendered outside a
 * `GoogleAuthProvider` (e.g. hooks/tests exercised without the full provider
 * tree) so consumers can treat "no provider" the same as "Google disabled"
 * rather than crashing.
 */
const DEFAULT_GOOGLE_AUTH_CONTEXT: GoogleAuthContextValue = {
  isConfigured: false,
  isReady: false,
  isRestoring: false,
  credential: null,
  idToken: null,
  isExpired: false,
  needsReauth: false,
  error: null,
  ensureInitialized: async () => {
    throw new Error('Google sign-in is not available.');
  },
  requestCredential: async () => {},
  logout: () => {},
  clearError: () => {},
};

export function useGoogleAuth(): GoogleAuthContextValue {
  const context = useContext(GoogleAuthContext);
  return context ?? DEFAULT_GOOGLE_AUTH_CONTEXT;
}
