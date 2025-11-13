'use client';

import Link from 'next/link';
import type { Session } from 'next-auth';

interface AuthStatusProps {
  session: Session | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
}

export function AuthStatus({ session, status }: AuthStatusProps) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <div className="text-center space-y-6">
        {status === 'loading' ? (
          <p className="text-gray-500" aria-live="polite">
            Loading session...
          </p>
        ) : session ? (
          <>
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-900">
                Welcome back, {session.user?.name || session.user?.email}!
              </p>
              <p className="text-sm text-green-600 font-medium">
                ✓ You are signed in
              </p>
            </div>
            <Link
              href="/dashboard"
              className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </Link>
          </>
        ) : (
          <>
            <p className="text-gray-600">Sign in to access your dashboard</p>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
