/**
 * useSendMessage Hook
 * TanStack Query mutation for sending chat messages with optimistic updates
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import type { MessageDTO } from '@/types/models';

interface SendMessageInput {
  content: string;
  chatId?: string;
  parentMessageId?: string;
}

interface SendMessageResponse {
  userMessage: MessageDTO;
  aiMessage: MessageDTO;
  chatId: string;
}

/**
 * Generate idempotency key for request
 */
function generateIdempotencyKey(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Send message to chat API
 */
async function sendMessageToAPI(
  input: SendMessageInput,
  accessToken: string | null
): Promise<SendMessageResponse> {
  const idempotencyKey = generateIdempotencyKey();

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      ...input,
      idempotencyKey,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Failed to send message');
  }

  const data = await response.json();
  return data.data;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();

  const mutation = useMutation({
    mutationFn: (input: SendMessageInput) =>
      sendMessageToAPI(input, accessToken),

    // Optimistic update
    onMutate: async (variables) => {
      const { chatId, content } = variables;

      if (!chatId) {
        // New chat - can't do optimistic update yet
        return;
      }

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['chat', chatId] });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<{
        messages: MessageDTO[];
      }>(['chat', chatId]);

      // Create optimistic message
      const optimisticMessage: MessageDTO = {
        id: `temp_${Date.now()}`,
        chatId,
        role: 'user',
        content,
        status: 'sending',
        parentMessageId: null,
        metadata: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Optimistically update cache
      queryClient.setQueryData(['chat', chatId], (old: any) => ({
        ...old,
        messages: [...(old?.messages || []), optimisticMessage],
      }));

      return { previousData, optimisticMessage };
    },

    // On success, replace optimistic message with server response
    onSuccess: (data, variables, context) => {
      const { chatId } = data;

      queryClient.setQueryData(['chat', chatId], (old: any) => {
        const messages = old?.messages || [];

        // Remove optimistic message if it exists
        const filtered = context?.optimisticMessage
          ? messages.filter((m: MessageDTO) => m.id !== context.optimisticMessage.id)
          : messages;

        // Add server messages
        return {
          ...old,
          messages: [...filtered, data.userMessage, data.aiMessage],
        };
      });

      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },

    // On error, rollback optimistic update
    onError: (error, variables, context) => {
      if (context?.previousData && variables.chatId) {
        queryClient.setQueryData(['chat', variables.chatId], context.previousData);
      }
    },

    // Retry configuration
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors (client errors)
      if (error.message.includes('401') || error.message.includes('400')) {
        return false;
      }
      // Retry up to 3 times for other errors
      return failureCount < 3;
    },

    retryDelay: (attemptIndex) => {
      // Exponential backoff: 1s, 2s, 4s
      return Math.min(1000 * Math.pow(2, attemptIndex), 4000);
    },
  });

  return {
    sendMessage: mutation.mutateAsync,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
