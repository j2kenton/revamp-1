/**
 * useChatList Hook
 * TanStack Query hook for fetching the signed-in user's conversation list
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import { chatListQueryKey } from '@/app/chat/utils/chatQueryKey';
import type { ChatDTO } from '@/types/models';
import { STRINGS } from '@/lib/constants/strings';
import { FIVE_MINUTES_IN_MS, TEN_MINUTES_IN_MS } from '@/lib/constants/common';

const STALE_TIME_MS = FIVE_MINUTES_IN_MS;
const GC_TIME_MS = TEN_MINUTES_IN_MS;
const MAX_RETRY_ATTEMPTS = 2;

interface ChatListResponse {
  chats: ChatDTO[];
}

/**
 * Fetch the user's chat list from API
 */
async function fetchChatList(
  accessToken: string | null,
): Promise<ChatListResponse> {
  const response = await fetch('/api/chat', {
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || STRINGS.errors.chatListFailed);
  }

  const data = await response.json();
  return data.data;
}

export function useChatList() {
  const { accessToken, authIdentityKey } = useAuth();

  const query = useQuery({
    queryKey: chatListQueryKey(authIdentityKey),
    queryFn: () => fetchChatList(accessToken),
    enabled: Boolean(accessToken),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: true,
    retry: (failureCount) => failureCount < MAX_RETRY_ATTEMPTS,
  });

  return {
    chats: query.data?.chats ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
