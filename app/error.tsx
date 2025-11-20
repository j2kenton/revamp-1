'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE_TAB_INDEX = -1;

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col items-center justify-center p-4"
      tabIndex={FOCUSABLE_TAB_INDEX}
    >
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-2xl font-bold">Something went wrong!</h2>
        <p
          className="mb-6 text-gray-600"
          role="alert"
          aria-live="assertive"
        >
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
