export const SESSION_PREFIX = 'session:';
export const USER_SESSIONS_PREFIX = 'user:';

export function sessionKey(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

export function userSessionsKey(userId: string): string {
  return `${USER_SESSIONS_PREFIX}${userId}:sessions`;
}
