/**
 * Real-provider-ordering integration test.
 *
 * Renders the ACTUAL production composition — `MsalProvider` wrapping
 * `AuthProvider` (`app/layout.tsx`'s exact nesting for these two providers)
 * — to verify the bootstrap-ownership contract: `MsalProvider` only
 * initializes MSAL and hands off a captured redirect result; `AuthProvider`
 * (via the `useGoogleAuthState()` hook it calls directly) is the sole
 * post-resolution selector, gated by the persisted provider marker.
 *
 * Earlier revisions of this test mounted `MsalProvider` + the standalone
 * `GoogleAuthProvider` wrapper instead of `AuthProvider` — that wrapper is
 * not part of the app tree (see `lib/auth/GoogleAuthProvider.tsx`), so a
 * regression in `AuthProvider`'s own composition/ordering could pass this
 * suite while failing in the deployed app. Only `@azure/msal-browser`'s
 * `PublicClientApplication` is mocked, at the SDK boundary; `@azure/msal-react`
 * itself is real, so `AuthProvider`'s `useMsal()` call resolves through the
 * genuine context `lib/auth/MsalProvider.tsx` provides — exactly as in
 * production.
 */
import { StrictMode, type ReactNode } from 'react';
import { render, renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AccountInfo, AuthenticationResult, EventMessage } from '@azure/msal-browser';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { useAuth } from '@/lib/auth/useAuth';
import { useFetchChatHistory } from '@/app/chat/hooks/useFetchChatHistory';
import { useSendMessage } from '@/app/chat/hooks/useSendMessage';
import { useStreamingResponse } from '@/app/chat/hooks/useStreamingResponse';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';
import { MsalProvider } from '@/lib/auth/MsalProvider';
import {
  getAuthProviderMarker,
  setAuthProviderMarker,
  setLastGoogleSub,
} from '@/lib/auth/authProviderMarker';
import { loadGoogleGsiScript } from '@/lib/auth/googleGsiLoader';
import { resetMsTokenStoreForTests } from '@/lib/auth/msTokenStore';

jest.mock('@/lib/auth/googleGsiLoader', () => ({
  loadGoogleGsiScript: jest.fn(),
}));

const mockLoadGoogleGsiScript = loadGoogleGsiScript as jest.MockedFunction<
  typeof loadGoogleGsiScript
>;

type EventCallback = (message: EventMessage) => void;

interface MockMsalInstance {
  initialize: jest.Mock<Promise<void>, []>;
  initializeWrapperLibrary: jest.Mock<void, unknown[]>;
  handleRedirectPromise: jest.Mock<Promise<AuthenticationResult | null>, []>;
  getAllAccounts: jest.Mock<AccountInfo[], []>;
  getActiveAccount: jest.Mock<AccountInfo | null, []>;
  setActiveAccount: jest.Mock<void, [AccountInfo | null]>;
  addEventCallback: jest.Mock<string, [EventCallback]>;
  removeEventCallback: jest.Mock<void, [string]>;
  getLogger: jest.Mock;
  acquireTokenSilent: jest.Mock<Promise<AuthenticationResult>, [unknown]>;
  acquireTokenPopup: jest.Mock<Promise<AuthenticationResult>, [unknown]>;
}

