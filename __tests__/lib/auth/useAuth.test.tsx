import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '@/lib/auth/useAuth';
import {
  InteractionStatus,
  InteractionRequiredAuthError,
  type AccountInfo,
  type AuthenticationResult,
  type SilentRequest,
} from '@azure/msal-browser';
import { useMsal, type IMsalContext } from '@azure/msal-react';

jest.mock('@azure/msal-react', () => ({
  useMsal: jest.fn(),
}));

jest.mock('@/lib/auth/bypass', () => ({
  BYPASS_ACCESS_TOKEN: 'bypass-token',
  isBypassAuthEnabled: jest.fn(() => false),
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

const createMockAccount = (overrides: Partial<AccountInfo> = {}): AccountInfo => ({
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
  scopes: ['User.Read'],
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
    setMsalContext();
  });

  it('returns authenticated state when user is logged in', async () => {
    const mockAccount = createMockAccount();
    setMsalContext({
      accounts: [mockAccount],
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toEqual({
        id: mockAccount.localAccountId,
        email: mockAccount.username,
        name: mockAccount.name,
      });
    });
  });

  it('handles login successfully', async () => {
    const mockAccount = createMockAccount();
    const authResult = createAuthResult(mockAccount, { accessToken: 'login-token' });
    mockMsalInstance.loginPopup.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login();
    });

    expect(mockMsalInstance.loginPopup).toHaveBeenCalledTimes(1);
    expect(mockMsalInstance.setActiveAccount).toHaveBeenCalledWith(mockAccount);
  });

  it('handles logout successfully', async () => {
    mockMsalInstance.getActiveAccount.mockReturnValue(createMockAccount());
    mockMsalInstance.logoutPopup.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(mockMsalInstance.logoutPopup).toHaveBeenCalledWith({
      account: expect.any(Object),
      postLogoutRedirectUri: '/login',
    });
  });

  it('acquires token silently', async () => {
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    mockMsalInstance.acquireTokenSilent.mockResolvedValue(
      createAuthResult(mockAccount, { accessToken: 'silent-token' }),
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const token = await result.current.acquireToken();
      expect(token).toBe('silent-token');
    });
  });

  it('falls back to interactive login when silent fails', async () => {
    const mockAccount = createMockAccount();
    mockMsalInstance.getActiveAccount.mockReturnValue(mockAccount);
    mockMsalInstance.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError('interaction_required', 'Silent failure'),
    );
    mockMsalInstance.acquireTokenPopup.mockResolvedValue(
      createAuthResult(mockAccount, { accessToken: 'interactive-token' }),
    );

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const token = await result.current.acquireToken();
      expect(token).toBe('interactive-token');
    });

    expect(mockMsalInstance.acquireTokenPopup).toHaveBeenCalledTimes(1);
  });
});
