import type { SessionModel } from '@/types/models';

interface RawSession
  extends Omit<SessionModel, 'expiresAt' | 'createdAt' | 'updatedAt' | 'data'> {
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
  data?:
    | (SessionModel['data'] & { lastActivityAt?: string | Date })
    | undefined;
}

/**
 * Convert ISO string fields back to Date instances on session objects.
 */
export function hydrateSession(raw: unknown): SessionModel {
  const s = raw as RawSession;

  return {
    ...s,
    expiresAt: new Date(s.expiresAt),
    createdAt: new Date(s.createdAt),
    updatedAt: new Date(s.updatedAt),
    data: {
      ...(s.data ?? {}),
      lastActivityAt: s.data?.lastActivityAt
        ? new Date(s.data.lastActivityAt)
        : undefined,
    },
  } as SessionModel;
}