// The mock instance is created INSIDE the factory (never referencing an
// outer `const`) and exposed on the mocked module's exports, then retrieved
// via `jest.requireMock` below — `jest.mock()` factories are hoisted above
// this file's own top-level `const`s, so closing over an outer variable here
// would throw "Cannot access before initialization" the moment
// `MsalProvider.tsx` constructs `new PublicClientApplication(...)`.
jest.mock('@azure/msal-browser', () => {
  const actual = jest.requireActual('@azure/msal-browser');
  const listeners = new Map<string, (message: unknown) => void>();
  let nextId = 0;

  const noopLogger = {
    verbose: () => {},
    info: () => {},
    warning: () => {},
    error: () => {},
    clone: () => noopLogger,
  };

  const instance: MockMsalInstance = {
    initialize: jest.fn(),
    initializeWrapperLibrary: jest.fn(),
    handleRedirectPromise: jest.fn(),
    getAllAccounts: jest.fn(),
    getActiveAccount: jest.fn(),
    setActiveAccount: jest.fn(),
    addEventCallback: jest.fn((cb: EventCallback) => {
      const id = String(nextId++);
      listeners.set(id, cb as (message: unknown) => void);
      return id;
    }),
    removeEventCallback: jest.fn((id: string) => {
      listeners.delete(id);
    }),
    getLogger: jest.fn().mockReturnValue(noopLogger),
    acquireTokenSilent: jest.fn(),
    acquireTokenPopup: jest.fn(),
  };

  return {
    ...actual,
    PublicClientApplication: jest.fn().mockImplementation(() => instance),
    __mockMsalInstance: instance,
  };
});

const mockMsalInstance = (
  jest.requireMock('@azure/msal-browser') as {
    __mockMsalInstance: MockMsalInstance;
  }
).__mockMsalInstance;

const mockAccount: AccountInfo = {
  homeAccountId: 'home-account-1',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'test@example.com',
  localAccountId: 'local-account-1',
  name: 'Test User',
} as AccountInfo;

function makeCredential(sub: string, email = `${sub}@example.com`): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub,
    email,
    email_verified: true,
    name: 'Test User',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

function renderProviders() {
  return render(
    <MsalProvider>
      <AuthProvider>
        <div />
      </AuthProvider>
    </MsalProvider>,
  );
}

/** Renders the same production composition with `useAuth()` observable. */
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MsalProvider>
      <AuthProvider>{children}</AuthProvider>
    </MsalProvider>
  );
}

