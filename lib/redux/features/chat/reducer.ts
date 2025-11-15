/**
 * Chat Redux Reducer
 * Manages chat state
 */

import { ChatActionType, type ChatAction } from './actions';
import type { ChatState } from '@/types/state';

/**
 * Initial state
 */
const initialState: ChatState = {
  chats: {},
  messages: {},
  activeChatId: null,
  optimisticUpdates: {},
  loading: {
    fetchingChats: false,
    fetchingMessages: false,
    sendingMessage: false,
  },
  error: {
    chats: null,
    messages: null,
    send: null,
  },
};

/**
 * Chat reducer
 */
export function chatReducer(
  state: ChatState = initialState,
  action: ChatAction,
): ChatState {
  switch (action.type) {
    case ChatActionType.SET_ACTIVE_CHAT:
      return {
        ...state,
        activeChatId: action.payload,
      };

    case ChatActionType.ADD_CHAT:
      return {
        ...state,
        chats: {
          ...state.chats,
          [action.payload.id]: action.payload,
        },
      };

    case ChatActionType.UPDATE_CHAT: {
      const { chatId, updates } = action.payload;
      const existingChat = state.chats[chatId];
      if (!existingChat) return state;

      return {
        ...state,
        chats: {
          ...state.chats,
          [chatId]: {
            ...existingChat,
            ...updates,
          },
        },
      };
    }

    case ChatActionType.REMOVE_CHAT: {
      const { [action.payload]: _removed, ...remainingChats } = state.chats;
      const { [action.payload]: _removedMessages, ...remainingMessages } =
        state.messages;

      return {
        ...state,
        chats: remainingChats,
        messages: remainingMessages,
        activeChatId:
          state.activeChatId === action.payload ? null : state.activeChatId,
      };
    }

    case ChatActionType.SET_CHATS: {
      const chats = action.payload.reduce(
        (acc, chat) => {
          acc[chat.id] = chat;
          return acc;
        },
        {} as Record<string, (typeof action.payload)[0]>,
      );

      return {
        ...state,
        chats,
      };
    }

    case ChatActionType.ADD_MESSAGE: {
      const { chatId, message } = action.payload;
      const existingMessages = state.messages[chatId] || [];

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatId]: [...existingMessages, message],
        },
      };
    }

    case ChatActionType.UPDATE_MESSAGE: {
      const { chatId, messageId, updates } = action.payload;
      const existingMessages = state.messages[chatId];
      if (!existingMessages) return state;

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatId]: existingMessages.map((msg) =>
            msg.id === messageId ? { ...msg, ...updates } : msg,
          ),
        },
      };
    }

    case ChatActionType.SET_MESSAGES: {
      const { chatId, messages } = action.payload;

      return {
        ...state,
        messages: {
          ...state.messages,
          [chatId]: messages,
        },
      };
    }

    case ChatActionType.ADD_OPTIMISTIC_UPDATE:
      return {
        ...state,
        optimisticUpdates: {
          ...state.optimisticUpdates,
          [action.payload.id]: action.payload,
        },
      };

    case ChatActionType.UPDATE_OPTIMISTIC_UPDATE: {
      const { id, updates } = action.payload;
      const existing = state.optimisticUpdates[id];
      if (!existing) return state;

      return {
        ...state,
        optimisticUpdates: {
          ...state.optimisticUpdates,
          [id]: { ...existing, ...updates },
        },
      };
    }

    case ChatActionType.REMOVE_OPTIMISTIC_UPDATE: {
      const { [action.payload]: _removed, ...rest } = state.optimisticUpdates;

      return {
        ...state,
        optimisticUpdates: rest,
      };
    }

    case ChatActionType.SET_LOADING: {
      const { key, value } = action.payload;

      return {
        ...state,
        loading: {
          ...state.loading,
          [key]: value,
        },
      };
    }

    case ChatActionType.SET_ERROR: {
      const { key, error } = action.payload;

      return {
        ...state,
        error: {
          ...state.error,
          [key]: error,
        },
      };
    }

    default:
      return state;
  }
}
