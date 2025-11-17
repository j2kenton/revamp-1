'use client';

// 1. React/Next
import { useEffect } from 'react';

/**
 * Error boundary for the application.
 * This component catches errors that occur during rendering,
 * in lifecycle methods, and in constructors of the whole tree below them.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-2xl font-bold">Something went wrong!</h2>
        <p className="mb-6 text-gray-600">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
