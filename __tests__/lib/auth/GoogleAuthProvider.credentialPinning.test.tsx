/**
 * Exercises `GoogleAuthProvider`'s credential-acceptance rule directly
 * (state-machine rule 4): an automatic (non-gesture) GIS credential may only
 * establish or renew a session when its `sub` matches an existing pin. This
 * targets a real defect where an automatic credential arriving with NO pin
 * at all (a fresh page, no prior Google session) was previously accepted
 * outright instead of being rejected.
 */
import { useEffect } from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { GoogleAuthProvider, useGoogleAuth } from '@/lib/auth/GoogleAuthProvider';
import { getAuthProviderMarker } from '@/lib/auth/authProviderMarker';
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

function makeCredential(
  sub: string,
  email = `${sub}@example.com`,
  emailVerified = true,
): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub,
    email,
    email_verified: emailVerified,
    name: 'Test User',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.signature`;
}

let capturedCallback: GisInitializeArgs['callback'] | null = null;

function Consumer({ onValue }: { onValue: (v: ReturnType<typeof useGoogleAuth>) => void }) {
  const value = useGoogleAuth();
  useEffect(() => {
    onValue(value);
    void value.ensureInitialized();
  });
  return null;
}

describe('GoogleAuthProvider credential acceptance (rule 4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedCallback = null;
    window.sessionStorage.clear();
    mockLoadGoogleGsiScript.mockResolvedValue(undefined);
    (window as unknown as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: jest.fn((args: GisInitializeArgs) => {
            capturedCallback = args.callback;
          }),
          prompt: jest.fn(),
          disableAutoSelect: jest.fn(),
          renderButton: jest.fn(),
        },
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
  });

  async function renderAndInit() {
    let latest: ReturnType<typeof useGoogleAuth> | null = null;
    render(
      <GoogleAuthProvider>
        <Consumer onValue={(v) => (latest = v)} />
      </GoogleAuthProvider>,
    );
    await waitFor(() => expect(capturedCallback).not.toBeNull());
    return () => latest!;
  }

  it('rejects an automatic credential with no pin at all (no prior Google session)', async () => {
    const getValue = await renderAndInit();

    await act(async () => {
      capturedCallback!({ credential: makeCredential('sub-1'), select_by: 'auto' });
    });

    expect(getValue().credential).toBeNull();
    expect(getValue().needsReauth).toBe(false);
    expect(getAuthProviderMarker()).not.toBe('google');
  });

  it('accepts an explicit-gesture credential with no prior pin', async () => {
    const getValue = await renderAndInit();

    await act(async () => {
      capturedCallback!({ credential: makeCredential('sub-1'), select_by: 'btn' });
    });

    await waitFor(() => expect(getValue().credential?.sub).toBe('sub-1'));
    expect(getAuthProviderMarker()).toBe('google');
  });

  it('accepts an automatic credential that matches the pinned sub (renewal)', async () => {
    const getValue = await renderAndInit();

    await act(async () => {
      capturedCallback!({ credential: makeCredential('sub-1'), select_by: 'btn' });
    });
    await waitFor(() => expect(getValue().credential?.sub).toBe('sub-1'));

    await act(async () => {
      capturedCallback!({ credential: makeCredential('sub-1'), select_by: 'auto' });
    });

    expect(getValue().credential?.sub).toBe('sub-1');
    expect(getValue().needsReauth).toBe(false);
  });

  it('rejects an automatic credential with a different sub than the pin, surfacing needsReauth', async () => {
    const getValue = await renderAndInit();

    await act(async () => {
      capturedCallback!({ credential: makeCredential('sub-1'), select_by: 'btn' });
    });
    await waitFor(() => expect(getValue().credential?.sub).toBe('sub-1'));

    await act(async () => {
      capturedCallback!({ credential: makeCredential('sub-2'), select_by: 'auto' });
    });

    // The original identity stays active — the mismatched automatic
    // credential is rejected, not silently switched to.
    expect(getValue().credential?.sub).toBe('sub-1');
    expect(getValue().needsReauth).toBe(true);
  });

  it('treats an unrecognized select_by value as automatic (fail closed) with no pin', async () => {
    const getValue = await renderAndInit();

    await act(async () => {
      capturedCallback!({
        credential: makeCredential('sub-1'),
        select_by: 'some_future_value',
      });
    });

    expect(getValue().credential).toBeNull();
  });

  it('rejects a credential with an unverified email, even via an explicit gesture, without touching pin/marker state', async () => {
    const getValue = await renderAndInit();

    await act(async () => {
      capturedCallback!({
        credential: makeCredential('sub-1', 'sub-1@example.com', false),
        select_by: 'btn',
      });
    });

    expect(getValue().credential).toBeNull();
    expect(getValue().needsReauth).toBe(false);
    expect(getValue().error?.message).toMatch(/not verified/i);
    expect(getAuthProviderMarker()).not.toBe('google');
  });
});
