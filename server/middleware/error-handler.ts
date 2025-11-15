/**
 * Error Handling Middleware
 * Centralized error handling for API routes
 */

import type { NextRequest } from 'next/server';

import { handleError } from '@/server/api-response';

/**
 * Wrap an API route handler with error handling
 */
export function withErrorHandler(
  handler: (request: NextRequest, context?: unknown) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  return async (request: NextRequest, context?: unknown) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleError(error);
    }
  };
}

/**
 * Async error wrapper for route handlers
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
): Promise<{ data: T; error: null } | { data: null; error: unknown }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
