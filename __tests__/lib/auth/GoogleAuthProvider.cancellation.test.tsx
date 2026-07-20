/**
 * User cancellation of an explicit Google sign-in prompt must not surface
 * any error/alert state — a dismissed voluntary prompt is a cancellation,
 * not a failure (see the comment on `requestCredential` in
 * `lib/auth/GoogleAuthProvider.tsx`, and contrast with a *silent*
 * (automatic renewal/restoration) prompt being suppressed, which DOES
 * surface `needsReauth` — covered by `GoogleAuthProvider.renewal.test.tsx`).
 * `LandingSignInButton`/`ChatSignInPrompt` render their `role="alert"`
 * regions purely reactively off `error`/`needsReauth`-derived state, so
 * asserting that state never gets set is equivalent to asserting no alert
 * ever renders for this case.
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

type PromptMomentListener = (notification: {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
}) => void;

describe('GoogleAuthProvider: explicit prompt cancellation surfaces no alert', () => {
  let promptMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    mockLoadGoogleGsiScript.mockResolvedValue(undefined);
    promptMock = jest.fn();
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: jest.fn(),
          prompt: promptMock,
          disableAutoSelect: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
  });

  it('sets neither `error` nor `needsReauth` when the user dismisses an explicit (non-silent) prompt with no prior credential', async () => {
    promptMock.mockImplementation((listener: PromptMomentListener) => {
      listener({ isNotDisplayed: () => true, isSkippedMoment: () => false });
    });

    const { result } = renderHook(() => useGoogleAuth(), {
      wrapper: GoogleAuthProvider,
    });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));

    // Explicit, user-initiated call (e.g. `useAuth().login('google')`) —
    // `silent` defaults to false.
    await act(async () => {
      await result.current.requestCredential();
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.needsReauth).toBe(false);
    expect(result.current.credential).toBeNull();
  });

  it('sets neither `error` nor `needsReauth` when the user dismisses an explicit reauth prompt while already signed in', async () => {
    const { result } = renderHook(() => useGoogleAuth(), {
      wrapper: GoogleAuthProvider,
    });
    await waitFor(() => expect(result.current.isRestoring).toBe(false));

    // Sign in first via an explicit (non-suppressed) prompt.
    let capturedInitCallback:
      | ((response: { credential: string; select_by?: string }) => void)
      | null = null;
    const initializeMock = (
      window as unknown as {
        google: {
          accounts: {
            id: {
              initialize: jest.Mock;
            };
          };
        };
      }
    ).google.accounts.id.initialize;
    initializeMock.mockImplementation(
      (args: {
        callback: (response: {
          credential: string;
          select_by?: string;
        }) => void;
      }) => {
        capturedInitCallback = args.callback;
      },
    );
    promptMock.mockImplementation(() => {
      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = {
        sub: 'sub-1',
        email: 'sub-1@example.com',
        email_verified: true,
        name: 'Test User',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      };
      const encode = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj)).toString('base64url');
      const credential = `${encode(header)}.${encode(payload)}.signature`;
      capturedInitCallback!({ credential, select_by: 'btn' });
    });

    await act(async () => {
      await result.current.requestCredential();
    });
    await waitFor(() => expect(result.current.credential?.sub).toBe('sub-1'));

    // Now the user explicitly triggers reauth (e.g. the chat page's
    // "needsReauth" banner button) and dismisses the prompt.
    promptMock.mockImplementation((listener: PromptMomentListener) => {
      listener({ isNotDisplayed: () => false, isSkippedMoment: () => true });
    });

    await act(async () => {
      await result.current.requestCredential();
    });

    expect(result.current.error).toBeNull();
    // needsReauth stays false — an explicit dismissal is a cancellation,
    // never surfaced as a reauth prompt (only a *silent* suppressed prompt
    // with an active credential sets it, per `requestCredential`'s guard).
    expect(result.current.needsReauth).toBe(false);
    expect(result.current.credential?.sub).toBe('sub-1');
  });
});
