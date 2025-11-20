/**
 * Validation Schemas
 * Zod schemas for input validation across the application
 */

import { z } from 'zod';

const MINIMUM_STRING_LENGTH = 1;
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_TITLE_LENGTH = 100;
const DEFAULT_PAGE_NUMBER = 1;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_PAGE_LIMIT = 20;

/**
 * Chat message validation schema
 */
export const chatMessageSchema = z.object({
  chatId: z.string().uuid('Invalid chat ID format'),
  content: z
    .string()
    .trim()
    .min(MINIMUM_STRING_LENGTH, 'Message cannot be empty')
    .max(MAX_CHAT_MESSAGE_LENGTH, 'Message cannot exceed 2000 characters')
    .transform((val) => val.trim()),
  parentMessageId: z.string().uuid().optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

/**
 * Create chat validation schema
 */
export const createChatSchema = z.object({
  title: z
    .string()
    .trim()
    .min(MINIMUM_STRING_LENGTH, 'Title cannot be empty')
    .max(MAX_TITLE_LENGTH, 'Title cannot exceed 100 characters')
    .optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;

/**
 * Update chat validation schema
 */
export const updateChatSchema = z.object({
  title: z
    .string()
    .trim()
    .min(MINIMUM_STRING_LENGTH, 'Title cannot be empty')
    .max(MAX_TITLE_LENGTH, 'Title cannot exceed 100 characters')
    .optional(),
  archived: z.boolean().optional(),
});

export type UpdateChatInput = z.infer<typeof updateChatSchema>;

/**
 * User profile validation schema
 */
export const updateUserProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(MINIMUM_STRING_LENGTH, 'Name cannot be empty')
    .max(MAX_TITLE_LENGTH, 'Name cannot exceed 100 characters')
    .optional(),
  title: z
    .string()
    .trim()
    .max(MAX_TITLE_LENGTH, 'Title cannot exceed 100 characters')
    .optional(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

/**
 * Pagination validation schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(DEFAULT_PAGE_NUMBER),
  limit: z
    .coerce.number()
    .int()
    .positive()
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Validation helper to safely validate data
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
}

/**
 * Format zod errors for API responses
 */
export function formatZodError(error: z.ZodError): Record<string, unknown> {
  return error.issues.reduce(
    (acc, issue) => {
      const path = issue.path.join('.');
      acc[path] = issue.message;
      return acc;
    },
    {} as Record<string, unknown>,
  );
}
