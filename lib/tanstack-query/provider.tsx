/**
 * TanStack Query Provider
 * Configures React Query for data fetching and caching
 */

'use client';

import { useState, type ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';
import {
  FIVE_MINUTES_IN_MS,
  TEN_MINUTES_IN_MS,
  ONE_SECOND_IN_MS,
} from '@/lib/constants/common';

const DEFAULT_STALE_TIME_MS = FIVE_MINUTES_IN_MS;
const DEFAULT_CACHE_TIME_MS = TEN_MINUTES_IN_MS;
const RETRY_BACKOFF_BASE_MS = ONE_SECOND_IN_MS;
const RETRY_BACKOFF_EXPONENT = 2;
const MAX_RETRY_DELAY_MS = 30 * ONE_SECOND_IN_MS;

/**
 * Query client configuration
 */
const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME_MS,
      gcTime: DEFAULT_CACHE_TIME_MS,
      retry: 3,
      retryDelay: (attemptIndex: number) =>
        Math.min(
          RETRY_BACKOFF_BASE_MS * RETRY_BACKOFF_EXPONENT ** attemptIndex,
          MAX_RETRY_DELAY_MS,
        ),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: ONE_SECOND_IN_MS,
    },
  },
};

/**
 * TanStack Query Provider Component
 */
export function TanStackQueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
