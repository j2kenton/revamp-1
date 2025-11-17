/**
 * Server-side API Response Utilities
 * Standardized helpers for creating API responses
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

import type { ApiResponse, ApiError, ApiMeta } from '@/types/api';
import { ErrorCode } from '@/types/api';
import {
  toApiError,
  getStatusCode,
  shouldLogError,
} from '@/utils/error-handler';
import { logError } from '@/utils/logger';

const HTTP_STATUS_OK = 200;
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_UNAUTHORIZED = 401;
const HTTP_STATUS_FORBIDDEN = 403;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const CACHE_MAX_AGE_STATIC_SECONDS = 31536000;
const CACHE_MAX_AGE_DYNAMIC_SECONDS = 60;
const CACHE_STALE_WHILE_REVALIDATE_SECONDS = 30;
const CACHE_MAX_AGE_PRIVATE_SECONDS = 300;

/**
 * Create a successful API response
 */
export function ok<T>(
  data: T,
  meta?: Partial<ApiMeta>,
  status: number = HTTP_STATUS_OK,
): NextResponse<ApiResponse<T>> {
  const response: ApiResponse<T> = {
    data,
    meta: {
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };

  return NextResponse.json(response, { status });
}

/**
 * Create an error API response
 */
export function fail(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  status: number = HTTP_STATUS_BAD_REQUEST,
): NextResponse<ApiResponse<null>> {
  const error: ApiError = {
    code,
    message,
    details,
  };

  const response: ApiResponse<null> = {
    data: null,
    error,
    meta: {
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(response, { status });
}

/**
 * Handle error and create appropriate response
 */
export function handleError(error: unknown): NextResponse<ApiResponse<null>> {
  const apiError = toApiError(error);
  const statusCode = getStatusCode(error);

  if (shouldLogError(error)) {
    logError('API Error', error, { apiError, statusCode });
  }

  const response: ApiResponse<null> = {
    data: null,
    error: apiError,
    meta: {
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
    },
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Create a 400 Bad Request response
 */
export function badRequest(
  message: string = 'Bad Request',
  details?: Record<string, unknown>,
): NextResponse<ApiResponse<null>> {
  return fail(ErrorCode.BAD_REQUEST, message, details, HTTP_STATUS_BAD_REQUEST);
}

/**
 * Create a 401 Unauthorized response
 */
export function unauthorized(
  message: string = 'Unauthorized',
): NextResponse<ApiResponse<null>> {
  return fail(ErrorCode.UNAUTHORIZED, message, undefined, HTTP_STATUS_UNAUTHORIZED);
}

/**
 * Create a 403 Forbidden response
 */
export function forbidden(
  message: string = 'Forbidden',
): NextResponse<ApiResponse<null>> {
  return fail(ErrorCode.FORBIDDEN, message, undefined, HTTP_STATUS_FORBIDDEN);
}

/**
 * Create a 404 Not Found response
 */
export function notFound(
  resource: string = 'Resource',
): NextResponse<ApiResponse<null>> {
  return fail(ErrorCode.NOT_FOUND, `${resource} not found`, undefined, HTTP_STATUS_NOT_FOUND);
}

/**
 * Create a 429 Too Many Requests response
 */
export function tooManyRequests(
  message: string = 'Too many requests',
  details?: Record<string, unknown>,
): NextResponse<ApiResponse<null>> {
  const response = fail(
    ErrorCode.RATE_LIMIT_EXCEEDED,
    message,
    details,
    HTTP_STATUS_TOO_MANY_REQUESTS,
  );

  if (details?.retryAfter && typeof details.retryAfter === 'number') {
    response.headers.set('Retry-After', details.retryAfter.toString());
  }

  return response;
}

/**
 * Create a 500 Internal Server Error response
 */
export function serverError(
  message: string = 'Internal Server Error',
): NextResponse<ApiResponse<null>> {
  return fail(ErrorCode.INTERNAL_ERROR, message, undefined, HTTP_STATUS_INTERNAL_SERVER_ERROR);
}

/**
 * Alias for ok() to match common naming convention
 */
export function success<T>(
  data: T,
  meta?: Partial<ApiMeta>,
  options?: { headers?: Record<string, string> },
): NextResponse<ApiResponse<T>> {
  const response = ok(data, meta);

  if (options?.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

/**
 * Add standard headers to response
 */
export function addStandardHeaders(
  response: NextResponse,
  options?: {
    cacheControl?: string;
    requestId?: string;
  },
): NextResponse {
  if (options?.cacheControl) {
    response.headers.set('Cache-Control', options.cacheControl);
  }

  if (options?.requestId) {
    response.headers.set('X-Request-Id', options.requestId);
  }

  return response;
}

/**
 * Set cache control headers based on resource type
 */
export function setCacheHeaders(
  response: NextResponse,
  type: 'static' | 'dynamic' | 'private' | 'no-cache',
): NextResponse {
  const cacheHeaders = {
    static: `public, max-age=${CACHE_MAX_AGE_STATIC_SECONDS}, immutable`,
    dynamic: `public, max-age=${CACHE_MAX_AGE_DYNAMIC_SECONDS}, stale-while-revalidate=${CACHE_STALE_WHILE_REVALIDATE_SECONDS}`,
    private: `private, max-age=${CACHE_MAX_AGE_PRIVATE_SECONDS}`,
    'no-cache': 'no-store, must-revalidate',
  };

  response.headers.set('Cache-Control', cacheHeaders[type]);
  return response;
}