describe('MsalProvider + AuthProvider bootstrap ordering (production composition)', () => {
  let promptMock: jest.Mock;
  let gisCredentialCallback: ((response: { credential: string; select_by?: string }) => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    // `AuthProvider` reads the shared msTokenStore singleton via
    // `useSyncExternalStore` — without resetting it, a token/error left by
    // an earlier test's Microsoft selection could leak into a later test in
    // this file (module state isn't torn down by unmounting).
    resetMsTokenStoreForTests();
    mockMsalInstance.initialize.mockResolvedValue(undefined);
    mockMsalInstance.handleRedirectPromise.mockResolvedValue(null);
    mockMsalInstance.getAllAccounts.mockReturnValue([]);
    mockMsalInstance.getActiveAccount.mockReturnValue(null);

    mockLoadGoogleGsiScript.mockResolvedValue(undefined);
    promptMock = jest.fn();
    gisCredentialCallback = null;
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: jest.fn(
            (config: { callback: (response: { credential: string; select_by?: string }) => void }) => {
              gisCredentialCallback = config.callback;
            },
          ),
          prompt: promptMock,
          disableAutoSelect: jest.fn(),
          renderButton: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
  });

  it('selects a cached account exactly once when no marker has ever been persisted', async () => {
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);

    renderProviders();

    await waitFor(() => {
      expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    });
    // Exactly one selection call — from AuthProvider's post-resolution
    // controller. MsalProvider itself never calls setActiveAccount.
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledTimes(1);
  });

  it('selects a cached account when the marker is "microsoft"', async () => {
    setAuthProviderMarker('microsoft');
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);

    renderProviders();

    await waitFor(() => {
      expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    });
  });

  it('never selects a cached account when the marker is "google"', async () => {
    setAuthProviderMarker('google');
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);

    renderProviders();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
  });

  it('never selects a cached account when the marker is "signed-out"', async () => {
    setAuthProviderMarker('signed-out');
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);

    renderProviders();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
  });

  it('selects a captured redirect result as an explicit Microsoft login, overriding a stale non-microsoft marker', async () => {
    setAuthProviderMarker('google');
    mockMsalInstance.handleRedirectPromise.mockResolvedValue({
      account: mockAccount,
    } as AuthenticationResult);

    renderProviders();

    await waitFor(() => {
      expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    });
    expect(getAuthProviderMarker()).toBe('microsoft');
  });

  it('does not select any account before MsalProvider finishes initializing', async () => {
    let resolveInit: () => void = () => {};
    mockMsalInstance.initialize.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInit = resolve;
      }),
    );
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);

    renderProviders();

    // AuthProvider (and its bootstrap effect) can't even mount yet —
    // MsalProvider is still gating children behind its init promise.
    expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();

    await act(async () => {
      resolveInit();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    });
  });

  it('selects exactly once under a StrictMode double-invoked effect (consume-once holder)', async () => {
    mockMsalInstance.handleRedirectPromise.mockResolvedValue({
      account: mockAccount,
    } as AuthenticationResult);

    render(
      <StrictMode>
        <MsalProvider>
          <AuthProvider>
            <div />
          </AuthProvider>
        </MsalProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    });
    // The consume-once holder's real job is to keep account SELECTION
    // idempotent under StrictMode — verified here regardless of how many
    // times the underlying SDK's handleRedirectPromise/initialize were
    // invoked (see below).
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledTimes(1);
    expect(getAuthProviderMarker()).toBe('microsoft');
    // `lib/auth/MsalProvider.tsx`'s OWN init effect body is guarded by
    // `initStartedRef` and must run its async body (and therefore call
    // `handleRedirectPromise`/`initialize`) exactly once even though
    // StrictMode double-invokes the effect function itself. We can't assert
    // an exact call count directly on the mock here because the REAL
    // `@azure/msal-react` `MsalProvider` (rendered, unmocked, around
    // `children`) also calls `instance.initialize()` and
    // `instance.handleRedirectPromise()` from its own internal effect —
    // and that internal effect is itself double-invoked by StrictMode,
    // independently of our guard. That is real, documented msal-react
    // behavior (it always processes redirect responses itself) and is
    // harmless: msal-browser's redirect handling is idempotent after the
    // first real call consumes the navigation state, and — critically —
    // nothing reads msal-react's own internal handleRedirectPromise result,
    // so it can never repopulate `pendingRedirectAccount` or cause a second
    // selection. The `setActiveAccount`-called-once assertion above is what
    // actually proves the consume-once holder worked.
    expect(mockMsalInstance.handleRedirectPromise).toHaveBeenCalled();
    expect(mockMsalInstance.initialize).toHaveBeenCalled();
  });

  it('reflects an active MSAL account (activated via setActiveAccount) as the authenticated identity once resolved', async () => {
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);
    mockMsalInstance.setActiveAccount.mockImplementation(() => {
      mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current?.status).toBe('authenticated');
    });
    expect(result.current?.provider).toBe('microsoft');
    expect(result.current?.authIdentityKey).toBe(`microsoft:${mockAccount.homeAccountId}`);
  });

  it('never exposes an authenticated identity for a cached MSAL account when the marker is "google"', async () => {
    setAuthProviderMarker('google');
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current?.status).toBe('unauthenticated');
    });
    expect(result.current?.authIdentityKey).toBeNull();
    expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
  });

  describe('restoration trigger (post-reload silent prompt)', () => {
    it('invokes prompt() exactly once when the marker is "google" and a subject pin is persisted', async () => {
      setAuthProviderMarker('google');
      setLastGoogleSub('sub-123');

      renderProviders();

      await waitFor(() => {
        expect(promptMock).toHaveBeenCalledTimes(1);
      });
    });

    it('does not invoke prompt() when the marker is "google" but no subject pin is persisted', async () => {
      setAuthProviderMarker('google');

      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current?.status).toBe('unauthenticated');
      });
      expect(promptMock).not.toHaveBeenCalled();
    });

    const nonRestoringMarkers: Array<[string, 'microsoft' | 'signed-out' | null]> = [
      ['no marker persisted', null],
      ['marker "microsoft"', 'microsoft'],
      ['marker "signed-out"', 'signed-out'],
    ];

    it.each(nonRestoringMarkers)(
      'does not invoke prompt() when %s, even with a stale subject pin',
      async (_label, marker) => {
        if (marker) {
          setAuthProviderMarker(marker);
        }
        setLastGoogleSub('sub-123');

        const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

        await waitFor(() => {
          expect(result.current?.status).not.toBe('resolving');
        });
        expect(promptMock).not.toHaveBeenCalled();
      },
    );
  });

  describe('restoration outcome (post-reload credential arrival)', () => {
    it('restores the Google session when the automatic credential matches the persisted subject pin', async () => {
      setAuthProviderMarker('google');
      setLastGoogleSub('sub-123');

      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(promptMock).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(gisCredentialCallback).not.toBeNull();
      });

      act(() => {
        gisCredentialCallback!({ credential: makeCredential('sub-123'), select_by: 'auto' });
      });

      await waitFor(() => {
        expect(result.current?.status).toBe('authenticated');
      });
      expect(result.current?.provider).toBe('google');
      expect(result.current?.authIdentityKey).toBe('google:sub-123');
      // A restoring credential must never touch MSAL selection.
      expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
    });

    it('leaves the user unauthenticated with no error when the automatic credential subject does not match the pin', async () => {
      setAuthProviderMarker('google');
      setLastGoogleSub('sub-123');

      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(gisCredentialCallback).not.toBeNull();
      });

      act(() => {
        gisCredentialCallback!({ credential: makeCredential('sub-999'), select_by: 'auto' });
      });

      await waitFor(() => {
        expect(result.current?.status).toBe('unauthenticated');
      });
      expect(result.current?.authIdentityKey).toBeNull();
      expect(result.current?.error).toBeNull();
    });

    it('leaves the user unauthenticated with no error when the restoration prompt is suppressed and no credential ever arrives', async () => {
      setAuthProviderMarker('google');
      setLastGoogleSub('sub-123');
      promptMock.mockImplementation(
        (listener?: (notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => void) => {
          listener?.({ isNotDisplayed: () => true, isSkippedMoment: () => false });
        },
      );

      const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

      await waitFor(() => {
        expect(promptMock).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(result.current?.status).toBe('unauthenticated');
      });
      expect(result.current?.authIdentityKey).toBeNull();
      expect(result.current?.error).toBeNull();
    });
  });

  describe('bootstrap resolution window (rule 0 inactivity)', () => {
    it('exposes status "resolving" with no identity/token before any GIS prompt or MSAL selection, then resolves', async () => {
      setAuthProviderMarker('google');
      setLastGoogleSub('sub-123');
      mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);

      const snapshots: Array<{
        status: string;
        authIdentityKey: string | null;
        accessToken: string | null;
        promptCallsSoFar: number;
        selectCallsSoFar: number;
      }> = [];

      function Snapshotter() {
        const value = useAuth();
        // Recorded during render, before this render's own effects (and
        // therefore before any GIS/MSAL call this render might trigger)
        // have run — so a 'resolving' entry here reflects the state as
        // exposed to consumers strictly before any bootstrap side effect
        // for that render could have fired.
        snapshots.push({
          status: value.status,
          authIdentityKey: value.authIdentityKey,
          accessToken: value.accessToken,
          promptCallsSoFar: promptMock.mock.calls.length,
          selectCallsSoFar: mockMsalInstance.setActiveAccount.mock.calls.length,
        });
        return null;
      }

      render(
        <MsalProvider>
          <AuthProvider>
            <Snapshotter />
          </AuthProvider>
        </MsalProvider>,
      );

      await waitFor(() => {
        expect(snapshots.some((s) => s.status !== 'resolving')).toBe(true);
      });

      const resolvingSnapshots = snapshots.filter((s) => s.status === 'resolving');
      expect(resolvingSnapshots.length).toBeGreaterThan(0);
      for (const snapshot of resolvingSnapshots) {
        expect(snapshot.authIdentityKey).toBeNull();
        expect(snapshot.accessToken).toBeNull();
        expect(snapshot.promptCallsSoFar).toBe(0);
        expect(snapshot.selectCallsSoFar).toBe(0);
      }

      // Only after resolution does the defined restoration trigger fire.
      await waitFor(() => {
        expect(promptMock).toHaveBeenCalledTimes(1);
      });
      expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
    });
  });

  describe('bootstrap resolving cap (decoupled from the GIS loader\'s own retry timeout)', () => {
    it('leaves "resolving" after ~5s even if the GIS script load hangs indefinitely, without waiting on the loader\'s own longer timeout', async () => {
      // Regression test: an earlier revision gated `isRestoring` solely on
      // the restoration attempt settling, which in turn waited on
      // `loadGoogleGsiScript()`'s own 20s bound — so a hung/blocked GIS
      // load (no `load`, no `error`, ever) left BOTH sign-in surfaces'
      // Microsoft button disabled for the full 20s, since `isResolving`
      // disables it too. The bootstrap effect must cap its own wait
      // independently and flip out of "resolving" regardless of whether the
      // underlying restoration attempt has settled.
      jest.useFakeTimers();
      try {
        setAuthProviderMarker('google');
        setLastGoogleSub('sub-123');
        // Simulate an indefinitely hung script load — this promise never
        // settles. `loadGoogleGsiScript` is mocked at the module boundary
        // in this file, so its own internal 20s timeout doesn't apply here;
        // this test is purely about AuthProvider's own cap.
        mockLoadGoogleGsiScript.mockReturnValue(new Promise<void>(() => {}));

        const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

        // `MsalProvider` gates its children (and therefore `AuthProvider`,
        // and this hook) behind its own async initialize()/
        // handleRedirectPromise() chain — `renderHook` is synchronous and
        // does not drain that microtask queue, so `result.current` is
        // `undefined` until it's flushed. Flush it (advancing 0ms is enough
        // to resolve already-settled promises) before asserting anything.
        await act(async () => {
          await jest.advanceTimersByTimeAsync(0);
        });

        expect(result.current?.status).toBe('resolving');

        // Pin the cap to its intended ~5s value, not merely "sooner than
        // the loader's 20s timeout" — still resolving just under the cap...
        await act(async () => {
          await jest.advanceTimersByTimeAsync(4_000);
        });
        expect(result.current?.status).toBe('resolving');

        // ...and past it.
        await act(async () => {
          await jest.advanceTimersByTimeAsync(1_000);
        });

        expect(result.current?.status).toBe('unauthenticated');
        // Nothing was selected while capped-out — the underlying restoration
        // attempt is still pending in the background, not abandoned/errored.
        expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
        expect(result.current?.error).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('restoration trigger under StrictMode (regression: unmount cleanup must not strand isRestoring)', () => {
    it('resolves out of "resolving" when the bootstrap effect is double-invoked by StrictMode', async () => {
      // Regression test for a defect where the bootstrap effect's unmount
      // cleanup set a `settled` flag shared with the in-flight restoration
      // attempt's `.finally()` handler. Under React development/StrictMode,
      // the effect runs, its cleanup runs (simulated unmount), then the
      // effect runs again on the same fiber; `bootstrapAttemptedRef` makes
      // the second run bail out immediately without re-arming anything. If
      // the first run's cleanup also marks the attempt "settled", the first
      // run's still-in-flight `requestCredential(...).finally()` later finds
      // `settled` already true and no-ops — so `setIsRestoring(false)` is
      // never called, and `status` is stuck at `'resolving'` forever. The
      // fix clears only the cap timer in the cleanup, not the `settled`
      // flag, so the original in-flight attempt can still finish normally.
      setAuthProviderMarker('google');
      setLastGoogleSub('sub-123');

      function StrictWrapper({ children }: { children: ReactNode }) {
        return (
          <StrictMode>
            <MsalProvider>
              <AuthProvider>{children}</AuthProvider>
            </MsalProvider>
          </StrictMode>
        );
      }

      const { result } = renderHook(() => useAuth(), { wrapper: StrictWrapper });

      await waitFor(() => {
        expect(promptMock).toHaveBeenCalled();
      });

      await waitFor(
        () => {
          expect(result.current?.status).not.toBe('resolving');
        },
        { timeout: 5_000 },
      );

      expect(result.current?.status).toBe('unauthenticated');
      expect(result.current?.error).toBeNull();
    });

    it('still enforces the ~5s resolving cap when the restoration attempt hangs and the effect is double-invoked', async () => {
      // Regression test for a second, independent StrictMode defect in the
      // same bootstrap effect: the one-time side-effect guard
      // (`bootstrapAttemptedRef`) used to gate the ENTIRE effect body,
      // including arming the cap timer. Under StrictMode (run 1 arms cap
      // timer A and starts the restoration attempt; cleanup clears timer A;
      // run 2 bails out at the top of the guard and returns early) no cap
      // timer was ever re-armed for run 2 — so if the underlying restoration
      // attempt hangs indefinitely (e.g. a stuck GIS script load), nothing
      // ever bounds `isRestoring`, and the app is stuck showing the
      // resolving/loading treatment on both sign-in surfaces forever. The
      // fix re-arms a fresh cap timer on every mount of the effect
      // (including a StrictMode remount) while still starting the
      // underlying restoration request at most once.
      jest.useFakeTimers();
      try {
        setAuthProviderMarker('google');
        setLastGoogleSub('sub-123');
        mockLoadGoogleGsiScript.mockReturnValue(new Promise<void>(() => {}));

        function StrictWrapper({ children }: { children: ReactNode }) {
          return (
            <StrictMode>
              <MsalProvider>
                <AuthProvider>{children}</AuthProvider>
              </MsalProvider>
            </StrictMode>
          );
        }

        const { result } = renderHook(() => useAuth(), { wrapper: StrictWrapper });

        await act(async () => {
          await jest.advanceTimersByTimeAsync(0);
        });
        expect(result.current?.status).toBe('resolving');

        await act(async () => {
          await jest.advanceTimersByTimeAsync(4_000);
        });
        expect(result.current?.status).toBe('resolving');

        await act(async () => {
          await jest.advanceTimersByTimeAsync(1_000);
        });

        expect(result.current?.status).toBe('unauthenticated');
        expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
        expect(result.current?.error).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('chat and Graph inactivity through the real composition (rule 0 + provider isolation)', () => {
    function ChatAndPhotoConsumer({
      onSnapshot,
      onHandles,
    }: {
      onSnapshot: (v: { status: string; photoLoading: boolean }) => void;
      onHandles?: (v: {
        acquireToken: () => Promise<string | null>;
        sendMessage: ReturnType<typeof useSendMessage>['sendMessage'];
        sendStreamingMessage: ReturnType<
          typeof useStreamingResponse
        >['sendStreamingMessage'];
      }) => void;
    }) {
      const { status, acquireToken } = useAuth();
      const { isLoading: photoLoading } = useProfilePhoto();
      useFetchChatHistory('chat-1');
      const { sendMessage } = useSendMessage('chat-1');
      const { sendStreamingMessage } = useStreamingResponse({ chatId: 'chat-1' });
      onSnapshot({ status, photoLoading });
      onHandles?.({ acquireToken, sendMessage, sendStreamingMessage });
      return null;
    }

    function renderWithQueryClient(
      onSnapshot: (v: { status: string; photoLoading: boolean }) => void,
      onHandles?: Parameters<typeof ChatAndPhotoConsumer>[0]['onHandles'],
    ) {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      return render(
        <QueryClientProvider client={queryClient}>
          <MsalProvider>
            <AuthProvider>
              <ChatAndPhotoConsumer onSnapshot={onSnapshot} onHandles={onHandles} />
            </AuthProvider>
          </MsalProvider>
        </QueryClientProvider>,
      );
    }

    it.each([
      ['marker "google"', 'google'] as const,
      ['marker "signed-out"', 'signed-out'] as const,
    ])(
      // A marker-absent reload IS expected to restore the cached Microsoft
      // account and become authenticated (covered separately below) — only
      // 'google' and 'signed-out' are expected to stay unauthenticated
      // despite a cached MSAL account (state-machine rules 1-2).
      'issues no chat-history/send/streaming fetch and no Graph photo request while resolving or unauthenticated, and acquireToken() resolves null (%s, cached MSAL account present)',
      async (_label, marker) => {
        setAuthProviderMarker(marker);
        mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);
        // Model MSAL's own internally-restored "active account" pointer,
        // which `PublicClientApplication` can populate from its browser
        // cache during `initialize()` independent of anything this app's
        // code does. The marker (not this pointer) must be what gates
        // provider resolution and token acquisition (state-machine rules
        // 1-2) — otherwise `acquireToken()`/`accessToken` could fail open
        // and leak a Microsoft token for a session this provider never
        // selected.
        mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
        const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
          new Response(JSON.stringify({}), { status: 200 }),
        );

        const statuses: string[] = [];
        let handles: {
          acquireToken: () => Promise<string | null>;
          sendMessage: ReturnType<typeof useSendMessage>['sendMessage'];
          sendStreamingMessage: ReturnType<
            typeof useStreamingResponse
          >['sendStreamingMessage'];
        } | null = null;
        renderWithQueryClient(
          ({ status }) => statuses.push(status),
          (h) => {
            handles = h;
          },
        );

        await waitFor(() => {
          expect(statuses.some((s) => s !== 'resolving')).toBe(true);
        });
        await waitFor(() => {
          expect(statuses[statuses.length - 1]).toBe('unauthenticated');
        });

        // No chat-history call (accessToken stayed null throughout) and no
        // Graph profile-photo call (provider never resolved to 'microsoft').
        const requestedUrls = fetchSpy.mock.calls.map((call) => String(call[0]));
        expect(requestedUrls.some((url) => url.includes('/api/chat/'))).toBe(false);
        expect(requestedUrls.some((url) => url.includes('graph.microsoft.com'))).toBe(false);

        // Explicit token acquisition while unauthenticated resolves null —
        // no MSAL popup/redirect is triggered for an account this provider
        // never selected, and Google has no credential to hand back.
        await expect(handles!.acquireToken()).resolves.toBeNull();

        // useSendMessage/useStreamingResponse are the other two real chat
        // consumers the review flagged as unexercised — both must refuse to
        // hit the network while unauthenticated rather than sending a null
        // bearer.
        await expect(
          handles!.sendMessage({ content: 'hi', chatId: 'chat-1' }),
        ).rejects.toThrow();
        await act(async () => {
          await handles!.sendStreamingMessage('hi');
        });

        const requestedUrlsAfterAttempts = fetchSpy.mock.calls.map((call) =>
          String(call[0]),
        );
        expect(
          requestedUrlsAfterAttempts.some(
            (url) => url === '/api/chat' || url.endsWith('/api/chat/stream'),
          ),
        ).toBe(false);

        fetchSpy.mockRestore();
      },
      // useSendMessage's built-in retry (up to MAX_RETRY_COUNT with real
      // exponential backoff, ~7s) runs to exhaustion before mutateAsync
      // rejects, since it retries on any non-401/400 error including this
      // client-side "not authenticated" guard.
      15000,
    );

    it('issues no chat-history/send/streaming fetch or Graph request during the resolving window for a marker-absent Microsoft restoration, and acquireToken()/sendMessage()/sendStreamingMessage() succeed with the restored Microsoft bearer after resolution', async () => {
      mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);
      mockMsalInstance.setActiveAccount.mockImplementation(() => {
        mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
      });
      mockMsalInstance.acquireTokenSilent.mockResolvedValue({
        authority: 'https://login.microsoftonline.com/common',
        uniqueId: 'unique',
        tenantId: mockAccount.tenantId,
        scopes: ['api://test-client/chat.Access'],
        account: mockAccount,
        idToken: 'id-token',
        idTokenClaims: {},
        accessToken: 'restored-microsoft-token',
        fromCache: false,
        expiresOn: new Date(Date.now() + 60_000),
        tokenType: 'Bearer',
        correlationId: 'correlation',
      } as AuthenticationResult);

      // Minimal well-formed SSE body: one `message_complete` event is enough
      // for useStreamingResponse's read loop to finish without error.
      function sseStreamResponse(): Response {
        const body =
          'event: message_complete\ndata: {"messageId":"m1","content":"hi"}\n\n';
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }

      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();

          if (url.endsWith('/api/chat/stream')) {
            return Promise.resolve(sseStreamResponse());
          }

          if (url === '/api/chat' && init?.method === 'POST') {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  data: {
                    userMessage: {
                      id: 'user-1',
                      chatId: 'chat-1',
                      role: 'user',
                      content: 'hi',
                      status: 'sent',
                      parentMessageId: null,
                      metadata: null,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    aiMessage: {
                      id: 'ai-1',
                      chatId: 'chat-1',
                      role: 'assistant',
                      content: 'hello',
                      status: 'sent',
                      parentMessageId: 'user-1',
                      metadata: null,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    chatId: 'chat-1',
                  },
                }),
                { status: 200 },
              ),
            );
          }

          return Promise.resolve(
            new Response(
              JSON.stringify({ data: { chat: null, messages: [], pagination: {} } }),
              { status: 200 },
            ),
          );
        });

      const snapshots: Array<{ status: string; fetchCallsSoFar: number }> = [];
      let handles: {
        acquireToken: () => Promise<string | null>;
        sendMessage: ReturnType<typeof useSendMessage>['sendMessage'];
        sendStreamingMessage: ReturnType<
          typeof useStreamingResponse
        >['sendStreamingMessage'];
      } | null = null;

      // Reuses the same four-consumer surface (history, photo, send,
      // streaming, plus explicit acquireToken) the google/signed-out
      // inactivity cases above exercise, so the marker-absent resolving
      // window is checked against the full consumer matrix rather than
      // only history/profile-photo.
      renderWithQueryClient(
        ({ status }) =>
          snapshots.push({ status, fetchCallsSoFar: fetchSpy.mock.calls.length }),
        (h) => {
          handles = h;
        },
      );

      await waitFor(() => {
        expect(snapshots.some((s) => s.status === 'authenticated')).toBe(true);
      });

      const resolvingSnapshots = snapshots.filter((s) => s.status === 'resolving');
      expect(resolvingSnapshots.length).toBeGreaterThan(0);
      for (const snapshot of resolvingSnapshots) {
        expect(snapshot.fetchCallsSoFar).toBe(0);
      }

      // Once resolved to the restored Microsoft session, every mounted
      // consumer (history, photo, send, streaming, explicit acquireToken)
      // must actually be usable — not merely present — proving the
      // resolving-window inactivity above wasn't observed on a permanently
      // disabled hook. Each is exercised and asserted to use the restored
      // Microsoft bearer on the wire.
      expect(handles).not.toBeNull();

      const acquiredToken = await handles!.acquireToken();
      expect(acquiredToken).toBe('restored-microsoft-token');

      await handles!.sendMessage({ content: 'hi', chatId: 'chat-1' });
      const sendCall = fetchSpy.mock.calls.find(
        ([url]) => url === '/api/chat',
      );
      expect(sendCall).toBeDefined();
      expect(
        (sendCall![1]?.headers as Record<string, string>).Authorization,
      ).toBe('Bearer restored-microsoft-token');

      await act(async () => {
        await handles!.sendStreamingMessage('hi');
      });
      const streamCall = fetchSpy.mock.calls.find(([url]) =>
        String(url).endsWith('/api/chat/stream'),
      );
      expect(streamCall).toBeDefined();
      expect(
        (streamCall![1]?.headers as Record<string, string>).Authorization,
      ).toBe('Bearer restored-microsoft-token');

      fetchSpy.mockRestore();
    });
  });
});
