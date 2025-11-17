/**
 * User Profile Component
 *
 * Example component showing how to use SWR to fetch and display user data
 * with loading states, error handling, and revalidation.
 */

'use client';

// 1. React/Next
import Image from 'next/image';

// 3. @/ absolute
import { useUser } from '@/lib/swr/hooks';

interface UserProfileProps {
  userId: string;
}

export function UserProfile({ userId }: UserProfileProps) {
  const { data: user, error, isLoading, mutate } = useUser(userId);

  // Loading state
  if (isLoading) {
    return (
      <div
        className="animate-pulse space-y-4"
        role="status"
        aria-label="Loading user profile"
      >
        <div className="h-20 w-20 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200" />
        <div className="h-4 w-64 rounded bg-gray-200" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="rounded-lg border border-red-200 bg-red-50 p-4"
        role="alert"
      >
        <h3 className="font-semibold text-red-900">Error loading user</h3>
        <p className="text-sm text-red-700">{error.message}</p>
        <button
          onClick={() => mutate()}
          className="mt-2 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // No data state
  if (!user) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-gray-700">User not found</p>
      </div>
    );
  }

  // Success state
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        {user.avatar && (
          <Image
            src={user.avatar}
            alt={`${user.name}'s avatar`}
            width={80}
            height={80}
            className="rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900">{user.name}</h2>
          <p className="text-sm text-gray-600">{user.email}</p>
          <span className="mt-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
            {user.role}
          </span>
          <div className="mt-4 text-sm text-gray-500">
            <p>Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="rounded bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
          aria-label="Refresh user data"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
