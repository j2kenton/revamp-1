/**
 * Chat Redux Actions
 * Actions for managing chat state
 */

import type { ChatDTO, MessageDTO } from '@/types/models';
import type { OptimisticUpdate } from '@/types/state';

/**
 * Action Types
 */
export enum ChatActionType {
  SET_ACTIVE_CHAT = 'chat/setActiveChat',
  ADD_CHAT = 'chat/addChat',
  UPDATE_CHAT = 'chat/updateChat',
  REMOVE_CHAT = 'chat/removeChat',
  SET_CHATS = 'chat/setChats',
  ADD_MESSAGE = 'chat/addMessage',
  UPDATE_MESSAGE = 'chat/updateMessage',
  SET_MESSAGES = 'chat/setMessages',
  ADD_OPTIMISTIC_UPDATE = 'chat/addOptimisticUpdate',
  UPDATE_OPTIMISTIC_UPDATE = 'chat/updateOptimisticUpdate',
  REMOVE_OPTIMISTIC_UPDATE = 'chat/removeOptimisticUpdate',
  SET_LOADING = 'chat/setLoading',
  SET_ERROR = 'chat/setError',
}

/**
 * Action Creators
 */
export const chatActions = {
  setActiveChat: (chatId: string | null) =>
    ({
      type: ChatActionType.SET_ACTIVE_CHAT,
      payload: chatId,
    }) as const,

  addChat: (chat: ChatDTO) =>
    ({
      type: ChatActionType.ADD_CHAT,
      payload: chat,
    }) as const,

  updateChat: (chatId: string, updates: Partial<ChatDTO>) =>
    ({
      type: ChatActionType.UPDATE_CHAT,
      payload: { chatId, updates },
    }) as const,

  removeChat: (chatId: string) =>
    ({
      type: ChatActionType.REMOVE_CHAT,
      payload: chatId,
    }) as const,

  setChats: (chats: ChatDTO[]) =>
    ({
      type: ChatActionType.SET_CHATS,
      payload: chats,
    }) as const,

  addMessage: (chatId: string, message: MessageDTO) =>
    ({
      type: ChatActionType.ADD_MESSAGE,
      payload: { chatId, message },
    }) as const,

  updateMessage: (
    chatId: string,
    messageId: string,
    updates: Partial<MessageDTO>,
  ) =>
    ({
      type: ChatActionType.UPDATE_MESSAGE,
      payload: { chatId, messageId, updates },
    }) as const,

  setMessages: (chatId: string, messages: MessageDTO[]) =>
    ({
      type: ChatActionType.SET_MESSAGES,
      payload: { chatId, messages },
    }) as const,

  addOptimisticUpdate: (update: OptimisticUpdate) =>
    ({
      type: ChatActionType.ADD_OPTIMISTIC_UPDATE,
      payload: update,
    }) as const,

  updateOptimisticUpdate: (id: string, updates: Partial<OptimisticUpdate>) =>
    ({
      type: ChatActionType.UPDATE_OPTIMISTIC_UPDATE,
      payload: { id, updates },
    }) as const,

  removeOptimisticUpdate: (id: string) =>
    ({
      type: ChatActionType.REMOVE_OPTIMISTIC_UPDATE,
      payload: id,
    }) as const,

  setLoading: (
    key: 'fetchingChats' | 'fetchingMessages' | 'sendingMessage',
    value: boolean,
  ) =>
    ({
      type: ChatActionType.SET_LOADING,
      payload: { key, value },
    }) as const,

  setError: (key: 'chats' | 'messages' | 'send', error: string | null) =>
    ({
      type: ChatActionType.SET_ERROR,
      payload: { key, error },
    }) as const,
};

/**
 * Action types inference
 */
export type ChatAction = ReturnType<
  (typeof chatActions)[keyof typeof chatActions]
>;
