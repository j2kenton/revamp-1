/**
 * useSendMessage Hook
 * TanStack Query mutation for sending chat messages with optimistic updates
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/useAuth';
import { reconcileMessages } from '@/app/chat/utils/messageReconciler';
import type { MessageDTO } from '@/types/models';

export interface SendMessageInput {
  content: string;
  chatId?: string;
  parentMessageId?: string;
}

export interface SendMessageResponse {
  userMessage: MessageDTO;
  aiMessage: MessageDTO;
  chatId: string;
  clientRequestId?: string;
}

interface InternalSendMessageInput extends SendMessageInput {
  clientRequestId: string;
  idempotencyKey: string;
}

interface MutationContext {
  previousData?: { messages: MessageDTO[] };
  optimisticMessage?: MessageDTO;
}

export class RateLimitError extends Error {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
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
  input: InternalSendMessageInput,
  accessToken: string | null,
): Promise<SendMessageResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessToken ? `Bearer ${accessToken}` : '',
      'X-Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify({
      content: input.content,
      chatId: input.chatId,
      parentMessageId: input.parentMessageId,
      idempotencyKey: input.idempotencyKey,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const errorMessage =
      errorBody.error?.message || 'Failed to send message';

    if (response.status === 429) {
      const retryHeader = response.headers.get('Retry-After');
      const retryAfter =
        typeof errorBody.error?.details?.retryAfter === 'number'
          ? errorBody.error.details.retryAfter
          : retryHeader
            ? parseInt(retryHeader, 10)
            : 0;

      throw new RateLimitError(errorMessage, Math.max(retryAfter, 1));
    }

    throw new Error(errorMessage);
  }

  const data = await response.json();
  return {
    ...data.data,
    clientRequestId: input.clientRequestId,
  };
}

export function useSendMessage(_chatId?: string | null) {
  const queryClient = useQueryClient();
  const { accessToken } = useAuth();

  const mutation = useMutation<
    SendMessageResponse,
    Error,
    InternalSendMessageInput,
    MutationContext
  >({
    mutationFn: (input) => sendMessageToAPI(input, accessToken),

    // Optimistic update
    onMutate: async (variables) => {
      const { chatId, content } = variables;

      if (!chatId) {
        return {};
      }

      await queryClient.cancelQueries({ queryKey: ['chat', chatId] });

      const previousData = queryClient.getQueryData<{
        messages: MessageDTO[];
      }>(['chat', chatId]);

      const optimisticMessage: MessageDTO = {
        id: `temp_${Date.now()}`,
        chatId,
        role: 'user',
        content,
        status: 'sending',
        parentMessageId: null,
        metadata: {
          clientRequestId: variables.clientRequestId,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData(
        ['chat', chatId],
        (old: { messages?: MessageDTO[] }) => ({
          ...old,
          messages: [...(old?.messages || []), optimisticMessage],
        }),
      );

      return { previousData, optimisticMessage };
    },

    // On success, replace optimistic message with server response
    onSuccess: (data, variables, context) => {
      const { chatId } = data;

      queryClient.setQueryData(
        ['chat', chatId],
        (old: { messages?: MessageDTO[] }) => {
          const messages = old?.messages || [];
          const reconciled = reconcileMessages({
            existingMessages: messages,
            incomingMessages: [data.userMessage, data.aiMessage],
            clientRequestId:
              variables.clientRequestId ?? data.clientRequestId,
            optimisticMessageId: context?.optimisticMessage?.id,
          });

          return {
            ...old,
            messages: reconciled,
          };
        },
      );

      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
    },

    // On error, rollback optimistic update
    onError: (_error, variables, context) => {
      if (context?.previousData && variables.chatId) {
        queryClient.setQueryData(['chat', variables.chatId], context.previousData);
      }
    },

    retry: (failureCount, error) => {
      if (
        error instanceof RateLimitError ||
        error.message.includes('401') ||
        error.message.includes('400')
      ) {
        return false;
      }

      return failureCount < 3;
    },

    retryDelay: (attemptIndex) => Math.min(1000 * Math.pow(2, attemptIndex), 4000),
  });

  const sendMessage = (input: SendMessageInput) => {
    const idempotencyKey = generateIdempotencyKey();
    return mutation.mutateAsync({
      ...input,
      clientRequestId: idempotencyKey,
      idempotencyKey,
    });
  };

  return {
    sendMessage,
    isLoading: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
