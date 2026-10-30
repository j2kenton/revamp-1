import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@/lib/auth/useAuth';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import {
  InteractionStatus,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type SilentRequest,
} from '@azure/msal-browser';
import { useMsal, type IMsalContext } from '@azure/msal-react';
import {
  useGoogleAuthState,
  type GoogleAuthContextValue,
} from '@/lib/auth/GoogleAuthProvider';
import {
  getAuthProviderMarker,
  getLastGoogleSub,
  setAuthProviderMarker,
  setLastGoogleSub,
} from '@/lib/auth/authProviderMarker';
import { resetMsTokenStoreForTests } from '@/lib/auth/msTokenStore';

jest.mock('@azure/msal-react', () => ({
  useMsal: jest.fn(),
}));

jest.mock('@/lib/auth/bypass', () => ({
  BYPASS_ACCESS_TOKEN: 'bypass-token',
  isBypassAuthEnabled: jest.fn(() => false),
}));

jest.mock('@/lib/auth/GoogleAuthProvider', () => ({
  useGoogleAuthState: jest.fn(),
  GoogleAuthContext: {
    Provider: ({ children }: { children: unknown }) => children,
  },
}));

interface MockMsalInstance {
  loginPopup: jest.Mock<Promise<AuthenticationResult>, [unknown?]>;
  loginRedirect: jest.Mock<Promise<void>, [unknown?]>;
  logoutPopup: jest.Mock<Promise<void>, [unknown?]>;
  logoutRedirect: jest.Mock<Promise<void>, [unknown?]>;
  acquireTokenSilent: jest.Mock<Promise<AuthenticationResult>, [SilentRequest]>;
  acquireTokenPopup: jest.Mock<Promise<AuthenticationResult>, [unknown?]>;
  getAllAccounts: jest.Mock<AccountInfo[], []>;
  getActiveAccount: jest.Mock<AccountInfo | null, []>;
  setActiveAccount: jest.Mock<void, [AccountInfo | null]>;
}

const mockMsalInstance: MockMsalInstance = {
  loginPopup: jest.fn(),
  loginRedirect: jest.fn(),
  logoutPopup: jest.fn(),
  logoutRedirect: jest.fn(),
  acquireTokenSilent: jest.fn(),
  acquireTokenPopup: jest.fn(),
  getAllAccounts: jest.fn(),
  getActiveAccount: jest.fn(),
  setActiveAccount: jest.fn(),
};

const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  verbose: jest.fn(),
  warning: jest.fn(),
};

const mockUseMsal = useMsal as jest.MockedFunction<typeof useMsal>;
const mockUseGoogleAuth = useGoogleAuthState as jest.MockedFunction<
  typeof useGoogleAuthState
>;

const createMockGoogleAuth = (
  overrides: Partial<GoogleAuthContextValue> = {},
): GoogleAuthContextValue => ({
  isConfigured: true,
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
  ...overrides,
});

const createMockGoogleCredential = (
  overrides: Partial<NonNullable<GoogleAuthContextValue['credential']>> = {},
) => ({
  sub: 'google-sub-1',
  email: 'user@gmail.com',
  emailVerified: true,
  name: 'Google User',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  ...overrides,
});

const createMockAccount = (
  overrides: Partial<AccountInfo> = {},
): AccountInfo => ({
  homeAccountId: 'home-account',
  environment: 'login.microsoftonline.com',
  tenantId: 'tenant-id',
  username: 'test@example.com',
  localAccountId: 'local-account',
  name: 'Test User',
  idTokenClaims: {},
  ...overrides,
});

const createAuthResult = (
  account: AccountInfo,
  overrides: Partial<AuthenticationResult> = {},
): AuthenticationResult => ({
  authority: 'https://login.microsoftonline.com/common',
  uniqueId: 'unique',
  tenantId: account.tenantId,
  scopes: ['api://test-client/chat.Access'],
  account,
  idToken: 'id-token',
  idTokenClaims: {},
  accessToken: 'access-token',
  fromCache: false,
  expiresOn: new Date(Date.now() + 60_000),
  tokenType: 'Bearer',
  correlationId: 'correlation',
  ...overrides,
});

