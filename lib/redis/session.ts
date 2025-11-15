/**
 * Session Management Utilities
 * Server-side session storage using Redis
 */

import { randomBytes } from 'crypto';
import type { SessionModel, SessionData } from '@/types/models';
import { getRedisClient } from '@/lib/redis/client';
import { logError } from '@/utils/logger';
import { sessionKey, userSessionsKey } from '@/lib/redis/keys';
import { hydrateSession } from '@/lib/session/hydrator';

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create a new session
 */
export async function createSession(
  userId: string,
  data: Partial<SessionData> = {},
): Promise<SessionModel> {
  const redis = getRedisClient();
  const sessionId = generateSessionId();
  const csrfToken = generateCsrfToken();

  const session: SessionModel = {
    id: sessionId,
    userId,
    csrfToken,
    data: {
      lastActivityAt: new Date(),
      ...data,
    },
    expiresAt: new Date(Date.now() + SESSION_TTL * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await redis.setex(
      sessionKey(sessionId),
      SESSION_TTL,
      JSON.stringify(session),
    );
    await redis.sadd(userSessionsKey(userId), sessionId);
    return session;
  } catch (error) {
    logError('Failed to create session', error, { userId, sessionId });
    throw error;
  }
}

/**
 * Get session by ID
 */
export async function getSession(
  sessionId: string,
): Promise<SessionModel | null> {
  const redis = getRedisClient();

  try {
    const data = await redis.get(sessionKey(sessionId));
    if (!data) return null;

    // Reuse hydrator
    return hydrateSession(JSON.parse(data));
  } catch (error) {
    logError('Failed to get session', error, { sessionId });
    return null;
  }
}

/**
 * Update session data
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<SessionModel>,
): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const session = await getSession(sessionId);
    if (!session) return false;

    const updatedSession: SessionModel = {
      ...session,
      ...updates,
      updatedAt: new Date(),
    };

    await redis.setex(
      sessionKey(sessionId),
      SESSION_TTL,
      JSON.stringify(updatedSession),
    );

    return true;
  } catch (error) {
    logError('Failed to update session', error, { sessionId });
    return false;
  }
}

/**
 * Refresh session TTL
 */
export async function refreshSession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const session = await getSession(sessionId);
    if (!session) return false;

    session.data.lastActivityAt = new Date();
    session.expiresAt = new Date(Date.now() + SESSION_TTL * 1000);
    session.updatedAt = new Date();

    await redis.setex(
      sessionKey(sessionId),
      SESSION_TTL,
      JSON.stringify(session),
    );
    return true;
  } catch (error) {
    logError('Failed to refresh session', error, { sessionId });
    return false;
  }
}

/**
 * Delete session
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();

  try {
    const session = await getSession(sessionId);
    const result = await redis.del(sessionKey(sessionId));
    if (session?.userId) {
      await redis.srem(userSessionsKey(session.userId), sessionId);
    }
    return result > 0;
  } catch (error) {
    logError('Failed to delete session', error, { sessionId });
    return false;
  }
}

/**
 * Rotate session ID (for privilege escalation)
 */
export async function rotateSession(
  oldSessionId: string,
): Promise<SessionModel | null> {
  try {
    const oldSession = await getSession(oldSessionId);

    if (!oldSession) {
      return null;
    }

    // Create new session with new ID and CSRF token
    const newSession = await createSession(oldSession.userId, oldSession.data);

    // Delete old session
    await deleteSession(oldSessionId);

    return newSession;
  } catch (error) {
    logError('Failed to rotate session', error, { oldSessionId });
    return null;
  }
}

/**
 * Validate CSRF token
 */
export async function validateCsrfToken(
  sessionId: string,
  token: string,
): Promise<boolean> {
  try {
    const session = await getSession(sessionId);

    if (!session) {
      return false;
    }

    return session.csrfToken === token;
  } catch (error) {
    logError('Failed to validate CSRF token', error, { sessionId });
    return false;
  }
}

/**
 * Get all sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionModel[]> {
  const redis = getRedisClient();

  try {
    const sessionIds: string[] = await redis.smembers(userSessionsKey(userId));
    if (sessionIds.length === 0) return [];

    const keys = sessionIds.map((id) => sessionKey(id));
    const results = await redis.mget(keys);

    const sessions: SessionModel[] = [];
    const missingIds: string[] = [];

    results.forEach((raw, idx) => {
      const id = sessionIds[idx];
      if (!raw) {
        missingIds.push(id);
        return;
      }
      try {
        sessions.push(hydrateSession(JSON.parse(raw)));
      } catch {
        missingIds.push(id);
      }
    });

    if (missingIds.length > 0) {
      try {
        await redis.srem(userSessionsKey(userId), ...missingIds);
      } catch (cleanupErr) {
        logError(
          'Failed to cleanup stale session IDs from user set',
          cleanupErr,
          {
            userId,
            missingCount: missingIds.length,
          },
        );
      }
    }

    return sessions;
  } catch (error) {
    logError('Failed to get user sessions', error, { userId });
    return [];
  }
}

/**
 * Delete all sessions for a user
 */
export async function deleteUserSessions(userId: string): Promise<number> {
  const redis = getRedisClient();

  try {
    const sessionIds: string[] = await redis.smembers(userSessionsKey(userId));
    if (sessionIds.length === 0) {
      return 0;
    }

    const keys = sessionIds.map((id) => sessionKey(id));

    const multi = (
      redis as unknown as {
        multi: () => {
          del: (...args: unknown[]) => unknown;
          srem: (...args: unknown[]) => unknown;
          exec: () => Promise<unknown[]>;
        };
      }
    ).multi();

    multi.del(...(keys as unknown as [string, ...string[]]));
    multi.srem(
      userSessionsKey(userId),
      ...(sessionIds as [string, ...string[]]),
    );

    await multi.exec();

    return sessionIds.length;
  } catch (error) {
    logError('Failed to delete user sessions', error, { userId });
    // Fallback: attempt slower path as best-effort
    try {
      const sessions = await getUserSessions(userId);
      let deleted = 0;
      for (const s of sessions) {
        const ok = await deleteSession(s.id);
        if (ok) deleted++;
      }
      return deleted;
    } catch (fallbackErr) {
      logError('Fallback deleteUserSessions failed', fallbackErr, { userId });
      return 0;
    }
  }
}
