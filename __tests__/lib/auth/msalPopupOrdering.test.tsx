/**
 * Popup-login / real-MSAL-event ordering regression test.
 *
 * Unlike `useAuth.test.tsx` (which mocks `@azure/msal-react`'s `useMsal()`
 * wholesale) this test renders the REAL `@azure/msal-react` `MsalProvider`
 * component wrapping the REAL `useAuth()` facade, mocking only
 * `@azure/msal-browser`'s `PublicClientApplication` at the SDK boundary with
 * a controllable event emitter (`addEventCallback`/`__fireEvent`). This lets
 * us fire a genuine `LOGIN_SUCCESS` event through msal-react's own event
 * pipeline (which msal-react's `MsalProvider` consumes internally to track
 * `inProgress`/`accounts`) and confirm that doing so does NOT trigger a
 * second `setActiveAccount` call — the facade's popup-login path
 * (`useAuth.ts`) is the only account-selection call site in this flow, and
 * `lib/auth/MsalProvider.tsx` itself never calls `setActiveAccount` at all
 * (`grep -n "setActiveAccount" lib/auth/MsalProvider.tsx` returns nothing).
 */
import { type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AccountInfo, AuthenticationResult, EventMessage } from '@azure/msal-browser';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { MsalProvider } from '@/lib/auth/MsalProvider';
import { getAuthProviderMarker } from '@/lib/auth/authProviderMarker';

type EventCallback = (message: EventMessage) => void;

interface MockMsalInstance {
  initialize: jest.Mock<Promise<void>, []>;
  initializeWrapperLibrary: jest.Mock<void, unknown[]>;
  handleRedirectPromise: jest.Mock<Promise<AuthenticationResult | null>, []>;
  getAllAccounts: jest.Mock<AccountInfo[], []>;
  getActiveAccount: jest.Mock<AccountInfo | null, []>;
  setActiveAccount: jest.Mock<void, [AccountInfo | null]>;
  loginPopup: jest.Mock<Promise<AuthenticationResult>, [unknown?]>;
  addEventCallback: jest.Mock<string, [EventCallback]>;
  removeEventCallback: jest.Mock<void, [string]>;
  getLogger: jest.Mock;
}

// The mock instance and its event listener registry are created INSIDE the
// factory (never referencing an outer `const`) because `jest.mock()`
// factories are hoisted above this file's own top-level `const`s — closing
// over an outer variable here would throw "Cannot access before
// initialization" the moment `MsalProvider.tsx` constructs
// `new PublicClientApplication(...)` at module-eval time.
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
    initialize: jest.fn().mockResolvedValue(undefined),
    initializeWrapperLibrary: jest.fn(),
    handleRedirectPromise: jest.fn().mockResolvedValue(null),
    getAllAccounts: jest.fn().mockReturnValue([]),
    getActiveAccount: jest.fn().mockReturnValue(null),
    setActiveAccount: jest.fn(),
    loginPopup: jest.fn(),
    addEventCallback: jest.fn((cb: EventCallback) => {
      const id = String(nextId++);
      listeners.set(id, cb as (message: unknown) => void);
      return id;
    }),
    removeEventCallback: jest.fn((id: string) => {
      listeners.delete(id);
    }),
    getLogger: jest.fn().mockReturnValue(noopLogger),
  };

  return {
    ...actual,
    PublicClientApplication: jest.fn().mockImplementation(() => instance),
    __mockMsalInstance: instance,
    __fireEvent: (message: unknown) => {
      listeners.forEach((cb) => cb(message));
    },
  };
});

jest.mock('@/lib/auth/bypass', () => ({
  BYPASS_ACCESS_TOKEN: 'bypass-token',
  isBypassAuthEnabled: jest.fn(() => false),
}));

jest.mock('@/lib/auth/GoogleAuthProvider', () => ({
  useGoogleAuthState: jest.fn(() => ({
    isConfigured: false,
    isReady: true,
    isRestoring: false,
    credential: null,
    idToken: null,
    isExpired: false,
    needsReauth: false,
    error: null,
    ensureInitialized: jest.fn().mockResolvedValue(undefined),
    requestCredential: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn(),
    clearError: jest.fn(),
  })),
  GoogleAuthContext: {
    Provider: ({ children }: { children: unknown }) => children,
  },
}));

