/**
 * IdentityCacheReset
 * Purges the cached chat query subtree whenever the authenticated identity
 * changes (provider switch, account switch, or sign-out), as a defense in
 * depth alongside the per-identity query key namespacing.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';

export function IdentityCacheReset() {
  const { authIdentityKey } = useAuth();
  const queryClient = useQueryClient();
  const previousIdentityRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const previous = previousIdentityRef.current;
    if (previous !== undefined && previous !== authIdentityKey) {
      queryClient.removeQueries({ queryKey: ['chat'] });
    }
    previousIdentityRef.current = authIdentityKey;
  }, [authIdentityKey, queryClient]);

  return null;
}
