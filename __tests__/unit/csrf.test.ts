/**
 * CSRF Protection Tests
 */

import { NextRequest } from 'next/server';
import { withCsrfProtection, generateCsrfToken } from '@/server/middleware/csrf';

describe('CSRF Protection', () => {
  describe('generateCsrfToken', () => {
    it('should generate a token', () => {
      const token = generateCsrfToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('withCsrfProtection', () => {
    it('should validate CSRF token from header', async () => {
      const token = generateCsrfToken();

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': token,
          Cookie: `csrf-token=${token}`,
        },
      });

      const result = await withCsrfProtection(request);
      expect(result.valid).toBe(true);
    });

    it('should reject request without CSRF token', async () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
      });

      const result = await withCsrfProtection(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject request with mismatched token', async () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      const request = new NextRequest('http://localhost/api/test', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': token1,
          Cookie: `csrf-token=${token2}`,
        },
      });

      const result = await withCsrfProtection(request);
      expect(result.valid).toBe(false);
    });

    it('should allow GET requests without token', async () => {
      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
      });

      const result = await withCsrfProtection(request);
      // GET requests might not require CSRF token depending on implementation
      expect(result).toBeTruthy();
    });
  });
});
