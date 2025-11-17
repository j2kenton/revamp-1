/**
 * Message List Loading State
 * Displays skeleton loaders while messages are loading
 */

'use client';

import { MessageSkeleton } from './MessageSkeleton';
import { LOADING_SKELETON_COUNT } from '@/lib/constants/ui';

export function MessageListLoadingState() {
  return (
    <div className="space-y-4 p-6">
      {Array.from({ length: LOADING_SKELETON_COUNT }, (_, i) => (
        <MessageSkeleton key={i} />
      ))}
    </div>
  );
}
