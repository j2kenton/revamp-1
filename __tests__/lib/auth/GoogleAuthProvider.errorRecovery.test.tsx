/**
 * Covers a retry-path completion gap identified in review: a Google GIS
 * script-load failure sets a shared error on the context (surfaced in every
 * `useAuth()` consumer's alert region); a later successful retry through
 * `ensureInitialized()` must clear that error, not just report the new
 * success alongside a stale failure.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { GoogleAuthProvider, useGoogleAuth } from '@/lib/auth/GoogleAuthProvider';
import { loadGoogleGsiScript } from '@/lib/auth/googleGsiLoader';

jest.mock('@/lib/auth/MsalProvider', () => ({
  msalInstance: {
    getAllAccounts: jest.fn(() => []),
    setActiveAccount: jest.fn(),
  },
  consumePendingRedirectAccount: jest.fn(() => null),
}));

jest.mock('@/lib/auth/googleGsiLoader', () => ({
  loadGoogleGsiScript: jest.fn(),
}));

const mockLoadGoogleGsiScript = loadGoogleGsiScript as jest.MockedFunction<
  typeof loadGoogleGsiScript
>;

describe('GoogleAuthProvider error recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    (window as unknown as { google?: unknown }).google = {
      accounts: { id: { initialize: jest.fn(), prompt: jest.fn(), disableAutoSelect: jest.fn() } },
    };
  });

  it('clears a prior script-load error once a retry succeeds', async () => {
    mockLoadGoogleGsiScript.mockRejectedValueOnce(new Error('network failure'));

    const { result } = renderHook(() => useGoogleAuth(), {
      wrapper: GoogleAuthProvider,
    });

    await waitFor(() => expect(result.current.isRestoring).toBe(false));

    await act(async () => {
      await expect(result.current.ensureInitialized()).rejects.toThrow(
        'network failure',
      );
    });

    expect(result.current.error).not.toBeNull();

    mockLoadGoogleGsiScript.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.ensureInitialized();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.isReady).toBe(true);
  });
});
