/**
 * Message Reconciliation Tests
 */

import { dedupeMessages, reconcileMessages } from '@/app/chat/utils/messageReconciler';
import type { MessageDTO } from '@/types/models';

describe('Message Reconciliation', () => {
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

  describe('reconcileMessages', () => {
    it('should replace optimistic message with server response', () => {
      const existingMessages: MessageDTO[] = [
        {
          id: 'temp_123',
          chatId: 'chat1',
          role: 'user',
          content: 'Hello',
          status: 'sending',
          parentMessageId: null,
          metadata: { clientRequestId: 'req_123' },
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      const incomingMessages: MessageDTO[] = [
        {
          id: 'msg_456',
          chatId: 'chat1',
          role: 'user',
          content: 'Hello',
          status: 'sent',
          parentMessageId: null,
          metadata: { clientRequestId: 'req_123' },
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:01Z',
        },
      ];

      const result = reconcileMessages({
        existingMessages,
        incomingMessages,
        clientRequestId: 'req_123',
        optimisticMessageId: 'temp_123',
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('msg_456');
      expect(result[0].status).toBe('sent');
    });

    it('should append new messages if no match found', () => {
      const existingMessages: MessageDTO[] = [
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
      ];

      const incomingMessages: MessageDTO[] = [
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

      const result = reconcileMessages({
        existingMessages,
        incomingMessages,
        clientRequestId: 'req_123',
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg1');
      expect(result[1].id).toBe('msg2');
    });

    it('should handle multiple incoming messages', () => {
      const existingMessages: MessageDTO[] = [
        {
          id: 'temp_123',
          chatId: 'chat1',
          role: 'user',
          content: 'Hello',
          status: 'sending',
          parentMessageId: null,
          metadata: { clientRequestId: 'req_123' },
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ];

      const incomingMessages: MessageDTO[] = [
        {
          id: 'msg_456',
          chatId: 'chat1',
          role: 'user',
          content: 'Hello',
          status: 'sent',
          parentMessageId: null,
          metadata: { clientRequestId: 'req_123' },
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:01Z',
        },
        {
          id: 'msg_789',
          chatId: 'chat1',
          role: 'assistant',
          content: 'Hi there!',
          status: 'sent',
          parentMessageId: 'msg_456',
          metadata: null,
          createdAt: '2025-01-01T00:00:02Z',
          updatedAt: '2025-01-01T00:00:02Z',
        },
      ];

      const result = reconcileMessages({
        existingMessages,
        incomingMessages,
        clientRequestId: 'req_123',
        optimisticMessageId: 'temp_123',
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg_456');
      expect(result[1].id).toBe('msg_789');
    });
  });
});
