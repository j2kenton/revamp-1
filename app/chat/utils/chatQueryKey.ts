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

/**
 * Key for the signed-in user's conversation list. Shares the `['chat',
 * identity, ...]` prefix with `chatHistoryQueryKey` so the identity-switch
 * purge (`removeQueries({ queryKey: ['chat'] })`) covers it too. No
 * collision with history keys: chat IDs are always `chat_<uuid>`, never the
 * literal `'list'`.
 */
export function chatListQueryKey(
  authIdentityKey: string | null,
): readonly [string, string, string] {
  return ['chat', authIdentityKey ?? 'anon', 'list'] as const;
}
