/**
 * Sign Out Button Component
 *
 * Client component for signing out. Extracted from dashboard page
 * to allow the parent to be a Server Component.
 */

'use client';

// 1. React/Next
import React from 'react';

// 2. Third-party
import { signOut } from 'next-auth/react';

export default function SignOutButton() {
  const handleSignOutClick = async () => {
    try {
      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      console.error(
        'Error signing out: ' +
          (error instanceof Error ? error.message : 'Unknown error'),
      );
    }
  };

  return (
    <button
      onClick={handleSignOutClick}
      className="rounded-md bg-red-600 px-6 py-2 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
    >
      Sign Out
    </button>
  );
}
