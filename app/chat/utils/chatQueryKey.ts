/**
 * Namespaced TanStack Query key for chat data, scoped per authenticated
 * identity so switching accounts (Microsoft <-> Google, or between two
 * accounts on the same provider) can never read or write another
 * account's cached messages.
 */

export function chatHistoryQueryKey(
  authIdentityKey: string | null,
  chatId?: string,
): readonly [string, string, string] {
  return ['chat', authIdentityKey ?? 'anon', chatId ?? ''] as const;
}
