/**
 * API Type Definitions
 * Standardized types for API requests and responses
 */

/**
 * Standard API error structure
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Standard API response metadata
 */
export interface ApiMeta {
  requestId: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Standard API response wrapper
 * All API endpoints should return data in this format
 */
export interface ApiResponse<T> {
  data: T | null;
  error?: ApiError;
  meta: ApiMeta;
}

/**
 * Chat message data types
 */
export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  updatedAt: string;
  status?: 'sending' | 'sent' | 'failed' | 'read';
  parentMessageId?: string;
  metadata?: {
    model?: string;
    tokensUsed?: number;
    processingTime?: number;
  };
}

/**
 * Chat data types
 */
export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

/**
 * User data types
 */
export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Session data types
 */
export interface Session {
  id: string;
  userId: string;
  csrfToken?: string;
  expiresAt: string;
}

/**
 * Rate limit info
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
}

/**
 * Common error codes
 */
export enum ErrorCode {
  // Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CSRF_TOKEN_INVALID = 'CSRF_TOKEN_INVALID',

  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
}
