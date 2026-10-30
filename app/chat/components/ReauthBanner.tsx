/**
 * Reauth Banner
 * Prompts the user to sign in again after a suppressed/rejected token renewal
 */

'use client';

import { STRINGS } from '@/lib/constants/strings';

interface ReauthBannerProps {
  onReauth: () => void;
}

export function ReauthBanner({ onReauth }: ReauthBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <span>{STRINGS.auth.reauthBanner}</span>
      <button
        type="button"
        onClick={onReauth}
        className="inline-flex min-h-11 items-center rounded-md border border-amber-400 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900"
      >
        {STRINGS.auth.reauthAction}
      </button>
    </div>
  );
}
