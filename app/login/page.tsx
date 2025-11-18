'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { LoadingSpinner, MicrosoftIcon } from '@/components/ui/icons';
import { STRINGS } from '@/lib/constants/strings';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, login, isLoading, error } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const postLoginRoute = '/chat';

  useEffect(() => {
    if (isAuthenticated) {
      router.push(postLoginRoute);
    }
  }, [isAuthenticated, router, postLoginRoute]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await login();
      router.push(postLoginRoute);
    } catch (err) {
      console.error('Login failed:', err);
      setAuthError(
        err instanceof Error ? err.message : STRINGS.errors.authFailed,
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
            {STRINGS.auth.signInTitle}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {STRINGS.auth.signInDescription}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {(authError || error) && (
            <div
              className="rounded-md bg-red-50 p-4"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm text-red-800">
                {authError || error?.message}
              </p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 rounded-md bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <LoadingSpinner className="h-5 w-5 border-white border-t-transparent" />
                <span>{STRINGS.auth.signingIn}</span>
              </>
            ) : (
              <>
                <MicrosoftIcon className="h-5 w-5" />
                <span>{STRINGS.auth.signInButton}</span>
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-500">
            {STRINGS.auth.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}
