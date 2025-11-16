'use client';

// 1. React/Next
import React from 'react';

// 2. Third-party
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

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
  userProfileSchema,
  type UserProfileFormData,
} from '@/lib/forms/schemas/user.schema';

interface UserProfileFormProps {
  initialData?: Partial<UserProfileFormData>;
  onSubmit: (data: UserProfileFormData) => void | Promise<void>;
  isLoading?: boolean;
  success?: boolean;
}

/**
 * User Profile Form Component
 * Demonstrates optional fields and form initialization with default values
 */
export function UserProfileForm({
  initialData,
  onSubmit,
  isLoading = false,
  success = false,
}: UserProfileFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UserProfileFormData>({
    resolver: zodResolver(userProfileSchema),
    defaultValues: {
      name: initialData?.name || '',
      email: initialData?.email || '',
      bio: initialData?.bio || '',
      website: initialData?.website || '',
      phone: initialData?.phone || '',
    },
  });

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>
          Update your profile information and preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm text-green-800 dark:text-green-400">
              Your profile has been updated successfully.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Personal Information</h3>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Full Name <span className="text-red-500">*</span>
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
                Email Address <span className="text-red-500">*</span>
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
              <label htmlFor="phone" className="text-sm font-medium">
                Phone Number
              </label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+1 (555) 123-4567"
                {...register('phone')}
                aria-invalid={errors.phone ? 'true' : 'false'}
              />
              {errors.phone && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errors.phone.message}
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Optional. We&apos;ll never share your phone number.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium">Additional Information</h3>

            <div className="space-y-2">
              <label htmlFor="bio" className="text-sm font-medium">
                Bio
              </label>
              <textarea
                id="bio"
                rows={4}
                placeholder="Tell us a little about yourself..."
                {...register('bio')}
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                aria-invalid={errors.bio ? 'true' : 'false'}
              />
              {errors.bio && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errors.bio.message}
                </p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Brief description for your profile. Max 500 characters.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="website" className="text-sm font-medium">
                Website
              </label>
              <Input
                id="website"
                type="url"
                autoComplete="url"
                placeholder="https://example.com"
                {...register('website')}
                aria-invalid={errors.website ? 'true' : 'false'}
              />
              {errors.website && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errors.website.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isLoading || !isDirty}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => reset()}
              disabled={isLoading || !isDirty}
            >
              Reset
            </Button>
          </div>

          {isDirty && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              You have unsaved changes
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
