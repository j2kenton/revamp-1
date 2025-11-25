/**
 * Route Protection Proxy with Security Headers
 *
 * This proxy runs on the server before any page is rendered,
 * providing secure, performant route protection without flash of
 * unauthenticated content or client-side redirects.
 *
 * Next.js 16+ uses proxy.ts instead of middleware.ts.
 * SECURITY (LOW-02, LOW-03): Adds security headers to all responses
 *
 * @see https://next-auth.js.org/configuration/nextjs#middleware
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Content Security Policy directives
 * SECURITY (LOW-02): Helps prevent XSS and other injection attacks
 */
const CSP_DIRECTIVES = [
  // Default: only allow same-origin
  "default-src 'self'",
  // Scripts: self and inline (needed for Next.js)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Styles: self and inline (needed for styling)
  "style-src 'self' 'unsafe-inline'",
  // Images: self and data URIs
  "img-src 'self' data: blob: https:",
  // Fonts: self
  "font-src 'self' data:",
  // Connect: self and any APIs
  "connect-src 'self' https:",
  // Frame ancestors: prevent clickjacking
  "frame-ancestors 'none'",
  // Form actions: same-origin only
  "form-action 'self'",
  // Base URI: same-origin only
  "base-uri 'self'",
  // Object sources: none (prevent plugins)
  "object-src 'none'",
  // Upgrade insecure requests in production
  ...(process.env.NODE_ENV === 'production'
    ? ['upgrade-insecure-requests']
    : []),
];

/**
 * Security headers to add to all responses
 * SECURITY (LOW-03): Standard HTTP security headers
 */
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  // XSS Protection (legacy but still useful)
  'X-XSS-Protection': '1; mode=block',
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Permissions policy (disable sensitive features)
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

/**
 * Production-only security headers
 */
const PRODUCTION_SECURITY_HEADERS: Record<string, string> = {
  // HSTS: Force HTTPS for 1 year, include subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

/**
 * Add security headers to a response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Add Content Security Policy
  const cspHeader = CSP_DIRECTIVES.join('; ');
  response.headers.set('Content-Security-Policy', cspHeader);

  // Add standard security headers
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }

  // Add production-only headers
  if (process.env.NODE_ENV === 'production') {
    for (const [header, value] of Object.entries(PRODUCTION_SECURITY_HEADERS)) {
      response.headers.set(header, value);
    }
  }

  return response;
}

/**
 * Check if a path is a protected route that requires authentication
 */
function isProtectedRoute(_pathname: string): boolean {
  // Add protected route patterns here
  // Currently no routes require auth protection via proxy
  // Example: return pathname.startsWith('/dashboard') || pathname.startsWith('/api/protected')
  return false;
}

/**
 * Main proxy function for non-auth-protected routes
 * Adds security headers to all responses
 */
export function proxy(_request: NextRequest): NextResponse {
  const response = NextResponse.next();
  return addSecurityHeaders(response);
}

/**
 * Auth-protected proxy using next-auth
 * Used for routes that require authentication
 */
export const authProtectedProxy = withAuth(
  // `withAuth` augments your `Request` with the user's token
  function authProxy() {
    const response = NextResponse.next();
    return addSecurityHeaders(response);
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
 * Default export: decides which proxy to use based on the route
 */
export default function mainProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // For protected routes, use auth-protected proxy
  if (isProtectedRoute(pathname)) {
    // Note: withAuth returns a middleware function that needs the request
    return authProtectedProxy(
      request as Parameters<typeof authProtectedProxy>[0],
      {} as never,
    );
  }

  // For all other routes, just add security headers
  return proxy(request);
}

/**
 * Configure which routes the proxy applies to
 * Apply to all routes except static files and Next.js internals
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
