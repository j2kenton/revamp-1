# react-hook-form & Zod Form Management Guide

This project uses [react-hook-form](https://react-hook-form.com/) for performant form state management and [Zod](https://zod.dev/) for type-safe schema validation.

## Overview

The combination of react-hook-form and Zod provides:

- Type-safe form validation with automatic TypeScript inference
- Minimal re-renders for better performance
- Powerful validation with custom rules
- Easy integration with UI components
- Comprehensive error handling

## Project Structure

```
lib/forms/
└── schemas/
    ├── auth.schema.ts    # Authentication-related schemas
    └── user.schema.ts    # User and general form schemas

components/examples/
├── forms/
│   ├── LoginForm.tsx         # Login form example
│   ├── RegisterForm.tsx      # Registration with password validation
│   ├── ContactForm.tsx       # Contact form with select/textarea
│   └── UserProfileForm.tsx   # Profile form with optional fields
└── FormExamples.tsx          # Comprehensive examples page
```

## Available Schemas

### Authentication Schemas (auth.schema.ts)

#### loginSchema

Validates email and password for user login.

```typescript
import { loginSchema, type LoginFormData } from '@/lib/forms/schemas/auth.schema';

// Schema definition
{
  email: string (required, valid email)
  password: string (required, min 8 characters)
}
```

#### registerSchema

Validates user registration with password confirmation.

```typescript
import { registerSchema, type RegisterFormData } from '@/lib/forms/schemas/auth.schema';

// Schema definition
{
  name: string (required, 2-50 characters)
  email: string (required, valid email)
  password: string (required, min 8 chars, uppercase, lowercase, number)
  confirmPassword: string (required, must match password)
}
```

#### forgotPasswordSchema

Validates email for password reset.

```typescript
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/forms/schemas/auth.schema';

// Schema definition
{
  email: string (required, valid email)
}
```

#### resetPasswordSchema

Validates new password with confirmation.

```typescript
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/forms/schemas/auth.schema';

// Schema definition
{
  password: string (required, min 8 chars, uppercase, lowercase, number)
  confirmPassword: string (required, must match password)
}
```

### User Schemas (user.schema.ts)

#### userProfileSchema

Validates user profile information with optional fields.

```typescript
import { userProfileSchema, type UserProfileFormData } from '@/lib/forms/schemas/user.schema';

// Schema definition
{
  name: string (required, 2-50 characters)
  email: string (required, valid email)
  bio: string (optional, max 500 characters)
  website: string (optional, valid URL)
  phone: string (optional, valid phone format)
}
```

#### contactFormSchema

Validates contact/support form submissions.

```typescript
import { contactFormSchema, type ContactFormData } from '@/lib/forms/schemas/user.schema';

// Schema definition
{
  name: string (required, 2-100 characters)
  email: string (required, valid email)
  subject: string (required, 5-200 characters)
  message: string (required, 10-2000 characters)
  category: enum ['general', 'support', 'sales', 'feedback']
}
```

#### newsletterSchema

Validates newsletter subscription with preferences.

```typescript
import { newsletterSchema, type NewsletterFormData } from '@/lib/forms/schemas/user.schema';

// Schema definition
{
  email: string (required, valid email)
  preferences: {
    productUpdates: boolean (default: true)
    weeklyNewsletter: boolean (default: true)
    promotions: boolean (default: false)
  }
}
```

#### searchFormSchema

Validates search queries with filters.

```typescript
import { searchFormSchema, type SearchFormData } from '@/lib/forms/schemas/user.schema';

// Schema definition
{
  query: string (required, max 200 characters)
  category: enum ['all', 'posts', 'users', 'products'] (optional)
  sortBy: enum ['relevance', 'date', 'popularity'] (optional)
  dateRange: { from: Date, to: Date } (optional)
}
```

## Basic Usage

### Simple Form Example

```typescript
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginFormData } from '@/lib/forms/schemas/auth.schema';

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    console.log(data); // Type-safe, validated data
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        type="email"
        {...register('email')}
        aria-invalid={errors.email ? 'true' : 'false'}
      />
      {errors.email && <p>{errors.email.message}</p>}

      <input
        type="password"
        {...register('password')}
        aria-invalid={errors.password ? 'true' : 'false'}
      />
      {errors.password && <p>{errors.password.message}</p>}

      <button type="submit">Login</button>
    </form>
  );
}
```

## Advanced Features

### Password Validation with Real-time Feedback

```typescript
const password = watch('password');

{password && password.length > 0 && (
  <div>
    <ul>
      <li className={password.length >= 8 ? 'valid' : 'invalid'}>
        At least 8 characters
      </li>
      <li className={/[A-Z]/.test(password) ? 'valid' : 'invalid'}>
        One uppercase letter
      </li>
      <li className={/[a-z]/.test(password) ? 'valid' : 'invalid'}>
        One lowercase letter
      </li>
      <li className={/\d/.test(password) ? 'valid' : 'invalid'}>
        One number
      </li>
    </ul>
  </div>
)}
```

### Optional Fields

```typescript
const schema = z.object({
  required: z.string().min(1, 'This field is required'),
  optional: z.string().optional().or(z.literal('')),
});
```

### Custom Validation with refine()

```typescript
const schema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
```

### Enum Validation

```typescript
const schema = z.object({
  category: z.enum(['general', 'support', 'sales', 'feedback'], {
    errorMap: () => ({ message: 'Please select a category' }),
  }),
});
```

### Form State Management

```typescript
const {
  register,
  handleSubmit,
  formState: { errors, isDirty, isSubmitting },
  reset,
  watch,
} = useForm<FormData>({
  resolver: zodResolver(schema),
});

// Check if form has unsaved changes
{isDirty && <p>You have unsaved changes</p>}

// Disable submit while submitting
<button type="submit" disabled={isSubmitting}>
  {isSubmitting ? 'Submitting...' : 'Submit'}
</button>

// Reset form to default values
<button type="button" onClick={() => reset()}>
  Reset
</button>
```

### Pre-populating Forms

```typescript
const { register, handleSubmit } = useForm<UserProfileFormData>({
  resolver: zodResolver(userProfileSchema),
  defaultValues: {
    name: initialData?.name || '',
    email: initialData?.email || '',
    bio: initialData?.bio || '',
  },
});
```

## Form Components

### LoginForm

Basic authentication form with email and password validation.

**Features:**

- Email validation
- Password minimum length
- Error display
- Loading state
- Custom error messages

**Usage:**

```typescript
import { LoginForm } from '@/components/examples/forms/LoginForm';

<LoginForm
  onSubmit={handleLogin}
  isLoading={isLoading}
  error={errorMessage}
/>
```

### RegisterForm

Advanced registration form with password strength validation.

**Features:**

- Name, email, password fields
- Password confirmation
- Real-time password strength indicator
- Visual feedback for requirements
- Custom refine validation

**Usage:**

```typescript
import { RegisterForm } from '@/components/examples/forms/RegisterForm';

<RegisterForm
  onSubmit={handleRegister}
  isLoading={isLoading}
  error={errorMessage}
/>
```

### ContactForm

Complex form with select, textarea, and multiple field types.

**Features:**

- Grid layout
- Select dropdown
- Textarea with character limit
- Success state handling
- Form reset after submission

**Usage:**

```typescript
import { ContactForm } from '@/components/examples/forms/ContactForm';

<ContactForm
  onSubmit={handleContact}
  isLoading={isLoading}
  success={isSuccess}
/>
```

### UserProfileForm

Profile management form with optional fields and dirty state tracking.

**Features:**

- Pre-populated fields
- Optional field validation
- URL and phone validation
- isDirty state tracking
- Grouped form sections
- Unsaved changes warning

**Usage:**

```typescript
import { UserProfileForm } from '@/components/examples/forms/UserProfileForm';

<UserProfileForm
  initialData={userData}
  onSubmit={handleProfileUpdate}
  isLoading={isLoading}
  success={isSuccess}
/>
```

## Creating Custom Schemas

### Step 1: Define the Schema

```typescript
// lib/forms/schemas/custom.schema.ts
import { z } from 'zod';

export const customSchema = z.object({
  field1: z.string().min(1, 'Field 1 is required'),
  field2: z.number().min(0).max(100),
  field3: z.boolean().default(false),
});

export type CustomFormData = z.infer<typeof customSchema>;
```

### Step 2: Create the Form Component

```typescript
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { customSchema, type CustomFormData } from '@/lib/forms/schemas/custom.schema';

export function CustomForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomFormData>({
    resolver: zodResolver(customSchema),
  });

  const onSubmit = (data: CustomFormData) => {
    // data is fully typed and validated
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Form fields */}
    </form>
  );
}
```

## Common Validation Patterns

### Email Validation

```typescript
email: z.string().email('Invalid email address')
```

### Password with Requirements

```typescript
password: z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number')
```

### Phone Number

```typescript
phone: z
  .string()
  .regex(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/, 'Invalid phone number')
```

### URL Validation

```typescript
website: z.string().url('Invalid URL')
```

### Character Limits

```typescript
bio: z.string().max(500, 'Bio must not exceed 500 characters')
```

### Numeric Ranges

```typescript
age: z.number().min(18, 'Must be 18 or older').max(120)
```

### Custom Transformations

```typescript
email: z.string().email().transform(val => val.toLowerCase())
```

## Error Handling

### Field-Level Errors

```typescript
{errors.email && (
  <p className="text-sm text-red-600">
    {errors.email.message}
  </p>
)}
```

### Form-Level Errors

```typescript
{error && (
  <div className="rounded-md bg-red-50 p-4">
    <p className="text-sm text-red-800">{error}</p>
  </div>
)}
```

### Success Messages

```typescript
{success && (
  <div className="rounded-md bg-green-50 p-4">
    <p className="text-sm text-green-800">Success!</p>
  </div>
)}
```

## Best Practices

1. **Type Safety**
   - Always use TypeScript
   - Infer types from Zod schemas with `z.infer<typeof schema>`
   - Export types alongside schemas

2. **Schema Organization**
   - Group related schemas in files (auth, user, etc.)
   - Keep schemas reusable and composable
   - Document complex validation rules

3. **Default Values**
   - Always provide `defaultValues` to prevent uncontrolled inputs
   - Use empty strings for text inputs, not undefined
   - Match the shape of your schema

4. **Error Messages**
   - Provide clear, actionable error messages
   - Be specific about requirements (e.g., "minimum 8 characters")
   - Consider user-friendly language

5. **Accessibility**
   - Use `aria-invalid` attributes
   - Associate labels with inputs
   - Include `autocomplete` attributes
   - Ensure keyboard navigation works

6. **Performance**
   - Use `mode: 'onBlur'` for less aggressive validation
   - Avoid unnecessary re-renders with `watch` carefully
   - Use `shouldUnregister: false` if needed

7. **User Experience**
   - Show loading states during submission
   - Disable submit buttons while loading
   - Clear errors on successful submission
   - Provide success feedback

## Integration with shadcn-ui

All form components integrate seamlessly with shadcn-ui:

```typescript
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Login</CardTitle>
  </CardHeader>
  <CardContent>
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('email')} />
      <Button type="submit">Submit</Button>
    </form>
  </CardContent>
</Card>
```

## Testing Forms

### Unit Testing Schema

```typescript
import { loginSchema } from '@/lib/forms/schemas/auth.schema';

describe('loginSchema', () => {
  it('validates correct data', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'Password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'invalid',
      password: 'Password123',
    });
    expect(result.success).toBe(false);
  });
});
```

### Integration Testing

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { LoginForm } from '@/components/examples/forms/LoginForm';

it('displays validation errors', async () => {
  render(<LoginForm onSubmit={jest.fn()} />);
  
  const submitButton = screen.getByRole('button', { name: /sign in/i });
  fireEvent.click(submitButton);
  
  expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
});
```

## Resources

- [react-hook-form Documentation](https://react-hook-form.com/)
- [Zod Documentation](https://zod.dev/)
- [Form Examples](../../components/examples/FormExamples.tsx)
- [@hookform/resolvers](https://github.com/react-hook-form/resolvers)

## Troubleshooting

### "Cannot find module '@hookform/resolvers'"

Install the package: `pnpm add @hookform/resolvers`

### Validation not working

Ensure `resolver: zodResolver(schema)` is in `useForm` config

### TypeScript errors on inferred types

Check that schema is exported and types are properly inferred with `z.infer`

### Form not resetting

Use `reset()` from `useForm` hook, not native form reset

### Uncontrolled input warnings

Always provide `defaultValues` in `useForm` configuration
