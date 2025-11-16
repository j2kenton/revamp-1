export const SESSION_PREFIX = 'session:';
export const USER_SESSIONS_PREFIX = 'user:';
export const CHAT_PREFIX = 'chat:';
export const CHAT_MESSAGES_PREFIX = 'chat:messages:';
export const USER_CHATS_PREFIX = 'user:chats:';

export function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

export function userSessionsKey(userId: string): string {
  return `${USER_SESSIONS_PREFIX}${userId}:sessions`;
}

export function chatKey(id: string): string {
  return `${CHAT_PREFIX}${id}`;
}

export function chatMessagesKey(chatId: string): string {
  return `${CHAT_MESSAGES_PREFIX}${chatId}`;
}

export function userChatsKey(userId: string): string {
  return `${USER_CHATS_PREFIX}${userId}`;
}
