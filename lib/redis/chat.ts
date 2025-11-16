/**
 * Chat Data Layer
 * Redis-based storage for chats and messages
 */

import { getRedisClient } from './client';
import { chatKey, chatMessagesKey, userChatsKey } from './keys';
import type { ChatModel, MessageModel } from '@/types/models';
import { logError } from '@/utils/logger';
import { withTransaction, txSet, txSAdd } from './transactions';

const CHAT_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * Create a new chat
 */
export async function createChat(
  userId: string,
  title: string = 'New Chat'
): Promise<ChatModel> {
  const chatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const chat: ChatModel = {
    id: chatId,
    userId,
    title,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return await withTransaction(async (ctx) => {
    // Save chat
    await txSet(ctx, chatKey(chatId), JSON.stringify(chat), CHAT_TTL);

    // Add to user's chat list
    await txSAdd(ctx, userChatsKey(userId), chatId);

    return chat;
  });
}

/**
 * Get chat by ID
 */
export async function getChat(chatId: string): Promise<ChatModel | null> {
  const redis = getRedisClient();

  try {
    const data = await redis.get(chatKey(chatId));
    if (!data) return null;

    const chat = JSON.parse(data);
    // Hydrate dates
    chat.createdAt = new Date(chat.createdAt);
    chat.updatedAt = new Date(chat.updatedAt);

    return chat as ChatModel;
  } catch (error) {
    logError('Failed to get chat', error, { chatId });
    return null;
  }
}

/**
 * Update chat
 */
export async function updateChat(
  chatId: string,
  updates: Partial<ChatModel>
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const chat = await getChat(chatId);
    if (!chat) return false;

    const updatedChat = {
      ...chat,
      ...updates,
      updatedAt: new Date(),
    };

    await redis.setex(
      chatKey(chatId),
      CHAT_TTL,
      JSON.stringify(updatedChat)
    );

    return true;
  } catch (error) {
    logError('Failed to update chat', error, { chatId });
    return false;
  }
}

/**
 * Delete chat
 */
export async function deleteChat(chatId: string): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const chat = await getChat(chatId);
    if (!chat) return false;

    // Delete chat
    await redis.del(chatKey(chatId));

    // Remove from user's chat list
    await redis.srem(userChatsKey(chat.userId), chatId);

    // Delete all messages
    await redis.del(chatMessagesKey(chatId));

    return true;
  } catch (error) {
    logError('Failed to delete chat', error, { chatId });
    return false;
  }
}

/**
 * Get user's chats
 */
export async function getUserChats(userId: string): Promise<ChatModel[]> {
  const redis = getRedisClient();

  try {
    const chatIds = await redis.smembers(userChatsKey(userId));
    if (chatIds.length === 0) return [];

    const keys = chatIds.map((id) => chatKey(id));
    const results = await redis.mget(keys);

    const chats: ChatModel[] = [];

    results.forEach((raw) => {
      if (!raw) return;
      try {
        const chat = JSON.parse(raw);
        chat.createdAt = new Date(chat.createdAt);
        chat.updatedAt = new Date(chat.updatedAt);
        chats.push(chat);
      } catch {
        // Skip invalid entries
      }
    });

    // Sort by updatedAt descending
    chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return chats;
  } catch (error) {
    logError('Failed to get user chats', error, { userId });
    return [];
  }
}

/**
 * Add message to chat
 */
export async function addMessage(
  chatId: string,
  message: MessageModel
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    // Add message to chat messages list
    await redis.rpush(chatMessagesKey(chatId), JSON.stringify(message));

    // Update chat's updatedAt
    await updateChat(chatId, { updatedAt: new Date() });

    return true;
  } catch (error) {
    logError('Failed to add message', error, { chatId, messageId: message.id });
    return false;
  }
}

/**
 * Get messages for a chat
 */
export async function getChatMessages(
  chatId: string,
  offset: number = 0,
  limit: number = 100
): Promise<MessageModel[]> {
  const redis = getRedisClient();

  try {
    const messages = await redis.lrange(
      chatMessagesKey(chatId),
      offset,
      offset + limit - 1
    );

    return messages.map((raw) => {
      const message = JSON.parse(raw);
      message.createdAt = new Date(message.createdAt);
      message.updatedAt = new Date(message.updatedAt);
      return message as MessageModel;
    });
  } catch (error) {
    logError('Failed to get chat messages', error, { chatId });
    return [];
  }
}

/**
 * Update message status
 */
export async function updateMessageStatus(
  chatId: string,
  messageId: string,
  status: MessageModel['status']
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const messages = await redis.lrange(chatMessagesKey(chatId), 0, -1);

    for (let i = 0; i < messages.length; i++) {
      const message = JSON.parse(messages[i]);
      if (message.id === messageId) {
        message.status = status;
        message.updatedAt = new Date();
        await redis.lset(chatMessagesKey(chatId), i, JSON.stringify(message));
        return true;
      }
    }

    return false;
  } catch (error) {
    logError('Failed to update message status', error, { chatId, messageId });
    return false;
  }
}
