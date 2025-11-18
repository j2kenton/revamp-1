import * as chatOps from '@/lib/redis/chat';
import { getRedisClient } from '@/lib/redis/client';
import { chatMessagesKey } from '@/lib/redis/keys';
import type { MessageModel, ChatModel } from '@/types/models';

jest.mock('@/lib/redis/client', () => ({
  getRedisClient: jest.fn(),
}));

function createRedisMock(): Record<string, jest.Mock> {
  return {
    rpush: jest.fn(),
    lrange: jest.fn(),
    lset: jest.fn(),
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    srem: jest.fn(),
    smembers: jest.fn(),
    mget: jest.fn(),
  };
}

const mockRedis = createRedisMock();

(getRedisClient as jest.Mock).mockReturnValue(mockRedis);

const baseMessage = (): MessageModel => ({
  id: 'msg-1',
  chatId: 'chat-123',
  role: 'user',
  content: 'Hello',
  status: 'sent',
  parentMessageId: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const baseChatRecord = (): ChatModel => ({
  id: 'chat-123',
  userId: 'user-1',
  title: 'Test chat',
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('Redis Chat Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  describe('addMessage', () => {
    it('stores message and updates chat metadata', async () => {
      const message = baseMessage();
      const chatRecord = baseChatRecord();

      mockRedis.rpush.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(JSON.stringify(chatRecord));
      mockRedis.setex.mockResolvedValue('OK');

      const result = await chatOps.addMessage(message.chatId, message);

      expect(result).toBe(true);
      expect(mockRedis.rpush).toHaveBeenCalledWith(
        chatMessagesKey(message.chatId),
        JSON.stringify(message),
      );
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('getChatMessages', () => {
    it('returns parsed messages', async () => {
      const message = baseMessage();
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({
          ...message,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
        }),
      ]);

      const messages = await chatOps.getChatMessages(message.chatId);

      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(message.id);
      expect(messages[0].createdAt).toBeInstanceOf(Date);
    });

    it('returns empty array when Redis fails', async () => {
      mockRedis.lrange.mockRejectedValue(new Error('Redis error'));

      const messages = await chatOps.getChatMessages('chat-missing');

      expect(messages).toEqual([]);
    });
  });

  describe('updateMessageStatus', () => {
    it('updates the status of a stored message', async () => {
      const message = baseMessage();
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({
          ...message,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
        }),
      ]);
      mockRedis.lset.mockResolvedValue('OK');

      const updated = await chatOps.updateMessageStatus(
        message.chatId,
        message.id,
        'read',
      );

      expect(updated).toBe(true);
      expect(mockRedis.lset).toHaveBeenCalledWith(
        chatMessagesKey(message.chatId),
        0,
        expect.stringContaining('"status":"read"'),
      );
    });

    it('returns false when message is missing', async () => {
      mockRedis.lrange.mockResolvedValue([]);

      const updated = await chatOps.updateMessageStatus('chat-123', 'missing', 'read');

      expect(updated).toBe(false);
      expect(mockRedis.lset).not.toHaveBeenCalled();
    });
  });
});
