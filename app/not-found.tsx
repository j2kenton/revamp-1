// 1. React/Next
import React from 'react';
import Link from 'next/link';

/**
 * Custom 404 page.
 * This page is shown when a route is not found.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-6xl font-bold">404</h1>
        <h2 className="mb-4 text-2xl font-bold">Page Not Found</h2>
        <p className="mb-6 text-gray-600">
          Sorry, we could not find the page you are looking for.
        </p>
        <Link
          href="/"
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Go back home
        </Link>
      </div>
    </div>
  );
}
