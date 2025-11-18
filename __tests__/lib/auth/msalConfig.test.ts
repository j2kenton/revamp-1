import { msalConfig, loginRequest, silentRequest } from '@/lib/auth/msalConfig';

describe('MSAL configuration', () => {
  it('stores auth state in session storage for security', () => {
    expect(msalConfig.cache?.cacheLocation).toBe('sessionStorage');
    expect(msalConfig.cache?.storeAuthStateInCookie).toBe(false);
  });

  it('defines default scopes for login and silent requests', () => {
    expect(loginRequest.scopes).toEqual(
      expect.arrayContaining([
        'api://test-client/chat.Access',
        'openid',
        'profile',
        'email',
      ]),
    );
    expect(silentRequest.forceRefresh).toBe(false);
  });
});
