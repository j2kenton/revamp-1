/**
 * Redux State Types
 * Type definitions for application state
 */

import type { AuthState } from '@/lib/redux/features/auth/types';
import type { CounterState } from '@/lib/redux/features/counter/types';
import type { ChatDTO, MessageDTO } from '@/types/models';

/**
 * Optimistic update for chat messages
 */
export interface OptimisticUpdate {
  id: string;
  tempId: string;
  message: MessageDTO;
  status: 'pending' | 'success' | 'error';
  error?: string;
  retryCount?: number;
}

/**
 * Chat state
 */
export interface ChatState {
  /**
   * All chats indexed by ID
   */
  chats: Record<string, ChatDTO>;

  /**
   * Messages indexed by chat ID
   */
  messages: Record<string, MessageDTO[]>;

  /**
   * Current active chat ID
   */
  activeChatId: string | null;

  /**
   * Optimistic updates for pending messages
   */
  optimisticUpdates: Record<string, OptimisticUpdate>;

  /**
   * Loading states
   */
  loading: {
    fetchingChats: boolean;
    fetchingMessages: boolean;
    sendingMessage: boolean;
  };

  /**
   * Error states
   */
  error: {
    chats: string | null;
    messages: string | null;
    send: string | null;
  };
}

/**
 * User session state
 */
export interface SessionState {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    title: string | null;
  } | null;
  csrfToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * UI state
 */
export interface UIState {
  /**
   * Sidebar collapsed state
   */
  sidebarCollapsed: boolean;

  /**
   * Theme preference
   */
  theme: 'light' | 'dark' | 'system';

  /**
   * Toast notifications
   */
  toasts: Toast[];

  /**
   * Modal state
   */
  modal: {
    isOpen: boolean;
    type: string | null;
    data: unknown;
  };
}

/**
 * Toast notification
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

/**
 * Root state
 */
export interface RootState {
  counter: CounterState;
  auth: AuthState;
  chat: ChatState;
}
