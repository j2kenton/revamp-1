/**
 * ChatSignInPrompt
 * Auth gate shown before chat access
 */

'use client';

import { Button } from '@/components/ui/button';
import { STRINGS } from '@/lib/constants/strings';

interface ChatSignInPromptProps {
  onLogin: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
}

export function ChatSignInPrompt({
  onLogin,
  isLoading,
  errorMessage,
}: ChatSignInPromptProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900">
          {STRINGS.chat.authPrompt.title}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {STRINGS.chat.authPrompt.description}
        </p>
        {errorMessage && (
          <p
            className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        <Button
          onClick={onLogin}
          disabled={isLoading}
          className="mt-6 w-full"
        >
          {isLoading ? STRINGS.auth.signingIn : STRINGS.auth.signInButton}
        </Button>
      </div>
    </div>
  );
}
