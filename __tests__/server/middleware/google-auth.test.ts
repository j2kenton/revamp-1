const mockJwtVerify = jest.fn();
const mockCreateRemoteJWKSet = jest.fn((..._args: unknown[]) => ({}) as unknown);

jest.mock('jose', () => ({
  jwtVerify: (...args: unknown[]) => mockJwtVerify(...args),
  createRemoteJWKSet: (...args: unknown[]) => mockCreateRemoteJWKSet(...args),
}));

import {
  GOOGLE_ISSUERS,
  isGoogleIssuer,
  validateGoogleToken,
} from '@/server/middleware/google-auth';

describe('google-auth middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isGoogleIssuer', () => {
    it('accepts both documented Google issuer forms', () => {
      expect(isGoogleIssuer('https://accounts.google.com')).toBe(true);
      expect(isGoogleIssuer('accounts.google.com')).toBe(true);
    });

    it('rejects a Microsoft-shaped issuer', () => {
      expect(
        isGoogleIssuer('https://login.microsoftonline.com/tenant-id/v2.0'),
      ).toBe(false);
    });

    it('rejects non-string / missing issuers', () => {
      expect(isGoogleIssuer(undefined)).toBe(false);
      expect(isGoogleIssuer(123)).toBe(false);
      expect(isGoogleIssuer(null)).toBe(false);
    });
  });

  describe('validateGoogleToken', () => {
    const basePayload = {
      sub: 'sub-123',
      email: 'user@gmail.com',
      email_verified: true,
      name: 'Test User',
      iss: 'https://accounts.google.com',
      aud: 'test-google-client-id',
      exp: 9999999999,
      iat: 1000000000,
    };

    it('returns the payload for a valid token and verifies with RS256/audience/issuer', async () => {
      mockJwtVerify.mockResolvedValue({ payload: basePayload });

      const result = await validateGoogleToken('a.b.c');

      expect(result).toEqual(basePayload);
      expect(mockJwtVerify).toHaveBeenCalledWith(
        'a.b.c',
        expect.anything(),
        expect.objectContaining({
          issuer: [...GOOGLE_ISSUERS],
          audience: 'test-google-client-id',
          algorithms: ['RS256'],
        }),
      );
    });

    it('returns null when signature verification fails', async () => {
      mockJwtVerify.mockRejectedValue(new Error('signature verification failed'));
      expect(await validateGoogleToken('bad-token')).toBeNull();
    });

    it('returns null when the token is expired (jose throws)', async () => {
      mockJwtVerify.mockRejectedValue(new Error('"exp" claim timestamp check failed'));
      expect(await validateGoogleToken('expired-token')).toBeNull();
    });

    it('returns null when the issuer does not match (jose throws)', async () => {
      mockJwtVerify.mockRejectedValue(new Error('unexpected "iss" claim value'));
      expect(await validateGoogleToken('wrong-issuer-token')).toBeNull();
    });

    it('returns null when the audience does not match (jose throws)', async () => {
      mockJwtVerify.mockRejectedValue(new Error('unexpected "aud" claim value'));
      expect(await validateGoogleToken('wrong-audience-token')).toBeNull();
    });

    it('returns null when the algorithm is not allowed (jose throws)', async () => {
      mockJwtVerify.mockRejectedValue(new Error('"alg" not allowed'));
      expect(await validateGoogleToken('wrong-alg-token')).toBeNull();
    });

    it('returns null when sub is missing', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { ...basePayload, sub: undefined },
      });
      expect(await validateGoogleToken('token')).toBeNull();
    });

    it('returns null when email is missing', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { ...basePayload, email: undefined },
      });
      expect(await validateGoogleToken('token')).toBeNull();
    });

    it('returns null when email is not verified', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: { ...basePayload, email_verified: false },
      });
      expect(await validateGoogleToken('token')).toBeNull();
    });
  });
});
