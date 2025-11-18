/**
 * Route Protection Proxy
 *
 * This proxy runs on the server before any page is rendered,
 * providing secure, performant route protection without flash of
 * unauthenticated content or client-side redirects.
 *
 * Next.js 16+ uses proxy.ts instead of middleware.ts.
 *
 * @see https://next-auth.js.org/configuration/nextjs#middleware
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  // `withAuth` augments your `Request` with the user's token
  function proxy() {
    // Proxy logic here if needed
    // For example, role-based access control
    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true if user is authenticated and can access the page
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  },
);

/**
 * Specify which routes should be protected by this proxy.
 * Add or remove paths as needed for your application.
 */
export const config = {
  matcher: [
    // '/secure-route/:path*',
  ],
};
