'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingSpinner, MicrosoftIcon } from '@/components/ui/icons';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useAuth } from '@/lib/auth/useAuth';
import { STRINGS } from '@/lib/constants/strings';

const POST_LOGIN_ROUTE = '/chat';

export function LandingSignInButton() {
  const router = useRouter();
  const { isAuthenticated, status, login, isLoading, error, clearError } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoadError, setGoogleLoadError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (isAuthenticated) {
      router.push(POST_LOGIN_ROUTE);
    }
  }, [isAuthenticated, router]);

  const handleMicrosoftLogin = async () => {
    setAuthError(null);

    try {
      await login('microsoft');
      router.push(POST_LOGIN_ROUTE);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : STRINGS.errors.authFailed,
      );
    }
  };

  const handleRetryGoogle = () => {
    setGoogleLoadError(null);
    setRetryToken((n) => n + 1);
  };

  const isResolving = status === 'resolving';
  const disabled = isLoading || isResolving;

  return (
    <div
      className="mt-8 max-w-sm"
      aria-label={STRINGS.landing.signInSectionAriaLabel}
    >
      {/* Google is rendered first/above — the primary, more prominent option. */}
      <div className="flex flex-col items-start gap-3">
        <div
          aria-label={STRINGS.landing.primaryCta}
          className={
            isLoading ? 'w-full pointer-events-none opacity-60' : 'w-full'
          }
        >
          {isResolving ? (
            // While the auth state machine hasn't resolved (rule 0), no GIS
            // script/init may run and no interactive login surface may
            // render — a real button here would be focusable/keyboard-
            // activatable regardless of the pointer-events styling above.
            <div
              aria-hidden="true"
              data-testid="google-signin-placeholder"
              className="h-10 w-80 max-w-full animate-pulse rounded-md bg-slate-200 dark:bg-slate-800"
            />
          ) : (
            <GoogleSignInButton key={retryToken} onError={setGoogleLoadError} />
          )}
        </div>

        <span className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {STRINGS.landing.orDivider}
        </span>

        <button
          type="button"
          onClick={handleMicrosoftLogin}
          disabled={disabled}
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800 dark:focus:ring-blue-400 dark:focus:ring-offset-slate-950 sm:w-auto"
        >
          {isLoading ? (
            <>
              <LoadingSpinner className="h-4 w-4 border-slate-400 border-t-slate-900 dark:border-t-slate-50" />
              <span>{STRINGS.auth.signingIn}</span>
            </>
          ) : (
            <>
              <MicrosoftIcon className="h-4 w-4" aria-hidden="true" />
              <span>{STRINGS.landing.secondaryCta}</span>
            </>
          )}
        </button>
      </div>

      {isResolving && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          {STRINGS.auth.resolvingSession}
        </p>
      )}

      {(authError || error || googleLoadError) && (
        <div
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
          role="alert"
          aria-live="assertive"
        >
          <p>
            {authError ||
              (googleLoadError
                ? STRINGS.errors.googleScriptLoadFailed
                : error?.message)}
          </p>
          {googleLoadError && (
            <button
              type="button"
              onClick={handleRetryGoogle}
              className="mt-2 inline-flex min-h-11 items-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 dark:border-red-800 dark:text-red-100 dark:hover:bg-red-900"
            >
              {STRINGS.actions.retry}
            </button>
          )}
          {!authError && !googleLoadError && error && (
            // A Google credential rejection (e.g. an unverified email) sets
            // `googleAuth.error`, which has no self-clearing trigger of its
            // own — without this, the alert would stay stuck until an
            // unrelated successful login happened to overwrite it.
            <button
              type="button"
              onClick={clearError}
              className="mt-2 inline-flex min-h-11 items-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 dark:border-red-800 dark:text-red-100 dark:hover:bg-red-900"
            >
              {STRINGS.actions.dismiss}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
