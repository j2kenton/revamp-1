// 1. React/Next
import React from 'react';
import { redirect } from 'next/navigation';

// 2. Third-party
import { getServerSession } from 'next-auth';

// 3. @/ absolute
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// 4. ./ relative
import SignOutButton from './SignOutButton';
import GoHomeButton from './GoHomeButton';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  // This should never happen due to middleware, but add as defense-in-depth
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg bg-white p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

          <div className="space-y-4 mb-8">
            <div>
              <h2 className="text-xl font-semibold text-gray-700 mb-4">
                User Information
              </h2>
              <div className="space-y-2">
                <p className="text-gray-600">
                  <span className="font-medium">ID:</span> {session.user.id}
                </p>
                <p className="text-gray-600">
                  <span className="font-medium">Email:</span>{' '}
                  {session.user.email}
                </p>
                {session.user.name && (
                  <p className="text-gray-600">
                    <span className="font-medium">Name:</span>{' '}
                    {session.user.name}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Session Status
              </h3>
              <p className="text-green-600 font-medium">✓ Authenticated</p>
            </div>
          </div>

          <div className="flex gap-4">
            <SignOutButton />
            <GoHomeButton />
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-blue-50 p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            🎉 NextAuth.js is working!
          </h3>
          <p className="text-blue-800">
            This is a protected route. You can only see this page when
            authenticated. Your session is managed securely with httpOnly
            cookies.
          </p>
        </div>
      </div>
    </div>
  );
}
