/**
 * Chat Validation Schemas
 * Zod schemas for chat-related API requests
 */

import { z } from 'zod';

/**
 * Chat message schema
 */
export const chatMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message is too long (max 4000 characters)')
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
  title: z.string().min(1).max(200).optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;

/**
 * Update chat schema
 */
export const updateChatSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  archived: z.boolean().optional(),
});

export type UpdateChatInput = z.infer<typeof updateChatSchema>;

/**
 * Get messages query schema
 */
export const getMessagesSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type GetMessagesQuery = z.infer<typeof getMessagesSchema>;
