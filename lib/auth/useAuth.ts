/**
 * Authentication Hook
 * Thin `useContext` consumer of `AuthProvider` — see `lib/auth/AuthProvider.tsx`
 * for the actual Microsoft/Google merging logic, which is computed once
 * there (not independently per call site) and shared via context.
 */

'use client';

export type { AuthProviderId } from './authProviderMarker';
export { useAuth } from './AuthProvider';
