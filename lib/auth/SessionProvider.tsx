'use client';

// 1. React/Next
import { type ReactNode } from 'react';

// 2. Third-party
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
