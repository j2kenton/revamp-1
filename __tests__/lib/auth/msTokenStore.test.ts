import { InteractionRequiredAuthError } from '@azure/msal-browser';
import {
  acquireMsToken,
  clearMsToken,
  clearMsTokenError,
  getMsTokenSnapshot,
  resetMsTokenStoreForTests,
  setMsTokenFromResult,
  subscribeMsToken,
} from '@/lib/auth/msTokenStore';

interface MockInstance {
  acquireTokenSilent: jest.Mock;
  acquireTokenPopup: jest.Mock;
  acquireTokenRedirect: jest.Mock;
}

function createMockInstance(): MockInstance {
  return {
    acquireTokenSilent: jest.fn(),
    acquireTokenPopup: jest.fn(),
    acquireTokenRedirect: jest.fn(),
  };
}

const mockAccount = { homeAccountId: 'home-1' } as never;

function createAuthResult(accessToken: string, expiresInMs = 60_000) {
  return {
    accessToken,
    expiresOn: new Date(Date.now() + expiresInMs),
  } as never;
}

describe('msTokenStore', () => {
  beforeEach(() => {
    resetMsTokenStoreForTests();
  });

  it('starts with an empty snapshot', () => {
    expect(getMsTokenSnapshot()).toEqual({
      accessToken: null,
      expiresAt: null,
      isLoading: false,
      error: null,
    });
  });

  it('is the single owner of the token: every subscriber observes the same renewed value', async () => {
    const instance = createMockInstance();
    instance.acquireTokenSilent.mockResolvedValue(
      createAuthResult('shared-token'),
    );

    const listenerA = jest.fn();
    const listenerB = jest.fn();
    const unsubA = subscribeMsToken(listenerA);
    const unsubB = subscribeMsToken(listenerB);

    await acquireMsToken(instance as never, mockAccount);

    expect(listenerA).toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalled();
    expect(getMsTokenSnapshot().accessToken).toBe('shared-token');

    unsubA();
    unsubB();
  });

  it('coalesces concurrent callers into a single acquisition instead of racing separate MSAL requests', async () => {
    const instance = createMockInstance();
    let resolveSilent: (value: unknown) => void = () => {};
    instance.acquireTokenSilent.mockReturnValue(
      new Promise((resolve) => {
        resolveSilent = resolve;
      }),
    );

    const first = acquireMsToken(instance as never, mockAccount);
    const second = acquireMsToken(instance as never, mockAccount);

    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(1);

    resolveSilent(createAuthResult('coalesced-token'));

    await expect(first).resolves.toBe('coalesced-token');
    await expect(second).resolves.toBe('coalesced-token');
    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('falls back to an interactive popup when silent acquisition requires interaction', async () => {
    const instance = createMockInstance();
    instance.acquireTokenSilent.mockRejectedValue(
      new InteractionRequiredAuthError('interaction_required', 'Silent failure'),
    );
    instance.acquireTokenPopup.mockResolvedValue(
      createAuthResult('interactive-token'),
    );

    const token = await acquireMsToken(instance as never, mockAccount);

    expect(token).toBe('interactive-token');
    expect(instance.acquireTokenPopup).toHaveBeenCalledTimes(1);
    expect(getMsTokenSnapshot().accessToken).toBe('interactive-token');
  });

  it('retries a transient (non-interactive-required) failure with backoff before giving up', async () => {
    jest.useFakeTimers();
    try {
      const instance = createMockInstance();
      instance.acquireTokenSilent
        .mockRejectedValueOnce(new Error('network blip'))
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValueOnce(createAuthResult('retried-token'));

      const promise = acquireMsToken(instance as never, mockAccount);

      // Flush the 1s and 2s backoff delays between the three attempts.
      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_000);

      await expect(promise).resolves.toBe('retried-token');
      expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clearMsToken resets the shared state and notifies subscribers', async () => {
    const instance = createMockInstance();
    instance.acquireTokenSilent.mockResolvedValue(createAuthResult('token'));
    await acquireMsToken(instance as never, mockAccount);

    const listener = jest.fn();
    const unsub = subscribeMsToken(listener);

    clearMsToken();

    expect(listener).toHaveBeenCalled();
    expect(getMsTokenSnapshot()).toEqual({
      accessToken: null,
      expiresAt: null,
      isLoading: false,
      error: null,
    });

    unsub();
  });

  it('clearMsTokenError clears only the error, leaving a live token/expiry intact', async () => {
    const instance = createMockInstance();
    instance.acquireTokenSilent
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'));

    jest.useFakeTimers();
    try {
      const promise = acquireMsToken(instance as never, mockAccount);
      await jest.advanceTimersByTimeAsync(1_000);
      await jest.advanceTimersByTimeAsync(2_000);
      await jest.advanceTimersByTimeAsync(4_000);
      await promise;
    } finally {
      jest.useRealTimers();
    }

    expect(getMsTokenSnapshot().error).not.toBeNull();

    const listener = jest.fn();
    const unsub = subscribeMsToken(listener);

    clearMsTokenError();

    expect(listener).toHaveBeenCalled();
    expect(getMsTokenSnapshot().error).toBeNull();

    unsub();
  });

  it('setMsTokenFromResult applies the expiry buffer and notifies subscribers', () => {
    const listener = jest.fn();
    const unsub = subscribeMsToken(listener);
    const expiresOn = new Date(Date.now() + 60_000);

    setMsTokenFromResult({
      accessToken: 'from-result',
      expiresOn,
    } as never);

    expect(listener).toHaveBeenCalled();
    const snapshot = getMsTokenSnapshot();
    expect(snapshot.accessToken).toBe('from-result');
    expect(snapshot.expiresAt).toBeLessThan(expiresOn.getTime());

    unsub();
  });
});
