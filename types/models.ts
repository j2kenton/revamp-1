/**
 * Database Models and Domain Types
 * Core data models for the application
 */

/**
 * User model
 * Represents a user in the system
 */
export interface UserModel {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Chat model
 * Represents a chat conversation
 */
export interface ChatModel {
  id: string;
  userId: string;
  title: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Message model
 * Represents a single message in a chat
 */
export interface MessageModel {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'sending' | 'sent' | 'failed' | 'read';
  parentMessageId: string | null;
  metadata: MessageMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Message metadata
 * Additional information about a message
 */
export interface MessageMetadata {
  model?: string;
  tokensUsed?: number;
  processingTime?: number;
  clientRequestId?: string;
  respondingToClientRequestId?: string;
  contextTruncated?: boolean;
  messagesRemoved?: number;
  circuitBreakerOpen?: boolean;
  [key: string]: unknown;
}

/**
 * Session model
 * Server-side session data
 */
export interface SessionModel {
  id: string;
  userId: string;
  csrfToken: string;
  data: SessionData;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session data
 * Additional session information
 */
export interface SessionData {
  userAgent?: string;
  ipAddress?: string;
  lastActivityAt?: Date;
  [key: string]: unknown;
}

/**
 * Rate limit counter
 * Tracking rate limits per user/IP
 */
export interface RateLimitCounter {
  identifier: string;
  endpoint: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

/**
 * DTO (Data Transfer Object) types
 * Used for API responses
 */

export interface UserDTO {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatDTO {
  id: string;
  userId: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
  lastMessage?: MessageDTO;
}

export interface MessageDTO {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'sending' | 'sent' | 'failed' | 'read';
  parentMessageId: string | null;
  metadata: MessageMetadata | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pagination types
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Chat history with messages
 */
export interface ChatWithMessages extends ChatDTO {
  messages: MessageDTO[];
}

/**
 * Convert model to DTO
 */
export function userToDTO(user: UserModel): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    title: user.title,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function chatToDTO(chat: ChatModel): ChatDTO {
  return {
    id: chat.id,
    userId: chat.userId,
    title: chat.title,
    archived: chat.archived,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

export function messageToDTO(message: MessageModel): MessageDTO {
  return {
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    content: message.content,
    status: message.status,
    parentMessageId: message.parentMessageId,
    metadata: message.metadata,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}
