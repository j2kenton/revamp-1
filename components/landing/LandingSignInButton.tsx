'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { LoadingSpinner, MicrosoftIcon } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth/useAuth';
import { STRINGS } from '@/lib/constants/strings';

const POST_LOGIN_ROUTE = '/chat';

export function LandingSignInButton() {
  const router = useRouter();
  const { isAuthenticated, login, isLoading, error } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.push(POST_LOGIN_ROUTE);
    }
  }, [isAuthenticated, router]);

  const handleLogin = async () => {
    setAuthError(null);

    try {
      await login();
      router.push(POST_LOGIN_ROUTE);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : STRINGS.errors.authFailed,
      );
    }
  };

  return (
    <div className="mt-8 max-w-sm">
      <button
        type="button"
        onClick={handleLogin}
        disabled={isLoading}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-blue-400 dark:focus:ring-offset-slate-950 sm:w-auto"
      >
        {isLoading ? (
          <>
            <LoadingSpinner className="h-4 w-4 border-white border-t-transparent" />
            <span>{STRINGS.auth.signingIn}</span>
          </>
        ) : (
          <>
            <MicrosoftIcon className="h-4 w-4" aria-hidden="true" />
            <span>{STRINGS.landing.primaryCta}</span>
          </>
        )}
      </button>

      {(authError || error) && (
        <p
          className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-100"
          role="alert"
          aria-live="assertive"
        >
          {authError || error?.message}
        </p>
      )}
    </div>
  );
}
