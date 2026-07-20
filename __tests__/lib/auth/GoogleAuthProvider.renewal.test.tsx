/**
 * Fake-timer coverage for `GoogleAuthProvider`'s pre-expiry renewal
 * (`scheduleRenewal`, fires 5 minutes before `exp`) and expiry watchdog
 * (fires 30s before `exp`, forcing `needsReauth` as a floor when GIS's own
 * moment-notification callback is unreliable). None of the other
 * `GoogleAuthProvider*.test.tsx` files drive these timers — they only cover
 * the synchronous credential-acceptance rule (rule 4) and script-load error
 * recovery.
 */
import { useEffect } from 'react';
import { render, act } from '@testing-library/react';
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

interface GisInitializeArgs {
  callback: (response: { credential: string; select_by?: string }) => void;
}
type PromptMomentListener = (notification: {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
}) => void;

function makeCredential(
  sub: string,
  expiresInSeconds: number,
  email = `${sub}@example.com`,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    email,
    email_verified: true,
    name: 'Test User',
    exp: nowSec + expiresInSeconds,
    iat: nowSec,
  };
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

let capturedCallback: GisInitializeArgs['callback'] | null = null;
let promptMock: jest.Mock;
let consumerMountCount = 0;

function Consumer({
  onValue,
}: {
  onValue: (v: ReturnType<typeof useGoogleAuth>) => void;
}) {
  const value = useGoogleAuth();
  useEffect(() => {
    consumerMountCount += 1;
  }, []);
  useEffect(() => {
    onValue(value);
    void value.ensureInitialized();
  });
  return null;
}

describe('GoogleAuthProvider renewal / expiry timer scenarios', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    capturedCallback = null;
    consumerMountCount = 0;
    window.sessionStorage.clear();
    mockLoadGoogleGsiScript.mockResolvedValue(undefined);
    promptMock = jest.fn();
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: jest.fn((args: GisInitializeArgs) => {
            capturedCallback = args.callback;
          }),
          prompt: promptMock,
          disableAutoSelect: jest.fn(),
          renderButton: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
    jest.useRealTimers();
  });

  async function renderAndInit() {
    let latest: ReturnType<typeof useGoogleAuth> | null = null;
    render(
      <GoogleAuthProvider>
        <Consumer onValue={(v) => (latest = v)} />
      </GoogleAuthProvider>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(capturedCallback).not.toBeNull();
    return () => latest!;
  }

  async function signInAs(sub: string, expiresInSeconds = 600) {
    await act(async () => {
      capturedCallback!({
        credential: makeCredential(sub, expiresInSeconds),
        select_by: 'btn',
      });
    });
  }

  it('(a) renewal success propagates a new credential without remounting/losing state', async () => {
    const getValue = await renderAndInit();
    await signInAs('sub-1', 600);
    expect(getValue().credential?.sub).toBe('sub-1');
    const mountsAfterLogin = consumerMountCount;

    // A successful silent renewal: GIS delivers a fresh matching-sub
    // credential (as the `handleCredentialResponse` callback would receive
    // it) in response to the renewal timer's silent prompt.
    promptMock.mockImplementation(() => {
      capturedCallback!({
        credential: makeCredential('sub-1', 600),
        select_by: 'auto',
      });
    });

    // scheduleRenewal fires at (exp - 5 minutes) = 300s after sign-in.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300 * 1000 + 100);
    });

    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(getValue().credential?.sub).toBe('sub-1');
    expect(getValue().needsReauth).toBe(false);
    expect(getValue().error).toBeNull();
    // No remount occurred — the Consumer's mount-only effect never re-fired,
    // proving renewal updates state in place rather than tearing the
    // provider/consumer tree down and back up.
    expect(consumerMountCount).toBe(mountsAfterLogin);
  });

  it('(b) renewal suppressed (prompt yields nothing) shows the re-auth banner state', async () => {
    const getValue = await renderAndInit();
    await signInAs('sub-1', 600);
    expect(getValue().needsReauth).toBe(false);

    // GIS suppresses the silent prompt entirely (e.g. FedCM cooldown) —
    // the moment-notification listener reports "not displayed" and no
    // credential ever arrives.
    promptMock.mockImplementation((listener: PromptMomentListener) => {
      listener({ isNotDisplayed: () => true, isSkippedMoment: () => false });
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300 * 1000 + 100);
    });

    expect(getValue().needsReauth).toBe(true);
    // Still "logged in" with the (now stale, but not yet expired) credential
    // — the banner is additive, not a forced sign-out.
    expect(getValue().credential?.sub).toBe('sub-1');
    expect(getValue().isExpired).toBe(false);
  });

  it('(c) renewal with a mismatched sub is rejected to the banner path', async () => {
    const getValue = await renderAndInit();
    await signInAs('sub-1', 600);

    // A different account's automatic credential arrives (e.g. a stale GIS
    // session for another Google account on the same device/browser).
    promptMock.mockImplementation(() => {
      capturedCallback!({
        credential: makeCredential('sub-2', 600),
        select_by: 'auto',
      });
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(300 * 1000 + 100);
    });

    // The original identity stays active; the mismatched automatic
    // credential is rejected rather than silently switching accounts.
    expect(getValue().credential?.sub).toBe('sub-1');
    expect(getValue().needsReauth).toBe(true);
  });

  it('(d) full expiry with no renewal transitions to the gated/unauthenticated state', async () => {
    const getValue = await renderAndInit();
    await signInAs('sub-1', 600);
    expect(getValue().isExpired).toBe(false);

    // Every silent prompt (both the 5-minute renewal and any subsequent
    // retries) is suppressed — nothing ever renews the credential.
    promptMock.mockImplementation((listener: PromptMomentListener) => {
      listener({ isNotDisplayed: () => true, isSkippedMoment: () => false });
    });

    // Past the full 600s expiry, plus enough of the 30s `isExpired`
    // recompute interval for the provider to re-render and reflect it.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(650 * 1000);
    });

    expect(getValue().isExpired).toBe(true);
    // The watchdog (30s before expiry) also forces the re-auth banner as a
    // floor guarantee, independent of GIS's own notification callback.
    expect(getValue().needsReauth).toBe(true);
  });
});
