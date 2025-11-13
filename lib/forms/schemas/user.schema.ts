import { z } from 'zod';

/**
 * User Profile Schema
 * Validates user profile information
 */
export const userProfileSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  bio: z
    .string()
    .max(500, 'Bio must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  phone: z
    .string()
    .regex(
      /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
      'Invalid phone number',
    )
    .optional()
    .or(z.literal('')),
});

export type UserProfileFormData = z.infer<typeof userProfileSchema>;

/**
 * Contact Form Schema
 * Validates contact/support form submissions
 */
export const contactFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .min(5, 'Subject must be at least 5 characters')
    .max(200, 'Subject must not exceed 200 characters'),
  message: z
    .string()
    .min(1, 'Message is required')
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message must not exceed 2000 characters'),
  category: z.enum(['general', 'support', 'sales', 'feedback'], {
    errorMap: () => ({ message: 'Please select a category' }),
  }),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

/**
 * Newsletter Subscription Schema
 * Validates newsletter subscription
 */
export const newsletterSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  preferences: z.object({
    productUpdates: z.boolean().default(true),
    weeklyNewsletter: z.boolean().default(true),
    promotions: z.boolean().default(false),
  }),
});

export type NewsletterFormData = z.infer<typeof newsletterSchema>;

/**
 * Search Form Schema
 * Validates search query with filters
 */
export const searchFormSchema = z.object({
  query: z
    .string()
    .min(1, 'Search query is required')
    .max(200, 'Query must not exceed 200 characters'),
  category: z
    .enum(['all', 'posts', 'users', 'products'])
    .default('all')
    .optional(),
  sortBy: z
    .enum(['relevance', 'date', 'popularity'])
    .default('relevance')
    .optional(),
  dateRange: z
    .object({
      from: z.date().optional(),
      to: z.date().optional(),
    })
    .optional(),
});

export type SearchFormData = z.infer<typeof searchFormSchema>;
