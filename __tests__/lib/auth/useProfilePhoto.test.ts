import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '@/lib/auth/useAuth';
import { useProfilePhoto } from '@/lib/auth/useProfilePhoto';

jest.mock('@/lib/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/auth/bypass', () => ({
  isBypassAuthEnabled: jest.fn(() => false),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const mockAcquireGraphToken = jest.fn<Promise<string | null>, [string[]]>();

const baseUseAuthValue = {
  status: 'authenticated' as const,
  isAuthenticated: true,
  authIdentityKey: null as string | null,
  user: null,
  accessToken: null as string | null,
  login: jest.fn(),
  logout: jest.fn(),
  acquireToken: jest.fn(),
  acquireGraphToken: mockAcquireGraphToken,
  isLoading: false,
  error: null,
  needsReauth: false,
  clearError: jest.fn(),
};

describe('useProfilePhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAcquireGraphToken.mockResolvedValue(null);
  });

  it('skips Microsoft Graph entirely when the active provider is google, even with a cached MSAL account', () => {
    mockUseAuth.mockReturnValue({
      ...baseUseAuthValue,
      provider: 'google',
      authIdentityKey: 'google:sub-1',
      accessToken: 'google-id-token',
    });

    renderHook(() => useProfilePhoto());

    expect(mockAcquireGraphToken).not.toHaveBeenCalled();
  });

  it('skips Microsoft Graph while resolving (no active provider yet)', () => {
    mockUseAuth.mockReturnValue({
      ...baseUseAuthValue,
      status: 'resolving',
      isAuthenticated: false,
      provider: null,
    });

    renderHook(() => useProfilePhoto());

    expect(mockAcquireGraphToken).not.toHaveBeenCalled();
  });

  it('fetches via Graph when the active provider is microsoft', async () => {
    mockUseAuth.mockReturnValue({
      ...baseUseAuthValue,
      provider: 'microsoft',
      authIdentityKey: 'microsoft:acc-1',
    });
    mockAcquireGraphToken.mockResolvedValue('graph-token');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

    renderHook(() => useProfilePhoto());

    await waitFor(() => {
      expect(mockAcquireGraphToken).toHaveBeenCalledWith(['User.Read']);
    });
  });
});
