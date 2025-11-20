'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { TEST_AUTH_STORAGE_KEY } from '@/lib/constants/test-auth';
import { STRINGS } from '@/lib/constants/strings';

const testAuthEnabled = process.env.NEXT_PUBLIC_TEST_AUTH_MODE === 'true';

export default function TestSupportLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!testAuthEnabled) {
      void router.replace('/');
    }
  }, [router]);

  const enableBypassFlags = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.__BYPASS_AUTH__ = true;
    try {
      window.localStorage.setItem(TEST_AUTH_STORAGE_KEY, 'true');
    } catch {
      // Storage might be disabled in some environments; ignore errors.
    }
  };

  const handleLogin = useCallback(async () => {
    if (!testAuthEnabled) {
      setError(STRINGS.testSupport.disabledError);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/test-support/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          body?.error?.message ?? 'Failed to initialize test authentication.';
        throw new Error(message);
      }

      enableBypassFlags();
      await router.push('/chat');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : STRINGS.errors.unexpected,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [router]);

  if (!testAuthEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <div className="max-w-md rounded-lg bg-white p-8 shadow">
          <h1 className="text-2xl font-semibold text-gray-900">
            {STRINGS.testSupport.disabledTitle}
          </h1>
          <p className="mt-4 text-gray-600">
            {STRINGS.testSupport.disabledDescription}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-blue-100 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-blue-600">
            {STRINGS.testSupport.subtitle}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900">
            {STRINGS.testSupport.title}
          </h1>
          <p className="text-sm text-gray-600">
            {STRINGS.testSupport.description}
          </p>
        </div>

        {error ? (
          <p
            className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={isSubmitting}
          className="mt-8 w-full cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting
            ? STRINGS.testSupport.configuring
            : STRINGS.testSupport.continueCta}
        </button>

        <p className="mt-4 text-center text-xs text-gray-500">
          {STRINGS.testSupport.helperText}
        </p>
      </div>
    </main>
  );
}
