/**
 * HTTP Client Utilities
 * Type-safe fetch wrappers with standardized error handling
 */

import type { ApiResponse } from '@/types/api';

export interface FetchOptions extends RequestInit {
  timeout?: number;
}

/**
 * Base fetch wrapper with timeout and typed response
 */
export async function fetchWithTimeout<T>(
  url: string,
  options: FetchOptions = {},
): Promise<ApiResponse<T>> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle empty responses (204, 205, or no body)
    const contentLength = response.headers.get('content-length');
    const hasBody =
      response.status !== 204 &&
      response.status !== 205 &&
      contentLength !== '0';

    if (!hasBody) {
      // Return success with null data for empty responses
      return {
        data: null,
        meta: {
          requestId: response.headers.get('x-request-id') || '',
          timestamp: new Date().toISOString(),
        },
      } as ApiResponse<T>;
    }

    // Only parse JSON when body exists
    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          data: null,
          error: {
            code: 'TIMEOUT',
            message: 'Request timeout',
          },
          meta: {
            requestId: '',
            timestamp: new Date().toISOString(),
          },
        } as ApiResponse<T>;
      }
    }

    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      meta: {
        requestId: '',
        timestamp: new Date().toISOString(),
      },
    } as ApiResponse<T>;
  }
}

/**
 * GET request helper
 */
export async function get<T>(
  url: string,
  options?: FetchOptions,
): Promise<ApiResponse<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'GET',
  });
}

/**
 * POST request helper
 */
export async function post<T>(
  url: string,
  body?: unknown,
  options?: FetchOptions,
): Promise<ApiResponse<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request helper
 */
export async function put<T>(
  url: string,
  body?: unknown,
  options?: FetchOptions,
): Promise<ApiResponse<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request helper
 */
export async function patch<T>(
  url: string,
  body?: unknown,
  options?: FetchOptions,
): Promise<ApiResponse<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request helper
 */
export async function del<T>(
  url: string,
  options?: FetchOptions,
): Promise<ApiResponse<T>> {
  return fetchWithTimeout<T>(url, {
    ...options,
    method: 'DELETE',
  });
}
