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
 * Keep the newest copy of each message ID (by `updatedAt`), preserving each
 * survivor's original position for use as a stable sort tiebreak.
 */
function buildDedupedMessages(messages: MessageDTO[]): {
  normalized: MessageDTO[];
  orderIndices: Map<string, number>;
} {
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
      if (index >= 0) {
        normalized[index] = message;
      }
    }
  });

  return { normalized, orderIndices };
}

/**
 * Stable chronological comparator: `createdAt`, then `updatedAt`, then
 * original insertion order as the final tiebreak.
 */
function compareByRecency(
  a: MessageDTO,
  b: MessageDTO,
  orderIndices: Map<string, number>,
): number {
  const createdDiff =
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (createdDiff !== 0) {
    return createdDiff;
  }

  const updatedDiff =
    new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  const orderA = orderIndices.get(a.id) ?? 0;
  const orderB = orderIndices.get(b.id) ?? 0;
  return orderA - orderB;
}

/**
 * Remove duplicate messages while preserving original order when possible.
 */
export function dedupeMessages(messages: MessageDTO[]): MessageDTO[] {
  const { normalized, orderIndices } = buildDedupedMessages(messages);
  return normalized.sort((a, b) => compareByRecency(a, b, orderIndices));
}

/**
 * Replace the message matching this client request/optimistic ID with
 * `incomingMessage`, or append it if no match is found.
 */
function replaceOptimisticMessage(
  messages: MessageDTO[],
  incomingMessage: MessageDTO,
  clientRequestId?: string,
  optimisticMessageId?: string,
): MessageDTO[] {
  const replacementIndex = messages.findIndex((message) =>
    matchesClientRequest(message, clientRequestId, optimisticMessageId),
  );

  if (replacementIndex >= 0) {
    const next = [...messages];
    next.splice(replacementIndex, 1, incomingMessage);
    return next;
  }

  return [...messages, incomingMessage];
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
  if (incomingMessages.length === 0) {
    return dedupeMessages(existingMessages);
  }

  const [firstIncoming, ...restIncoming] = incomingMessages;
  const withFirstReplaced = replaceOptimisticMessage(
    existingMessages,
    firstIncoming,
    clientRequestId,
    optimisticMessageId,
  );

  return dedupeMessages([...withFirstReplaced, ...restIncoming]);
}
