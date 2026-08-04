/**
 * SECURITY (HIGH-01): X-Forwarded-For is attacker-controlled. Rate limiting
 * keys off the resolved client IP, so if a spoofed header were trusted an
 * attacker could mint a fresh rate-limit bucket per request.
 */

import type { NextRequest } from 'next/server';
import { getClientIp } from '@/server/middleware/client-ip';

function requestWith(headers: Record<string, string>): NextRequest {
  return {
    headers: new Headers(headers),
  } as unknown as NextRequest;
}

describe('getClientIp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('without a trusted proxy allowlist (development)', () => {
    beforeEach(() => {
      // NODE_ENV is typed readonly, so replace the whole env object.
      process.env = {
        ...originalEnv,
        NODE_ENV: 'development',
        TRUSTED_PROXY_IPS: undefined,
      } as NodeJS.ProcessEnv;
    });

    it('ignores a spoofed client IP and uses the connecting peer instead', () => {
      // Attacker claims to be 1.2.3.4; the real connecting hop is 9.9.9.9.
      const ip = getClientIp(
        requestWith({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }),
      );

      expect(ip).toBe('9.9.9.9');
      expect(ip).not.toBe('1.2.3.4');
    });

    it('returns "unknown" when no headers identify the caller', () => {
      expect(getClientIp(requestWith({}))).toBe('unknown');
    });

    it('prefers x-real-ip as the connecting peer when present', () => {
      const ip = getClientIp(
        requestWith({
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '9.9.9.9',
        }),
      );

      expect(ip).toBe('9.9.9.9');
    });
  });

  describe('with a trusted proxy allowlist', () => {
    beforeEach(() => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'production',
        TRUSTED_PROXY_IPS: '10.0.0.1, 10.0.0.2',
      } as NodeJS.ProcessEnv;
    });

    it('trusts the original client IP when the connecting hop is allowlisted', () => {
      const ip = getClientIp(
        requestWith({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }),
      );

      expect(ip).toBe('1.2.3.4');
    });

    it('does NOT trust the claimed client IP when the connecting hop is not allowlisted', () => {
      // 6.6.6.6 is not in TRUSTED_PROXY_IPS, so the chain is untrustworthy.
      const ip = getClientIp(
        requestWith({ 'x-forwarded-for': '1.2.3.4, 6.6.6.6' }),
      );

      expect(ip).toBe('6.6.6.6');
      expect(ip).not.toBe('1.2.3.4');
    });

    it('cannot be tricked by an attacker appending a trusted proxy IP they do not own', () => {
      // The attacker controls the header contents but not which peer actually
      // connects — the last hop is what the platform appends, so a forged
      // trailing entry still resolves to the forged value, never to the
      // attacker's chosen first entry.
      const ip = getClientIp(
        requestWith({ 'x-forwarded-for': 'evil, 10.0.0.99' }),
      );

      expect(ip).toBe('10.0.0.99');
      expect(ip).not.toBe('evil');
    });
  });
});
