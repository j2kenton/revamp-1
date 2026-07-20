import {
  GoogleGsiLoadError,
  loadGoogleGsiScript,
  resetGoogleGsiLoaderForTests,
} from '@/lib/auth/googleGsiLoader';

const SCRIPT_ID = 'google-gsi-client-script';

function getScript(): HTMLScriptElement {
  const script = document.getElementById(SCRIPT_ID);
  if (!script) {
    throw new Error('Expected the GIS script tag to be injected');
  }
  return script as HTMLScriptElement;
}

describe('googleGsiLoader', () => {
  beforeEach(() => {
    resetGoogleGsiLoaderForTests();
    document.getElementById(SCRIPT_ID)?.remove();
    delete (window as unknown as { google?: unknown }).google;
  });

  it('does not inject a script when NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured', async () => {
    const originalClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = '';

    let loader!: typeof import('@/lib/auth/googleGsiLoader');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loader = require('@/lib/auth/googleGsiLoader');
    });

    await expect(loader.loadGoogleGsiScript()).rejects.toThrow();
    expect(document.getElementById(SCRIPT_ID)).toBeNull();

    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = originalClientId;
  });

  it('shares a single script load across concurrent consumers', async () => {
    const first = loadGoogleGsiScript();
    const second = loadGoogleGsiScript();

    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1);

    getScript().dispatchEvent(new Event('load'));

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  it('survives one consumer "unmounting" (no longer awaiting) while another still uses it', async () => {
    // Simulate an unmounted consumer by simply not awaiting its promise.
    void loadGoogleGsiScript();
    const stillWaiting = loadGoogleGsiScript();

    getScript().dispatchEvent(new Event('load'));

    await expect(stillWaiting).resolves.toBeUndefined();
  });

  it('resets the singleton on a failed load so a later call can retry', async () => {
    const failedAttempt = loadGoogleGsiScript();
    const failedScript = getScript();
    failedScript.dispatchEvent(new Event('error'));

    await expect(failedAttempt).rejects.toBeInstanceOf(GoogleGsiLoadError);

    // The loader itself must remove the failed tag — a real retry cannot
    // rely on test code (or any other caller) to clean up the DOM first.
    expect(document.getElementById(SCRIPT_ID)).toBeNull();

    const retryAttempt = loadGoogleGsiScript();
    const retryScript = getScript();
    expect(retryScript).not.toBe(failedScript);
    retryScript.dispatchEvent(new Event('load'));

    await expect(retryAttempt).resolves.toBeUndefined();
  });

  it('rejects and resets the singleton if neither load nor error ever fires', async () => {
    jest.useFakeTimers();
    try {
      const hungAttempt = loadGoogleGsiScript();
      const hungScript = getScript();
      // Neither 'load' nor 'error' is ever dispatched — simulates a
      // silently stalled request (some adblockers/captive portals).
      const assertion = expect(hungAttempt).rejects.toBeInstanceOf(
        GoogleGsiLoadError,
      );

      await jest.advanceTimersByTimeAsync(20_000);
      await assertion;

      // The stalled tag must be removed so a retry re-issues the request.
      expect(document.getElementById(SCRIPT_ID)).toBeNull();
      expect(hungScript.isConnected).toBe(false);

      const retryAttempt = loadGoogleGsiScript();
      getScript().dispatchEvent(new Event('load'));
      await expect(retryAttempt).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears a pending load-timeout when reset runs before it fires', async () => {
    jest.useFakeTimers();
    try {
      const hungAttempt = loadGoogleGsiScript();
      // Nothing awaits this rejection once reset abandons the attempt;
      // swallow it so the unresolved promise doesn't surface as an
      // unhandled rejection if the (now-cleared) timeout were to fire.
      hungAttempt.catch(() => {});
      const hungScript = getScript();

      resetGoogleGsiLoaderForTests();

      // If the pending timeout weren't cancelled by reset, it would fire
      // here and rip this (still-attached) script tag out of the DOM —
      // exactly the cross-test contamination a stray timer could cause.
      await jest.advanceTimersByTimeAsync(30_000);

      expect(hungScript.isConnected).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
