/**
 * Chat message reconciliation utilities.
 * Handles duplicate detection and optimistic update replacement.
 */

import type { MessageDTO } from '@/types/models';

const TIMESTAMP_DIFF_THRESHOLD = 0;
const ARRAY_START_INDEX = 0;
const FIRST_INCOMING_MESSAGE_INDEX = 0;
const SECOND_MESSAGE_INDEX = 1;
const LOOP_INCREMENT = 1;
const DEFAULT_ORDER_INDEX = 0;

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
  const orderIndices = new Map<string, number>();

  messages.forEach((message) => {
    const existing = seen.get(message.id);

    if (!existing) {
      seen.set(message.id, message);
      const position = normalized.length;
      normalized.push(message);
      orderIndices.set(message.id, position);
      return;
    }

    const existingTimestamp = new Date(existing.updatedAt).getTime();
    const incomingTimestamp = new Date(message.updatedAt).getTime();

    if (incomingTimestamp >= existingTimestamp) {
      seen.set(message.id, message);
      const index = normalized.findIndex((item) => item.id === message.id);
      if (index >= ARRAY_START_INDEX) {
        normalized[index] = message;
      }
    }
  });

  return normalized.sort((a, b) => {
    const createdDiff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdDiff !== TIMESTAMP_DIFF_THRESHOLD) {
      return createdDiff;
    }

    const updatedDiff =
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    if (updatedDiff !== TIMESTAMP_DIFF_THRESHOLD) {
      return updatedDiff;
    }

    const orderA = orderIndices.get(a.id) ?? DEFAULT_ORDER_INDEX;
    const orderB = orderIndices.get(b.id) ?? DEFAULT_ORDER_INDEX;
    return orderA - orderB;
  });
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

  if (incomingMessages.length > ARRAY_START_INDEX) {
    const replacementIndex = nextMessages.findIndex((message) =>
      matchesClientRequest(message, clientRequestId, optimisticMessageId),
    );

    if (replacementIndex >= ARRAY_START_INDEX) {
      nextMessages.splice(replacementIndex, SECOND_MESSAGE_INDEX, incomingMessages[FIRST_INCOMING_MESSAGE_INDEX]);
    } else {
      nextMessages.push(incomingMessages[FIRST_INCOMING_MESSAGE_INDEX]);
    }

    for (let i = SECOND_MESSAGE_INDEX; i < incomingMessages.length; i += LOOP_INCREMENT) {
      nextMessages.push(incomingMessages[i]);
    }
  }

  return dedupeMessages(nextMessages);
}
