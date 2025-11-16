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
  contactFormSchema,
  type ContactFormData,
} from '@/lib/forms/schemas/user.schema';

interface ContactFormProps {
  onSubmit: (data: ContactFormData) => void | Promise<void>;
  isLoading?: boolean;
  success?: boolean;
}

/**
 * Contact Form Component
 * Demonstrates select inputs and textarea with react-hook-form and Zod
 */
export function ContactForm({
  onSubmit,
  isLoading = false,
  success = false,
}: ContactFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
      category: 'general',
    },
  });

  const handleFormSubmit = async (data: ContactFormData) => {
    await onSubmit(data);
    if (success) {
      reset();
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Contact Us</CardTitle>
        <CardDescription>
          Send us a message and we&apos;ll get back to you as soon as possible
        </CardDescription>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-4 dark:bg-green-900/20">
            <p className="text-sm text-green-800 dark:text-green-400">
              Thank you! Your message has been sent successfully.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
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
                Email
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
          </div>

          <div className="space-y-2">
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              {...register('category')}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:focus-visible:ring-slate-300"
              aria-invalid={errors.category ? 'true' : 'false'}
            >
              <option value="general">General Inquiry</option>
              <option value="support">Technical Support</option>
              <option value="sales">Sales</option>
              <option value="feedback">Feedback</option>
            </select>
            {errors.category && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.category.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="subject" className="text-sm font-medium">
              Subject
            </label>
            <Input
              id="subject"
              type="text"
              placeholder="How can we help?"
              {...register('subject')}
              aria-invalid={errors.subject ? 'true' : 'false'}
            />
            {errors.subject && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.subject.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="message" className="text-sm font-medium">
              Message
            </label>
            <textarea
              id="message"
              rows={6}
              placeholder="Tell us more about your inquiry..."
              {...register('message')}
              className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
              aria-invalid={errors.message ? 'true' : 'false'}
            />
            {errors.message && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {errors.message.message}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Message'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => reset()}
              disabled={isLoading}
            >
              Clear
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
