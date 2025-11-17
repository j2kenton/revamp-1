/**
 * TanStack Query Provider
 * Configures React Query for data fetching and caching
 */

'use client';

// 1. React/Next
import { useState, type ReactNode } from 'react';

// 2. Third-party
import {
  QueryClient,
  QueryClientProvider,
  type QueryClientConfig,
} from '@tanstack/react-query';

/**
 * Query client configuration
 */
const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 3,
      retryDelay: (attemptIndex: number) =>
        Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
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
