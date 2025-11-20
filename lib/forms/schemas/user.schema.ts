import { z } from 'zod';

const MIN_REQUIRED_LENGTH = 1;
const MIN_NAME_LENGTH = 2;
const MAX_PROFILE_NAME_LENGTH = 50;
const MAX_PROFILE_BIO_LENGTH = 500;
const MAX_CONTACT_NAME_LENGTH = 100;
const MIN_SUBJECT_LENGTH = 5;
const MAX_SUBJECT_LENGTH = 200;
const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SEARCH_QUERY_LENGTH = 200;

/**
 * User Profile Schema
 * Validates user profile information
 */
export const userProfileSchema = z.object({
  name: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Name is required')
    .min(MIN_NAME_LENGTH, `Name must be at least ${MIN_NAME_LENGTH} characters`)
    .max(
      MAX_PROFILE_NAME_LENGTH,
      `Name must not exceed ${MAX_PROFILE_NAME_LENGTH} characters`,
    ),
  email: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Email is required')
    .email('Invalid email address'),
  bio: z
    .string()
    .max(
      MAX_PROFILE_BIO_LENGTH,
      `Bio must not exceed ${MAX_PROFILE_BIO_LENGTH} characters`,
    )
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
    .min(MIN_REQUIRED_LENGTH, 'Name is required')
    .min(MIN_NAME_LENGTH, `Name must be at least ${MIN_NAME_LENGTH} characters`)
    .max(
      MAX_CONTACT_NAME_LENGTH,
      `Name must not exceed ${MAX_CONTACT_NAME_LENGTH} characters`,
    ),
  email: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Email is required')
    .email('Invalid email address'),
  subject: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Subject is required')
    .min(
      MIN_SUBJECT_LENGTH,
      `Subject must be at least ${MIN_SUBJECT_LENGTH} characters`,
    )
    .max(
      MAX_SUBJECT_LENGTH,
      `Subject must not exceed ${MAX_SUBJECT_LENGTH} characters`,
    ),
  message: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Message is required')
    .min(
      MIN_MESSAGE_LENGTH,
      `Message must be at least ${MIN_MESSAGE_LENGTH} characters`,
    )
    .max(
      MAX_MESSAGE_LENGTH,
      `Message must not exceed ${MAX_MESSAGE_LENGTH} characters`,
    ),
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
  email: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Email is required')
    .email('Invalid email address'),
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
    .min(MIN_REQUIRED_LENGTH, 'Search query is required')
    .max(
      MAX_SEARCH_QUERY_LENGTH,
      `Query must not exceed ${MAX_SEARCH_QUERY_LENGTH} characters`,
    ),
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
