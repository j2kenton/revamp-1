/**
 * useFetchChatHistory Hook
 * TanStack Query hook for fetching chat history
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import { dedupeMessages } from '@/app/chat/utils/messageReconciler';
import type { MessageDTO, ChatDTO } from '@/types/models';
import { STRINGS } from '@/lib/constants/strings';
import { FIVE_MINUTES_IN_MS, TEN_MINUTES_IN_MS } from '@/lib/constants/common';

const STALE_TIME_MS = FIVE_MINUTES_IN_MS;
const GC_TIME_MS = TEN_MINUTES_IN_MS;
const NOT_FOUND_STATUS_TEXT = '404';
const MAX_RETRY_ATTEMPTS = 2;

interface ChatHistoryResponse {
  chat: ChatDTO;
  messages: MessageDTO[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Fetch chat history from API
 */
async function fetchChatHistory(
  chatId: string,
  accessToken: string | null,
): Promise<ChatHistoryResponse> {
  const response = await fetch(`/api/chat/${chatId}`, {
    headers: {
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || STRINGS.errors.chatHistoryFailed);
  }

  const data = await response.json();
  return data.data;
}

export function useFetchChatHistory(chatId?: string) {
  const { accessToken } = useAuth();

  const query = useQuery({
    queryKey: ['chat', chatId ?? ''],
    queryFn: () => fetchChatHistory(chatId as string, accessToken),
    enabled: Boolean(chatId && accessToken),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (error.message.includes(NOT_FOUND_STATUS_TEXT)) {
        return false; // Don't retry if chat not found
      }
      return failureCount < MAX_RETRY_ATTEMPTS;
    },
  });

  const normalizedMessages = useMemo<MessageDTO[]>(
    () => dedupeMessages(query.data?.messages || []),
    [query.data?.messages],
  );

  return {
    chat: query.data?.chat,
    messages: normalizedMessages,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