const setMsalContext = (overrides: Partial<IMsalContext> = {}): void => {
  const context: IMsalContext = {
    instance: mockMsalInstance as unknown as IMsalContext['instance'],
    accounts: [],
    inProgress: InteractionStatus.None,
    logger: mockLogger as unknown as IMsalContext['logger'],
    ...overrides,
  };

  mockUseMsal.mockReturnValue(context);
};

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockMsalInstance).forEach((fn) => fn.mockReset());
    window.sessionStorage.clear();
    resetMsTokenStoreForTests();
    setMsalContext();
    mockUseGoogleAuth.mockReturnValue(createMockGoogleAuth());
  });

  it('returns authenticated state when user is logged in', async () => {
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({
      accounts: [mockAccount],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.provider).toBe('microsoft');
      expect(result.current.authIdentityKey).toBe(
        `microsoft:${mockAccount.homeAccountId}`,
      );
      expect(result.current.user).toEqual({
        id: mockAccount.localAccountId,
        email: mockAccount.username,
        name: mockAccount.name,
      });
    });
  });

  it('does not report authenticated for a cached account that is not active', async () => {
    // A cached MSAL account with no active selection (e.g. the user last
    // signed in with Google) must not be treated as an authenticated session.
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(null);
    setMsalContext({
      accounts: [mockAccount],
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.provider).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('ignores an active MSAL account when the persisted marker says google', () => {
    // MSAL persists its own "active account" pointer in sessionStorage and
    // silently restores it on every initialize() — independent of app code.
    // A cached-and-still-active MSAL account must not count as authenticated
    // once the user's last explicit choice was Google (state-machine rule 2),
    // regardless of what MSAL's own cache still has selected.
    setAuthProviderMarker('google');
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.provider).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('ignores an active MSAL account when the persisted marker says signed-out', () => {
    setAuthProviderMarker('signed-out');
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.provider).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it('treats a cached MSAL account as authenticated when no marker has ever been persisted', () => {
    // First-visit / pre-existing users have no marker at all — this must
    // behave exactly like marker 'microsoft' (today's restoration behavior).
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.provider).toBe('microsoft');
  });

  it('exposes no provider, identity, or token while resolving even if MSAL has already auto-restored a cached account (rule 0)', () => {
    // MSAL's own initialize() can silently restore a cached active account
    // ahead of GoogleAuthProvider's bootstrap effect reading the marker.
    // Until that bootstrap effect settles (isRestoring flips false), no
    // provider/identity/token may be exposed, even though the marker would
    // otherwise authorize this exact account.
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });
    mockUseGoogleAuth.mockReturnValue(createMockGoogleAuth({ isRestoring: true }));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.status).toBe('resolving');
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.provider).toBeNull();
    expect(result.current.authIdentityKey).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  it('does not start Microsoft token acquisition while resolving, even with a cached active account', () => {
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });
    mockUseGoogleAuth.mockReturnValue(createMockGoogleAuth({ isRestoring: true }));

    renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(mockMsalInstance.acquireTokenSilent).not.toHaveBeenCalled();
  });

  it('handles login successfully', async () => {
    const mockAccount = createMockAccount();
    const authResult = createAuthResult(mockAccount, {
      accessToken: 'login-token',
    });
    mockMsalInstance.loginPopup.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login();
    });

    expect(mockMsalInstance.loginPopup).toHaveBeenCalledTimes(1);
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
  });

  it('persists the microsoft marker on popup success, with account selection performed solely by the facade', async () => {
    // MsalProvider registers no LOGIN_SUCCESS callback at all (see
    // MsalProvider.tsx) — the facade's popup path below is the only place
    // in the codebase that selects an account on login, and it must leave
    // the marker set afterward so a later reload restores the same account.
    const mockAccount = createMockAccount();
    const authResult = createAuthResult(mockAccount, {
      accessToken: 'login-token',
    });
    mockMsalInstance.loginPopup.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login('microsoft');
    });

    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledTimes(1);
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
    expect(getAuthProviderMarker()).toBe('microsoft');
  });

  it('clears a stale persisted Google restoration pin on an explicit Microsoft popup login', async () => {
    // A prior page load could have left `lastGoogleSub` set (marker
    // 'google') without ever restoring a live credential this session. An
    // explicit switch to Microsoft must clear that pin so a stray later
    // automatic Google credential can't be accepted as a "restoration" of
    // an account the user has since switched away from.
    setLastGoogleSub('stale-google-sub');
    const mockAccount = createMockAccount();
    mockMsalInstance.loginPopup.mockResolvedValue(
      createAuthResult(mockAccount),
    );

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login('microsoft');
    });

    expect(getLastGoogleSub()).toBeNull();
  });

  it('clears a stale persisted Google restoration pin before an explicit Microsoft redirect login', async () => {
    setLastGoogleSub('stale-google-sub');
    Object.defineProperty(window, 'opener', {
      value: { some: 'opener' },
      configurable: true,
    });
    mockMsalInstance.loginRedirect.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login('microsoft');
    });

    expect(getLastGoogleSub()).toBeNull();
    expect(getAuthProviderMarker()).toBe('microsoft');

    Object.defineProperty(window, 'opener', { value: null, configurable: true });
  });

  it('handles logout successfully', async () => {
    mockMsalInstance.getActiveAccount.mockReturnValue(createMockAccount());
    mockMsalInstance.logoutPopup.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockMsalInstance.logoutPopup).toHaveBeenCalledWith({
      account: expect.any(Object),
      postLogoutRedirectUri: '/',
    });
  });

  it('always clears the Google restoration pin on Microsoft logout, even with no live Google credential', async () => {
    // A stale `lastGoogleSub` can persist from an earlier browser session
    // (marker 'google' but no credential ever restored this page load).
    // Logging out via Microsoft must clear it unconditionally rather than
    // only when a live Google credential happens to be present, or a later
    // automatic Google credential could satisfy the identity pin check after
    // the user explicitly signed out via Microsoft.
    const mockGoogleAuth = createMockGoogleAuth({ credential: null });
    mockUseGoogleAuth.mockReturnValue(mockGoogleAuth);
    mockMsalInstance.getActiveAccount.mockReturnValue(createMockAccount());
    mockMsalInstance.logoutPopup.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockGoogleAuth.logout).toHaveBeenCalledWith('signed-out');
  });

  it('falls back to redirect when the Microsoft login popup is blocked', async () => {
    const popupBlockedError = Object.assign(new Error('Popup blocked'), {
      errorCode: 'popup_window_error',
    });
    mockMsalInstance.loginPopup.mockRejectedValue(popupBlockedError);
    mockMsalInstance.loginRedirect.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login('microsoft');
    });

    expect(mockMsalInstance.loginRedirect).toHaveBeenCalledTimes(1);
    expect(getAuthProviderMarker()).toBe('microsoft');
  });

  it('does not fall back to redirect for a non-popup-blocked login failure', async () => {
    const otherError = Object.assign(new Error('User cancelled'), {
      errorCode: 'user_cancelled',
    });
    mockMsalInstance.loginPopup.mockRejectedValue(otherError);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await expect(
      act(async () => {
        await result.current.login('microsoft');
      }),
    ).rejects.toThrow('User cancelled');

    expect(mockMsalInstance.loginRedirect).not.toHaveBeenCalled();
  });

  it('acquires token silently', async () => {
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });
    mockMsalInstance.acquireTokenSilent.mockResolvedValue(
      createAuthResult(mockAccount, { accessToken: 'silent-token' }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      const token = await result.current.acquireToken();
      expect(token).toBe('silent-token');
    });
  });

  it('falls back to interactive login when silent fails', async () => {
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });
    mockMsalInstance.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError(
        'interaction_required',
        'Silent failure',
      ),
    );
    mockMsalInstance.acquireTokenPopup.mockResolvedValue(
      createAuthResult(mockAccount, { accessToken: 'interactive-token' }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      const token = await result.current.acquireToken();
      expect(token).toBe('interactive-token');
    });

    expect(mockMsalInstance.acquireTokenPopup).toHaveBeenCalledTimes(1);
  });

  it('shares the acquired Microsoft token across independent useAuth() call sites', async () => {
    // Regression test for the split-owner bug: every consumer (ChatPage,
    // useFetchChatHistory, useStreamingResponse, ...) calls
    // useAuth() independently. They must all observe the same token the
    // instant one of them acquires it, and a concurrent acquisition from a
    // second consumer must not issue a second MSAL request.
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    setMsalContext({ accounts: [mockAccount] });
    mockMsalInstance.acquireTokenSilent.mockResolvedValue(
      createAuthResult(mockAccount, { accessToken: 'shared-token' }),
    );

    const first = renderHook(() => useAuth(), { wrapper: AuthProvider });
    const second = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await first.result.current.acquireToken();
    });

    expect(second.result.current.accessToken).toBe('shared-token');
    expect(mockMsalInstance.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('clearError also clears a stuck Microsoft token-acquisition error, not just the local attempt error', async () => {
    // `error` surfaces `msToken.error` in addition to the local
    // login/logout-attempt error and `googleAuth.error` — clearError() must
    // clear all three, or a dismiss affordance could leave the alert
    // reappearing from a source it didn't actually clear.
    jest.useFakeTimers();
    try {
      const mockAccount = createMockAccount();
      mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
      setMsalContext({ accounts: [mockAccount] });
      mockMsalInstance.acquireTokenSilent.mockRejectedValue(
        new Error('network blip'),
      );

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      let acquirePromise!: Promise<string | null>;
      act(() => {
        acquirePromise = result.current.acquireToken();
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1_000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2_000);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4_000);
      });
      await act(async () => {
        await acquirePromise;
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  describe('Google sign-in', () => {
    it('reports authenticated state with a google identity when a credential is present', () => {
      const credential = createMockGoogleCredential();
      mockUseGoogleAuth.mockReturnValue(
        createMockGoogleAuth({ credential, idToken: 'google-id-token' }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.provider).toBe('google');
      expect(result.current.authIdentityKey).toBe(`google:${credential.sub}`);
      expect(result.current.accessToken).toBe('google-id-token');
      expect(result.current.user).toEqual({
        id: `google:${credential.sub}`,
        email: credential.email,
        name: credential.name,
      });
    });

    it('exposes a resolving status while Google restoration is in flight', () => {
      mockUseGoogleAuth.mockReturnValue(
        createMockGoogleAuth({ isRestoring: true }),
      );

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      expect(result.current.status).toBe('resolving');
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('requests a Google credential when logging in with the google provider', async () => {
      const googleAuth = createMockGoogleAuth();
      mockUseGoogleAuth.mockReturnValue(googleAuth);

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await act(async () => {
        await result.current.login('google');
      });

      expect(googleAuth.ensureInitialized).toHaveBeenCalledTimes(1);
      expect(googleAuth.requestCredential).toHaveBeenCalledTimes(1);
      expect(mockMsalInstance.loginPopup).not.toHaveBeenCalled();
    });

    it('logs out of an active Google session without calling MSAL logoutPopup', async () => {
      const googleAuth = createMockGoogleAuth({
        credential: createMockGoogleCredential(),
        idToken: 'google-id-token',
      });
      mockUseGoogleAuth.mockReturnValue(googleAuth);

      const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      await act(async () => {
        await result.current.logout();
      });

      expect(googleAuth.logout).toHaveBeenCalledWith('signed-out');
      expect(mockMsalInstance.logoutPopup).not.toHaveBeenCalled();
    });

    it('stops treating the cached MSAL account as active when Google becomes active', async () => {
      // No `setActiveAccount(null)` call is needed or expected here — MSAL's
      // own cached active account is still selected internally, but
      // `msalActive` is gated on the persisted marker, and Google's
      // credential-acceptance path (`GoogleAuthProvider`) persists the
      // 'google' marker as part of accepting the credential, so the next
      // read of `useAuth()` ignores the stale MSAL selection regardless of
      // MSAL's own cache state. Account selection stays confined to the two
      // sanctioned call sites (the bootstrap post-resolution controller and
      // the facade's explicit login path) — never a third cleanup call here.
      const mockAccount = createMockAccount();
      mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
      setMsalContext({ accounts: [mockAccount] });
      mockUseGoogleAuth.mockReturnValue(createMockGoogleAuth());

      const { result, rerender } = renderHook(() => useAuth(), { wrapper: AuthProvider });
      expect(result.current.provider).toBe('microsoft');

      setAuthProviderMarker('google');
      mockUseGoogleAuth.mockReturnValue(
        createMockGoogleAuth({
          credential: createMockGoogleCredential(),
          idToken: 'google-id-token',
        }),
      );
      rerender();

      await waitFor(() => {
        expect(result.current.provider).toBe('google');
      });
      expect(mockMsalInstance.setActiveAccount).not.toHaveBeenCalled();
    });

    it('logs out of Google when Microsoft becomes active', async () => {
      const googleAuth = createMockGoogleAuth({
        credential: createMockGoogleCredential(),
        idToken: 'google-id-token',
      });
      mockUseGoogleAuth.mockReturnValue(googleAuth);
      mockMsalInstance.getActiveAccount.mockReturnValue(null);
      setMsalContext({ accounts: [] });

      const { rerender } = renderHook(() => useAuth(), { wrapper: AuthProvider });

      const mockAccount = createMockAccount();
      mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
      setMsalContext({ accounts: [mockAccount] });
      rerender();

      await waitFor(() => {
        expect(googleAuth.logout).toHaveBeenCalledWith('microsoft');
      });
    });
  });
});
