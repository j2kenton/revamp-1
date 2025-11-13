'use client';

import React, { useState } from 'react';
import { LoginForm } from './forms/LoginForm';
import { RegisterForm } from './forms/RegisterForm';
import { ContactForm } from './forms/ContactForm';
import { UserProfileForm } from './forms/UserProfileForm';
import type { LoginFormData } from '@/lib/forms/schemas/auth.schema';
import type { RegisterFormData } from '@/lib/forms/schemas/auth.schema';
import type { ContactFormData } from '@/lib/forms/schemas/user.schema';
import type { UserProfileFormData } from '@/lib/forms/schemas/user.schema';

/**
 * Form Examples Component
 * Comprehensive demonstration of react-hook-form with Zod validation
 */
export function FormExamples() {
  const [loginState, setLoginState] = useState({
    isLoading: false,
    error: '',
  });

  const [registerState, setRegisterState] = useState({
    isLoading: false,
    error: '',
  });

  const [contactState, setContactState] = useState({
    isLoading: false,
    success: false,
  });

  const [profileState, setProfileState] = useState({
    isLoading: false,
    success: false,
  });

  const handleLogin = async (data: LoginFormData) => {
    setLoginState({ isLoading: true, error: '' });

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Demo validation
    if (data.email === 'demo@example.com' && data.password === 'Password123') {
      console.log('Login successful:', data);
      setLoginState({ isLoading: false, error: '' });
    } else {
      setLoginState({
        isLoading: false,
        error: 'Invalid credentials. Try: demo@example.com / Password123',
      });
    }
  };

  const handleRegister = async (data: RegisterFormData) => {
    setRegisterState({ isLoading: true, error: '' });

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('Registration data:', data);
    setRegisterState({ isLoading: false, error: '' });
    alert('Registration successful!');
  };

  const handleContact = async (data: ContactFormData) => {
    setContactState({ isLoading: true, success: false });

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('Contact form data:', data);
    setContactState({ isLoading: false, success: true });

    // Reset success message after 3 seconds
    setTimeout(() => {
      setContactState({ isLoading: false, success: false });
    }, 3000);
  };

  const handleProfileUpdate = async (data: UserProfileFormData) => {
    setProfileState({ isLoading: true, success: false });

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    console.log('Profile update data:', data);
    setProfileState({ isLoading: false, success: true });

    // Reset success message after 3 seconds
    setTimeout(() => {
      setProfileState({ isLoading: false, success: false });
    }, 3000);
  };

  return (
    <div className="container mx-auto space-y-12 p-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold">Form Examples</h1>
        <p className="text-lg text-slate-600 dark:text-slate-400">
          Comprehensive examples of react-hook-form with Zod validation
        </p>
      </div>

      {/* Login Form */}
      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold">Login Form</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Basic form with email and password validation
          </p>
        </div>
        <div className="flex justify-center">
          <LoginForm
            onSubmit={handleLogin}
            isLoading={loginState.isLoading}
            error={loginState.error}
          />
        </div>
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-800">
          <p className="text-sm font-medium">Try it out:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Email: demo@example.com</li>
            <li>Password: Password123</li>
            <li>Test validation by entering invalid data</li>
          </ul>
        </div>
      </section>

      {/* Registration Form */}
      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold">Registration Form</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Advanced validation with password confirmation and strength
            indicator
          </p>
        </div>
        <div className="flex justify-center">
          <RegisterForm
            onSubmit={handleRegister}
            isLoading={registerState.isLoading}
            error={registerState.error}
          />
        </div>
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-800">
          <p className="text-sm font-medium">Features demonstrated:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Password strength validation with regex</li>
            <li>Password confirmation with custom Zod refine</li>
            <li>Real-time password requirements feedback</li>
            <li>Visual indicators for password criteria</li>
          </ul>
        </div>
      </section>

      {/* Contact Form */}
      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold">Contact Form</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Complex form with select, textarea, and success states
          </p>
        </div>
        <div className="flex justify-center">
          <ContactForm
            onSubmit={handleContact}
            isLoading={contactState.isLoading}
            success={contactState.success}
          />
        </div>
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-800">
          <p className="text-sm font-medium">Features demonstrated:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Select dropdown with Zod enum validation</li>
            <li>Textarea with character limits</li>
            <li>Success state handling</li>
            <li>Form reset after successful submission</li>
            <li>Grid layout for responsive design</li>
          </ul>
        </div>
      </section>

      {/* User Profile Form */}
      <section className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold">User Profile Form</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Form with optional fields, default values, and dirty state tracking
          </p>
        </div>
        <div className="flex justify-center">
          <UserProfileForm
            initialData={{
              name: 'John Doe',
              email: 'john@example.com',
              bio: 'Software developer passionate about building great user experiences.',
              website: 'https://johndoe.com',
              phone: '+1 (555) 123-4567',
            }}
            onSubmit={handleProfileUpdate}
            isLoading={profileState.isLoading}
            success={profileState.success}
          />
        </div>
        <div className="rounded-md bg-slate-100 p-4 dark:bg-slate-800">
          <p className="text-sm font-medium">Features demonstrated:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
            <li>Optional fields with Zod optional() and or()</li>
            <li>Pre-populated form with initial data</li>
            <li>isDirty state tracking for unsaved changes</li>
            <li>Conditional button disabling based on form state</li>
            <li>URL and phone number validation</li>
            <li>Grouped form sections</li>
          </ul>
        </div>
      </section>

      {/* Additional Information */}
      <section className="space-y-4 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
        <h2 className="text-2xl font-bold">Implementation Notes</h2>
        <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400">
          <div>
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Key Concepts
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Zod Schema:</strong> Type-safe validation with automatic
                TypeScript inference
              </li>
              <li>
                <strong>react-hook-form:</strong> Performant forms with minimal
                re-renders
              </li>
              <li>
                <strong>zodResolver:</strong> Bridges Zod schemas with
                react-hook-form
              </li>
              <li>
                <strong>Error Handling:</strong> Field-level and form-level
                error display
              </li>
              <li>
                <strong>Accessibility:</strong> ARIA attributes and semantic
                HTML
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
              Best Practices
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Always use TypeScript for type safety</li>
              <li>Define schemas in separate files for reusability</li>
              <li>Use defaultValues to prevent uncontrolled inputs</li>
              <li>Display loading states during async operations</li>
              <li>Provide clear, actionable error messages</li>
              <li>Include autocomplete attributes for better UX</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
