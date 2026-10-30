/**
 * Message Deduplication Tests
 */

import { dedupeMessages } from '@/app/chat/utils/dedupeMessages';
import type { MessageDTO } from '@/types/models';

describe('dedupeMessages', () => {
  it('should remove duplicate messages by ID', () => {
    const messages: MessageDTO[] = [
      {
        id: 'msg1',
        chatId: 'chat1',
        role: 'user',
        content: 'Hello',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'msg1',
        chatId: 'chat1',
        role: 'user',
        content: 'Hello Updated',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:01:00Z',
      },
    ];

    const result = dedupeMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Hello Updated');
    expect(result[0].updatedAt).toBe('2025-01-01T00:01:00Z');
  });

  it('should keep older message if timestamps are equal', () => {
    const messages: MessageDTO[] = [
      {
        id: 'msg1',
        chatId: 'chat1',
        role: 'user',
        content: 'First',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'msg1',
        chatId: 'chat1',
        role: 'user',
        content: 'Second',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ];

    const result = dedupeMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Second');
  });

  it('should handle empty array', () => {
    const result = dedupeMessages([]);
    expect(result).toEqual([]);
  });

  it('should handle array with no duplicates', () => {
    const messages: MessageDTO[] = [
      {
        id: 'msg1',
        chatId: 'chat1',
        role: 'user',
        content: 'Hello',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'msg2',
        chatId: 'chat1',
        role: 'assistant',
        content: 'Hi',
        status: 'sent',
        parentMessageId: 'msg1',
        metadata: null,
        createdAt: '2025-01-01T00:01:00Z',
        updatedAt: '2025-01-01T00:01:00Z',
      },
    ];

    const result = dedupeMessages(messages);

    expect(result).toHaveLength(2);
    expect(result).toEqual(messages);
  });
});
