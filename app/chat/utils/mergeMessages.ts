/**
 * Merge live (in-flight) messages with persisted chat history by ID,
 * ordered chronologically.
 */

import type { MessageDTO } from '@/types/models';

export function mergeMessages(
  liveMessages: MessageDTO[] | undefined,
  persistedMessages: MessageDTO[],
): MessageDTO[] {
  if (!liveMessages?.length) {
    return persistedMessages;
  }

  const merged = [...persistedMessages];
  const indexMap = new Map<string, number>();

  merged.forEach((message, index) => {
    indexMap.set(message.id, index);
  });

  liveMessages.forEach((message) => {
    const existingIndex = indexMap.get(message.id);
    if (typeof existingIndex === 'number') {
      merged[existingIndex] = message;
    } else {
      indexMap.set(message.id, merged.length);
      merged.push(message);
    }
  });

  return merged.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}
