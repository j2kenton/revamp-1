/**
 * Chat Input Alerts
 * Send-error and rate-limit-countdown banners shown above the input
 */

'use client';

import { STRINGS } from '@/lib/constants/strings';

interface ChatInputAlertsProps {
  error?: Error | null;
  countdown: number | null;
}

export function ChatInputAlerts({ error, countdown }: ChatInputAlertsProps) {
  const errorMessage = error?.message || STRINGS.errors.sendFailed;

  return (
    <>
      {error ? (
        <div
          className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800"
          role="alert"
          aria-live="assertive"
        >
          {errorMessage}
        </div>
      ) : null}
      {countdown !== null ? (
        <div
          className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          {STRINGS.errors.rateLimitCountdown(countdown)}
        </div>
      ) : null}
    </>
  );
}
