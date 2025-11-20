/**
 * Chat Validation Schemas
 * Zod schemas for chat-related API requests
 */

import { z } from 'zod';

const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 4000;
const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 200;
const MIN_OFFSET = 0;
const DEFAULT_OFFSET = 0;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * Chat message schema
 */
export const chatMessageSchema = z.object({
  content: z
    .string()
    .min(MIN_MESSAGE_LENGTH, 'Message cannot be empty')
    .max(MAX_MESSAGE_LENGTH, 'Message is too long (max 4000 characters)')
    .trim(),
  chatId: z.string().optional(),
  parentMessageId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

/**
 * Create chat schema
 */
export const createChatSchema = z.object({
  title: z.string().min(MIN_TITLE_LENGTH).max(MAX_TITLE_LENGTH).optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;

/**
 * Update chat schema
 */
export const updateChatSchema = z.object({
  title: z.string().min(MIN_TITLE_LENGTH).max(MAX_TITLE_LENGTH).optional(),
  archived: z.boolean().optional(),
});

export type UpdateChatInput = z.infer<typeof updateChatSchema>;

/**
 * Get messages query schema
 */
export const getMessagesSchema = z.object({
  offset: z.coerce.number().int().min(MIN_OFFSET).default(DEFAULT_OFFSET),
  limit: z
    .coerce.number()
    .int()
    .min(MIN_LIMIT)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT),
});

export type GetMessagesQuery = z.infer<typeof getMessagesSchema>;
