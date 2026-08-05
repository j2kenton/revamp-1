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

  describe('getChat / getChatLookup', () => {
    it('getChatLookup returns found with the hydrated chat when it exists', async () => {
      const chatRecord = baseChatRecord();
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          ...chatRecord,
          createdAt: chatRecord.createdAt.toISOString(),
          updatedAt: chatRecord.updatedAt.toISOString(),
        }),
      );

      const lookup = await chatOps.getChatLookup(chatRecord.id);

      expect(lookup.status).toBe('found');
      if (lookup.status === 'found') {
        expect(lookup.chat.id).toBe(chatRecord.id);
        expect(lookup.chat.createdAt).toBeInstanceOf(Date);
      }
    });

    it('getChatLookup returns not_found when the key is missing', async () => {
      mockRedis.get.mockResolvedValue(null);

      const lookup = await chatOps.getChatLookup('chat-missing');

      expect(lookup).toEqual({ status: 'not_found' });
    });

    it('getChatLookup returns error — never not_found — on a Redis read failure', async () => {
      // A caller trusting `getChat`'s collapsed `null` here can't tell this
      // apart from "genuinely doesn't exist" — the whole reason this
      // tri-state variant exists for the chat-stream route's resume path.
      mockRedis.get.mockRejectedValue(new Error('connection reset'));

      const lookup = await chatOps.getChatLookup('chat-123');

      expect(lookup).toEqual({ status: 'error' });
    });

    it('getChatLookup returns error on a corrupted stored value', async () => {
      mockRedis.get.mockResolvedValue('{not valid json');

      const lookup = await chatOps.getChatLookup('chat-123');

      expect(lookup).toEqual({ status: 'error' });
    });

    it('getChat collapses not_found and error to null, found to the chat', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      expect(await chatOps.getChat('chat-missing')).toBeNull();

      mockRedis.get.mockRejectedValueOnce(new Error('down'));
      expect(await chatOps.getChat('chat-123')).toBeNull();

      const chatRecord = baseChatRecord();
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          ...chatRecord,
          createdAt: chatRecord.createdAt.toISOString(),
          updatedAt: chatRecord.updatedAt.toISOString(),
        }),
      );
      const found = await chatOps.getChat(chatRecord.id);
      expect(found?.id).toBe(chatRecord.id);
    });
  });

  describe('getChatMessages / getChatMessagesLookup', () => {
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

    it('getChatMessagesLookup returns error — never a silent empty list — on a Redis read failure', async () => {
      // The plain `getChatMessages` above intentionally still collapses
      // this to `[]` for callers where that's fine; this tri-state variant
      // exists for callers where conflating "no history" with "couldn't
      // read history" is unacceptable.
      mockRedis.lrange.mockRejectedValue(new Error('connection reset'));

      const lookup = await chatOps.getChatMessagesLookup('chat-123');

      expect(lookup).toEqual({ status: 'error' });
    });

    it('getChatMessagesLookup returns found with an empty list for a chat with no history', async () => {
      mockRedis.lrange.mockResolvedValue([]);

      const lookup = await chatOps.getChatMessagesLookup('chat-123');

      expect(lookup).toEqual({ status: 'found', messages: [] });
    });

    it('getChatMessagesLookup paginates from the head (oldest first)', async () => {
      mockRedis.lrange.mockResolvedValue([]);

      await chatOps.getChatMessagesLookup('chat-123', 0, 50);

      expect(mockRedis.lrange).toHaveBeenCalledWith(
        chatMessagesKey('chat-123'),
        0,
        49,
      );
    });
  });

  describe('getRecentChatMessagesLookup', () => {
    // The chat-stream route needs the *tail* of a chat's history, not page
    // one of it: in any chat exceeding `limit` messages, a head-first read
    // (what `getChatMessagesLookup` does) never reaches the most recently
    // appended message — starving the LLM of recent context, and, for the
    // idempotency resume path specifically, reporting a message that was
    // just persisted as absent purely because it's too new to be on the
    // first page. This is the regression `getChatMessagesLookup` alone
    // doesn't guard against.
    it('reads via LRANGE with negative indices — the tail, not the head', async () => {
      mockRedis.lrange.mockResolvedValue([]);

      await chatOps.getRecentChatMessagesLookup('chat-123', 100);

      expect(mockRedis.lrange).toHaveBeenCalledWith(
        chatMessagesKey('chat-123'),
        -100,
        -1,
      );
    });

    it('returns parsed messages, hydrated the same way as getChatMessagesLookup', async () => {
      const message = baseMessage();
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({
          ...message,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
        }),
      ]);

      const lookup = await chatOps.getRecentChatMessagesLookup(
        message.chatId,
      );

      expect(lookup.status).toBe('found');
      if (lookup.status === 'found') {
        expect(lookup.messages).toHaveLength(1);
        expect(lookup.messages[0].id).toBe(message.id);
        expect(lookup.messages[0].createdAt).toBeInstanceOf(Date);
      }
    });

    it('returns error — never a silent empty list — on a Redis read failure', async () => {
      mockRedis.lrange.mockRejectedValue(new Error('connection reset'));

      const lookup = await chatOps.getRecentChatMessagesLookup('chat-123');

      expect(lookup).toEqual({ status: 'error' });
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
