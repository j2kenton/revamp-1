/**
 * Error Handling Utilities
 * Centralized error handling and logging
 */

import type { ApiError } from '@/types/api';
import { ErrorCode } from '@/types/api';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_UNAUTHORIZED,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from '@/lib/constants/http-status';

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = ErrorCode.INTERNAL_ERROR,
    statusCode: number = HTTP_STATUS_INTERNAL_SERVER_ERROR,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.VALIDATION_ERROR, HTTP_STATUS_BAD_REQUEST, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication error
 */
export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, ErrorCode.UNAUTHORIZED, HTTP_STATUS_UNAUTHORIZED);
    this.name = 'AuthError';
  }
}

/**
 * Authorization error
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, ErrorCode.FORBIDDEN, HTTP_STATUS_FORBIDDEN);
    this.name = 'ForbiddenError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, ErrorCode.NOT_FOUND, HTTP_STATUS_NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(
      'Too many requests',
      ErrorCode.RATE_LIMIT_EXCEEDED,
      HTTP_STATUS_TOO_MANY_REQUESTS,
      retryAfter ? { retryAfter } : undefined,
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Convert error to API error format
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: ErrorCode.INTERNAL_ERROR,
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
    };
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  };
}

/**
 * Get HTTP status code from error
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  return HTTP_STATUS_INTERNAL_SERVER_ERROR;
}

/**
 * Check if error should be logged
 * (e.g., don't log validation errors, but log server errors)
 */
export function shouldLogError(error: unknown): boolean {
  if (error instanceof ValidationError) {
    return false;
  }

  if (error instanceof AppError) {
    return error.statusCode >= HTTP_STATUS_INTERNAL_SERVER_ERROR;
  }

  return true;
}
