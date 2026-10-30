/**
 * Relative time formatting
 * Shared wrapper so components don't each pick their own formatting idiom —
 * matches the `formatDistanceToNow` style already used by ChatMessage.
 */

import { formatDistanceToNow } from 'date-fns';

export function formatRelativeTime(isoTimestamp: string): string {
  return formatDistanceToNow(new Date(isoTimestamp), { addSuffix: true });
}
