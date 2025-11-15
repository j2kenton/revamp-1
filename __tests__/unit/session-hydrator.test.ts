import { hydrateSession } from '@/lib/session/hydrator';

describe('hydrateSession', () => {
  it('converts ISO strings to Date instances', () => {
    const timestamp = new Date().toISOString();

    const hydrated = hydrateSession({
      id: 'session-id',
      userId: 'user-1',
      csrfToken: 'token',
      data: {
        lastActivityAt: timestamp,
        userAgent: 'jest',
      },
      expiresAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(hydrated.expiresAt).toBeInstanceOf(Date);
    expect(hydrated.createdAt).toBeInstanceOf(Date);
    expect(hydrated.updatedAt).toBeInstanceOf(Date);
    expect(hydrated.data.lastActivityAt).toBeInstanceOf(Date);
  });
});
