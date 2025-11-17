'use client';

// 1. React/Next
import Image from 'next/image';

// 2. Third-party
import { useSession } from 'next-auth/react';

// 3. @/ absolute
import { AuthStatus } from '@/components/AuthStatus';

export default function Home() {
  const { data: session, status } = useSession();

  return (
    // The main landmark is defined in the <main> tag below.
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <main className="flex w-full max-w-4xl flex-col items-center gap-12 py-16 px-8">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={150}
          height={30}
          priority
        />

        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-gray-900">
            Next.js App with Authentication
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl">
            Built with Next.js 14, NextAuth.js, Redux, and TypeScript
          </p>
        </div>

        <AuthStatus session={session} status={status} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              🔐 NextAuth.js
            </h3>
            <p className="text-gray-600 text-sm">
              Secure authentication with JWT sessions and httpOnly cookies
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              🔄 Redux
            </h3>
            <p className="text-gray-600 text-sm">
              Client-side state management with Redux Toolkit
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              ⚡ Next.js 14
            </h3>
            <p className="text-gray-600 text-sm">
              App Router with Server Components
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              📘 TypeScript
            </h3>
            <p className="text-gray-600 text-sm">
              Fully typed with strict type checking
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
