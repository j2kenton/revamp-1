/**
 * ChatSignInPrompt
 * Auth gate shown before chat access
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { STRINGS } from '@/lib/constants/strings';
import type { AuthProviderId } from '@/lib/auth/authProviderMarker';

interface ChatSignInPromptProps {
  onLogin: (provider: AuthProviderId) => void;
  isLoading: boolean;
  isResolving?: boolean;
  errorMessage?: string | null;
  onDismissError?: () => void;
}

export function ChatSignInPrompt({
  onLogin,
  isLoading,
  isResolving = false,
  errorMessage,
  onDismissError,
}: ChatSignInPromptProps) {
  const [googleLoadError, setGoogleLoadError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const disabled = isLoading || isResolving;
  // A GIS script-load failure must show its own user-facing copy, not the
  // internal `Error.message` that flows through `errorMessage` (which is
  // `useAuth().error?.message`, and `useAuth().error` already surfaces
  // `googleAuth.error` on a load failure) — mirrors the precedence used by
  // LandingSignInButton.
  const displayedError = googleLoadError
    ? STRINGS.errors.googleScriptLoadFailed
    : (errorMessage ?? null);

  const handleRetryGoogle = () => {
    setGoogleLoadError(null);
    setRetryToken((n) => n + 1);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-2xl font-bold text-gray-900">
          {STRINGS.chat.authPrompt.title}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {STRINGS.chat.authPrompt.description}
        </p>

        {isResolving && (
          <p className="mt-4 text-sm text-gray-500">
            {STRINGS.auth.resolvingSession}
          </p>
        )}

        {displayedError && (
          <div
            className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            <p>{displayedError}</p>
            {googleLoadError && (
              <button
                type="button"
                onClick={handleRetryGoogle}
                className="mt-2 inline-flex min-h-11 items-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                {STRINGS.actions.retry}
              </button>
            )}
            {!googleLoadError && errorMessage && onDismissError && (
              // A Google credential rejection (e.g. an unverified email) has
              // no self-clearing trigger of its own — without a dismiss
              // affordance the alert would stay stuck until an unrelated
              // successful login happened to overwrite it.
              <button
                type="button"
                onClick={onDismissError}
                className="mt-2 inline-flex min-h-11 items-center rounded-md border border-red-300 px-3 text-sm font-medium text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                {STRINGS.actions.dismiss}
              </button>
            )}
          </div>
        )}

        {/* Google is rendered first/above — the primary, more prominent option. */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <div
            aria-label={STRINGS.landing.primaryCta}
            className={
              isLoading ? 'w-full pointer-events-none opacity-60' : 'w-full'
            }
          >
            {isResolving ? (
              // No GIS init and no interactive login surface until the auth
              // state machine resolves (rule 0) — see LandingSignInButton
              // for the matching guard and rationale.
              <div
                aria-hidden="true"
                data-testid="google-signin-placeholder"
                className="h-10 w-80 max-w-full animate-pulse rounded-md bg-gray-200"
              />
            ) : (
              <GoogleSignInButton key={retryToken} onError={setGoogleLoadError} />
            )}
          </div>

          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {STRINGS.landing.orDivider}
          </span>

          <Button
            onClick={() => onLogin('microsoft')}
            disabled={disabled}
            variant="outline"
            size="lg"
            className="w-full min-h-11"
          >
            {isLoading ? STRINGS.auth.signingIn : STRINGS.auth.signInButton}
          </Button>
        </div>
      </div>
    </div>
  );
}
