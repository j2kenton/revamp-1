'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, login, isLoading, error } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, router]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await login();
      // After successful login, redirect to dashboard
      router.push('/dashboard');
    } catch (err) {
      console.error('Login failed:', err);
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Failed to sign in. Please try again.'
      );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-bold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in with your Microsoft account
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
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 21 21"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                <span>Sign in with Microsoft</span>
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-500">
            By signing in, you agree to use your organizational Microsoft
            account for authentication.
          </p>
        </div>
      </div>
    </div>
  );
}
