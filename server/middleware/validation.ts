/**
 * Validation Middleware
 * Input validation and sanitization for API routes
 */

import type { NextRequest } from 'next/server';
import type { z } from 'zod';

import { validateData, formatZodError } from '@/lib/validation/schemas';
import { sanitizeChatMessage } from '@/lib/sanitizer';
import { badRequest } from '@/server/api-response';
import { PARSE_INT_RADIX } from '@/lib/constants/common';

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_MAX_REQUEST_SIZE_BYTES = 100 * 1024;

/**
 * Validate request body against a schema
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>,
): Promise<{ data: T; error: null } | { data: null; error: Response }> {
  try {
    const body = await request.json();
    const result = validateData(schema, body);

    if (!result.success) {
      const details = formatZodError(result.error);
      return {
        data: null,
        error: badRequest('Validation failed', details),
      };
    }

    return { data: result.data, error: null };
  } catch (error) {
    return {
      data: null,
      error: badRequest(
        'Invalid JSON body',
        process.env.NODE_ENV === 'development'
          ? {
              details: error instanceof Error ? error.message : 'Unknown error',
            }
          : undefined,
      ),
    };
  }
}

/**
 * Validate and sanitize chat message content
 */
export function validateAndSanitizeMessage(content: string):
  | {
      sanitized: string;
      error: null;
    }
  | { sanitized: null; error: Response } {
  // Trim content
  const trimmed = content.trim();

  // Check length
  if (trimmed.length === 0) {
    return {
      sanitized: null,
      error: badRequest('Message cannot be empty'),
    };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      sanitized: null,
      error: badRequest(`Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`),
    };
  }

  // Sanitize content
  const sanitized = sanitizeChatMessage(trimmed);

  return { sanitized, error: null };
}

/**
 * Validate request size
 */
export function validateRequestSize(
  request: NextRequest,
  maxSize: number = DEFAULT_MAX_REQUEST_SIZE_BYTES,
): { valid: boolean; error?: Response } {
  const contentLength = request.headers.get('content-length');

  if (!contentLength) {
    return { valid: true };
  }

  const size = parseInt(contentLength, PARSE_INT_RADIX);

  if (size > maxSize) {
    return {
      valid: false,
      error: badRequest('Request size exceeds maximum allowed size'),
    };
  }

  return { valid: true };
}

/**
 * Wrap route handler with body validation
 */
export function withValidation<T>(
  schema: z.ZodSchema<T>,
  handler: (
    request: NextRequest,
    body: T,
    context?: unknown,
  ) => Promise<Response>,
): (request: NextRequest, context?: unknown) => Promise<Response> {
  return async (request: NextRequest, context?: unknown) => {
    const { data, error } = await validateRequestBody(request, schema);

    if (error) {
      return error;
    }

    return handler(request, data, context);
  };
}