const { __mockMsalInstance: mockMsalInstance, __fireEvent: fireEvent } =
  jest.requireMock('@azure/msal-browser') as {
    __mockMsalInstance: MockMsalInstance;
    __fireEvent: (message: unknown) => void;
  };

const { EventType } = jest.requireActual('@azure/msal-browser');

const mockAccount: AccountInfo = {
  homeAccountId: 'home-account-1',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'test@example.com',
  localAccountId: 'local-account-1',
  name: 'Test User',
} as AccountInfo;

const authResult: AuthenticationResult = {
  authority: 'https://login.microsoftonline.com/common',
  uniqueId: 'unique',
  tenantId: mockAccount.tenantId,
  scopes: ['api://test-client/chat.Access'],
  account: mockAccount,
  idToken: 'id-token',
  idTokenClaims: {},
  accessToken: 'access-token',
  fromCache: false,
  expiresOn: new Date(Date.now() + 60_000),
  tokenType: 'Bearer',
  correlationId: 'correlation',
};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MsalProvider>
      <AuthProvider>{children}</AuthProvider>
    </MsalProvider>
  );
}

describe('MSAL popup login / real event-pipeline ordering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    mockMsalInstance.initialize.mockResolvedValue(undefined);
    mockMsalInstance.handleRedirectPromise.mockResolvedValue(null);
    mockMsalInstance.getAllAccounts.mockReturnValue([]);
    mockMsalInstance.getActiveAccount.mockReturnValue(null);
    mockMsalInstance.loginPopup.mockResolvedValue(authResult);
  });

  it('selects the account exactly once via the facade, persists the microsoft marker before selection, and a real LOGIN_SUCCESS event through msal-react does not trigger a second selection', async () => {
    const callOrder: Array<{
      step: string;
      markerAtCallTime: ReturnType<typeof getAuthProviderMarker>;
    }> = [];
    mockMsalInstance.setActiveAccount.mockImplementation(() => {
      callOrder.push({
        step: 'setActiveAccount',
        markerAtCallTime: getAuthProviderMarker(),
      });
    });

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    // MsalProvider shows a loading spinner (not children) until its own
    // initialize()/handleRedirectPromise() resolve, so the hook doesn't
    // mount until then.
    await waitFor(() => {
      expect(result.current).toBeDefined();
      expect(typeof result.current.login).toBe('function');
    });

    await act(async () => {
      await result.current.login('microsoft');
    });

    // (a) setActiveAccount called exactly once, by the facade's login path.
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledTimes(1);
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);

    // (c) The microsoft marker was already persisted at the moment
    // setActiveAccount was invoked — order-pinned via the marker's actual
    // sessionStorage state read from inside the setActiveAccount mock.
    expect(callOrder).toEqual([
      { step: 'setActiveAccount', markerAtCallTime: 'microsoft' },
    ]);

    // Now fire a REAL LOGIN_SUCCESS event through msal-react's own event
    // pipeline (registered by the real MsalProvider component via
    // `instance.addEventCallback`, not by our lib/auth/MsalProvider.tsx —
    // confirmed absent via `grep -n "setActiveAccount" lib/auth/MsalProvider.tsx`).
    mockMsalInstance.getAllAccounts.mockReturnValue([mockAccount]);
    await act(async () => {
      fireEvent({
        eventType: EventType.LOGIN_SUCCESS,
        interactionType: 'popup',
        payload: authResult,
        error: null,
        timestamp: Date.now(),
      });
      await Promise.resolve();
    });

    // (b) Still exactly one call, total — the real msal-react event pipeline
    // never calls setActiveAccount itself, so account selection stays
    // confined to the facade's single call site.
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledTimes(1);
    expect(mockMsalInstance.addEventCallback).toHaveBeenCalled();
  });
});
