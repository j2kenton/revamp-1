/**
 * TanStack Query Hooks
 * Custom hooks for data fetching and mutations
 */

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatDTO, MessageDTO, UserDTO } from '@/types/models';
import { post, get } from '@/lib/http/client';

/**
 * Query keys
 */
export const queryKeys = {
  user: ['user'],
  chats: ['chats'],
  chat: (id: string) => ['chat', id],
  messages: (chatId: string) => ['messages', chatId],
} as const;

/**
 * Hook: Get current user session
 */
export function useUserSession() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: async () => {
      const response = await get<UserDTO>('/api/user/session');
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook: Get all chats
 */
export function useChatHistory() {
  return useQuery({
    queryKey: queryKeys.chats,
    queryFn: async () => {
      const response = await get<ChatDTO[]>('/api/chat');
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
  });
}

/**
 * Hook: Get chat with messages
 */
export function useChat(chatId: string) {
  return useQuery({
    queryKey: queryKeys.chat(chatId),
    queryFn: async () => {
      const response = await get<ChatDTO>(`/api/chat/${chatId}`);
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    enabled: !!chatId,
  });
}

/**
 * Hook: Get messages for a chat
 */
export function useChatMessages(chatId: string) {
  return useQuery({
    queryKey: queryKeys.messages(chatId),
    queryFn: async () => {
      const response = await get<MessageDTO[]>(`/api/chat/${chatId}/messages`);
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    enabled: !!chatId,
  });
}

/**
 * Hook: Send chat message with optimistic updates
 */
export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const response = await post<MessageDTO>(`/api/chat/${chatId}/messages`, {
        content,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data;
    },
    onMutate: async (content: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.messages(chatId) });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData<MessageDTO[]>(
        queryKeys.messages(chatId),
      );

      // Optimistically update to the new value
      const tempId = `temp-${Date.now()}`;
      const optimisticMessage: MessageDTO = {
        id: tempId,
        chatId,
        role: 'user',
        content,
        status: 'sending',
        parentMessageId: null,
        metadata: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<MessageDTO[]>(
        queryKeys.messages(chatId),
        (old) => [...(old || []), optimisticMessage],
      );

      return { previousMessages, tempId };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(
          queryKeys.messages(chatId),
          context.previousMessages,
        );
      }
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(chatId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });
}

/**
 * Hook: Create new chat
 */
export function useCreateChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title?: string) => {
      const response = await post<ChatDTO>('/api/chat', { title });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });
}

/**
 * Hook: Delete chat
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => {
      const response = await post<void>(`/api/chat/${chatId}/delete`, {});

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });
}

/**
 * Hook: Archive chat
 */
export function useArchiveChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chatId,
      archived,
    }: {
      chatId: string;
      archived: boolean;
    }) => {
      const response = await post<ChatDTO>(`/api/chat/${chatId}`, {
        archived,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    },
  });
}
