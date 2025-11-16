/**
 * Chat message reconciliation utilities.
 * Handles duplicate detection and optimistic update replacement.
 */

import type { MessageDTO } from '@/types/models';

interface ReconcileMessagesParams {
  existingMessages: MessageDTO[];
  incomingMessages: MessageDTO[];
  clientRequestId?: string;
  optimisticMessageId?: string;
}

function matchesClientRequest(
  message: MessageDTO,
  clientRequestId?: string,
  optimisticMessageId?: string,
): boolean {
  if (optimisticMessageId && message.id === optimisticMessageId) {
    return true;
  }

  if (!clientRequestId) {
    return false;
  }

  const metadataId = message.metadata?.clientRequestId;

  return typeof metadataId === 'string' && metadataId === clientRequestId;
}

/**
 * Remove duplicate messages while preserving original order when possible.
 */
export function dedupeMessages(messages: MessageDTO[]): MessageDTO[] {
  const seen = new Map<string, MessageDTO>();
  const normalized: MessageDTO[] = [];

  messages.forEach((message) => {
    const existing = seen.get(message.id);

    if (!existing) {
      seen.set(message.id, message);
      normalized.push(message);
      return;
    }

    const existingTimestamp = new Date(existing.updatedAt).getTime();
    const incomingTimestamp = new Date(message.updatedAt).getTime();

    if (incomingTimestamp >= existingTimestamp) {
      seen.set(message.id, message);
      const index = normalized.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        normalized[index] = message;
      }
    }
  });

  return normalized;
}

/**
 * Reconcile optimistic messages with server responses using request IDs.
 */
export function reconcileMessages({
  existingMessages,
  incomingMessages,
  clientRequestId,
  optimisticMessageId,
}: ReconcileMessagesParams): MessageDTO[] {
  const nextMessages = [...existingMessages];

  if (incomingMessages.length > 0) {
    const replacementIndex = nextMessages.findIndex((message) =>
      matchesClientRequest(message, clientRequestId, optimisticMessageId),
    );

    if (replacementIndex >= 0) {
      nextMessages.splice(replacementIndex, 1, incomingMessages[0]);
    } else {
      nextMessages.push(incomingMessages[0]);
    }

    for (let i = 1; i < incomingMessages.length; i += 1) {
      nextMessages.push(incomingMessages[i]);
    }
  }

  return dedupeMessages(nextMessages);
}
