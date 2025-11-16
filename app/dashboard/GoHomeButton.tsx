/**
 * Go Home Button Component
 *
 * Client component for navigation. Extracted from dashboard page
 * to allow the parent to be a Server Component.
 */

'use client';

// 1. React/Next
import React from 'react';
import { useRouter } from 'next/navigation';

export default function GoHomeButton() {
  const router = useRouter();

  const handleGoHomeClick = () => {
    router.push('/');
  };

  return (
    <button
      onClick={handleGoHomeClick}
      className="rounded-md bg-gray-600 px-6 py-2 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
    >
      Go to Home
    </button>
  );
}
