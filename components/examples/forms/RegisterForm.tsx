'use client';

// 1. React/Next

// 2. Third-party
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

// 3. @/ absolute
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  registerSchema,
  type RegisterFormData,
} from '@/lib/forms/schemas/auth.schema';

interface RegisterFormProps {
  onSubmit: (data: RegisterFormData) => void | Promise<void>;
  isLoading?: boolean;
  error?: string;
}

/**
 * Registration Form Component
 * Demonstrates react-hook-form with Zod validation and password confirmation
 */
export function RegisterForm({
  onSubmit,
  isLoading = false,
  error,
}: RegisterFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = useWatch({
    control,
    name: 'password',
  });

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Enter your information to create a new account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
              <p className="text-sm text-red-800 dark:text-red-400">{error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Full Name
            </label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="John Doe"
              {...register('name')}
              aria-invalid={errors.name ? 'true' : 'false'}
            />
            {errors.name && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="email@example.com"
              {...register('email')}
              aria-invalid={errors.email ? 'true' : 'false'}
            />
            {errors.email && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('password')}
              aria-invalid={errors.password ? 'true' : 'false'}
            />
            {errors.password && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.password.message}
              </p>
            )}
            {password && password.length > 0 && (
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <p>Password must contain:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li
                    className={
                      password.length >= 8 ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    At least 8 characters
                  </li>
                  <li
                    className={
                      /[A-Z]/.test(password) ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    One uppercase letter
                  </li>
                  <li
                    className={
                      /[a-z]/.test(password) ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    One lowercase letter
                  </li>
                  <li
                    className={
                      /\d/.test(password) ? 'text-green-600' : 'text-red-600'
                    }
                  >
                    One number
                  </li>
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              {...register('confirmPassword')}
              aria-invalid={errors.confirmPassword ? 'true' : 'false'}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
