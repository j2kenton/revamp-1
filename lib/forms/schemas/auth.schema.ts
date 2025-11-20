import { z } from 'zod';

const MIN_REQUIRED_LENGTH = 1;
const MIN_PASSWORD_LENGTH = 8;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;

/**
 * Login Form Schema
 * Validates email and password for user login
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Email is required')
    .email('Invalid email address'),
  password: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Password is required')
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Registration Form Schema
 * Validates user registration data with password confirmation
 */
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(MIN_REQUIRED_LENGTH, 'Name is required')
      .min(MIN_NAME_LENGTH, `Name must be at least ${MIN_NAME_LENGTH} characters`)
      .max(MAX_NAME_LENGTH, `Name must not exceed ${MAX_NAME_LENGTH} characters`),
    email: z
      .string()
      .min(MIN_REQUIRED_LENGTH, 'Email is required')
      .email('Invalid email address'),
    password: z
      .string()
      .min(MIN_REQUIRED_LENGTH, 'Password is required')
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      ),
    confirmPassword: z.string().min(MIN_REQUIRED_LENGTH, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Forgot Password Schema
 * Validates email for password reset
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(MIN_REQUIRED_LENGTH, 'Email is required')
    .email('Invalid email address'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset Password Schema
 * Validates new password with confirmation
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_REQUIRED_LENGTH, 'Password is required')
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
      ),
    confirmPassword: z.string().min(MIN_REQUIRED_LENGTH, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
