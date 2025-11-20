/**
 * Login Form Schema
 *
 * Zod validation schema for the login form.
 */

import { z } from 'zod';

const MIN_REQUIRED_LENGTH = 1;
const MIN_PASSWORD_LENGTH = 6;

export const loginSchema = z.object({
  email: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Password is required')
    .min(MIN_PASSWORD_LENGTH, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
