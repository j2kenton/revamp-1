/**
 * Chat Page Error Boundary
 */

'use client';

import { useEffect } from 'react';
import { ChatErrorFallback } from '@/app/chat/components/ChatErrorBoundary';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Chat error:', error);
  }, [error]);

  return <ChatErrorFallback error={error} onRetry={reset} />;
}
