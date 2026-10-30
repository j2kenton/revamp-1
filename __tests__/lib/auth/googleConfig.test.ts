import {
  decodeGoogleCredential,
  isExplicitGoogleSelection,
  isGoogleSignInConfigured,
} from '@/lib/auth/googleConfig';

function makeCredential(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('googleConfig', () => {
  describe('isGoogleSignInConfigured', () => {
    it('is true when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set (test default)', () => {
      expect(isGoogleSignInConfigured()).toBe(true);
    });
  });

  describe('isExplicitGoogleSelection', () => {
    it.each([
      'user',
      'user_1tap',
      'user_2tap',
      'btn',
      'btn_confirm',
      'btn_add_session',
      'btn_confirm_add_session',
    ])('treats %s as an explicit gesture', (value) => {
      expect(isExplicitGoogleSelection(value)).toBe(true);
    });

    it('treats "auto" as automatic, not explicit', () => {
      expect(isExplicitGoogleSelection('auto')).toBe(false);
    });

    it('treats unknown/undocumented values as automatic', () => {
      expect(isExplicitGoogleSelection('some_future_value')).toBe(false);
    });

    it('treats undefined as automatic', () => {
      expect(isExplicitGoogleSelection(undefined)).toBe(false);
    });
  });

  describe('decodeGoogleCredential', () => {
    it('decodes a well-formed credential', () => {
      const credential = makeCredential({
        sub: '1234567890',
        email: 'user@gmail.com',
        email_verified: true,
        name: 'Test User',
        exp: 9999999999,
        iat: 1000000000,
      });

      const decoded = decodeGoogleCredential(credential);

      expect(decoded).toEqual({
        sub: '1234567890',
        email: 'user@gmail.com',
        emailVerified: true,
        name: 'Test User',
        picture: undefined,
        exp: 9999999999,
        iat: 1000000000,
      });
    });

    it('falls back to the email local part when name is missing', () => {
      const credential = makeCredential({
        sub: 'sub-1',
        email: 'someone@example.com',
        exp: 9999999999,
      });

      const decoded = decodeGoogleCredential(credential);

      expect(decoded?.name).toBe('someone');
    });

    it('returns null for a malformed token (wrong number of segments)', () => {
      expect(decodeGoogleCredential('not-a-jwt')).toBeNull();
    });

    it('returns null when required claims are missing', () => {
      const credential = makeCredential({ email: 'user@gmail.com' });
      expect(decodeGoogleCredential(credential)).toBeNull();
    });

    it('returns null for unparsable payload JSON', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
        'base64url',
      );
      const badPayload = Buffer.from('not-json').toString('base64url');
      expect(decodeGoogleCredential(`${header}.${badPayload}.sig`)).toBeNull();
    });
  });
});
