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
    throw new Error(error.error?.message || 'Failed to fetch chat history');
  }

  const data = await response.json();
  return data.data;
}

export function useFetchChatHistory(chatId: string | null) {
  const { accessToken } = useAuth();

  const query = useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => fetchChatHistory(chatId!, accessToken),
    enabled: !!chatId && !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (error.message.includes('404')) {
        return false; // Don't retry if chat not found
      }
      return failureCount < 2;
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
