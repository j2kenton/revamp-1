/**
 * Security Tests for Test Auth Bypass (CRIT-02)
 *
 * These tests verify that authentication bypass mechanisms are properly
 * protected and cannot be exploited in production environments.
 */

import { NextRequest } from 'next/server';
import {
  isTestAuthModeEnabled,
  isTestAuthRequest,
  shouldBypassAuth,
} from '@/server/utils/test-auth';
import {
  TEST_AUTH_COOKIE_NAME,
  TEST_AUTH_COOKIE_VALUE,
  TEST_AUTH_HEADER_NAME,
} from '@/lib/constants/test-auth';

describe('CRIT-02: Auth Bypass Production Protection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  /**
   * Helper to create a mock NextRequest with cookies and headers
   */
  function createMockRequest(options: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  }): NextRequest {
    const url = 'http://localhost:3000/api/test';

    // Build headers including cookies
    const headers: Record<string, string> = {};

    // Add custom headers
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        headers[key] = value;
      });
    }

    // Add cookies as Cookie header - NextRequest parses this
    if (options.cookies) {
      const cookieString = Object.entries(options.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      headers['cookie'] = cookieString;
    }

    // Create request with all headers at construction time
    return new NextRequest(url, { headers });
  }

  describe('shouldBypassAuth - Production Protection', () => {
    it('should NEVER allow bypass when NODE_ENV is production', () => {
      // Set production environment
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      process.env.BYPASS_AUTH = 'true';
      process.env.TEST_AUTH_MODE = 'true';

      // Create request with all bypass mechanisms enabled
      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      // Re-import to get fresh module with production env
      const result = shouldBypassAuth(request);

      expect(result).toBe(false);
    });

    it('should NEVER allow bypass with BYPASS_AUTH=true in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      process.env.BYPASS_AUTH = 'true';

      const request = createMockRequest({});
      const result = shouldBypassAuth(request);

      expect(result).toBe(false);
    });

    it('should NEVER allow bypass with test auth cookie in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
      });

      const result = shouldBypassAuth(request);

      expect(result).toBe(false);
    });

    it('should NEVER allow bypass with test auth header in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      const result = shouldBypassAuth(request);

      expect(result).toBe(false);
    });
  });

  describe('shouldBypassAuth - Development/Test Behavior', () => {
    it('should allow bypass with BYPASS_AUTH=true in development', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      process.env.BYPASS_AUTH = 'true';

      const request = createMockRequest({});
      const result = shouldBypassAuth(request);

      expect(result).toBe(true);
    });

    it('should allow bypass with test auth cookie when TEST_AUTH_MODE is enabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
      });

      const result = shouldBypassAuth(request);

      expect(result).toBe(true);
    });

    it('should allow bypass with test auth header when TEST_AUTH_MODE is enabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      const result = shouldBypassAuth(request);

      expect(result).toBe(true);
    });

    it('should NOT allow bypass without any flags enabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      delete process.env.BYPASS_AUTH;
      delete process.env.TEST_AUTH_MODE;

      const request = createMockRequest({});
      const result = shouldBypassAuth(request);

      expect(result).toBe(false);
    });

    it('should NOT allow bypass with cookie but TEST_AUTH_MODE disabled', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });
      delete process.env.BYPASS_AUTH;
      delete process.env.TEST_AUTH_MODE;

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
      });

      const result = shouldBypassAuth(request);

      expect(result).toBe(false);
    });
  });

  describe('isTestAuthModeEnabled', () => {
    it('should return true when TEST_AUTH_MODE is "true"', () => {
      process.env.TEST_AUTH_MODE = 'true';
      expect(isTestAuthModeEnabled()).toBe(true);
    });

    it('should return false when TEST_AUTH_MODE is not set', () => {
      delete process.env.TEST_AUTH_MODE;
      expect(isTestAuthModeEnabled()).toBe(false);
    });

    it('should return false when TEST_AUTH_MODE is "false"', () => {
      process.env.TEST_AUTH_MODE = 'false';
      expect(isTestAuthModeEnabled()).toBe(false);
    });

    it('should return false when TEST_AUTH_MODE is empty', () => {
      process.env.TEST_AUTH_MODE = '';
      expect(isTestAuthModeEnabled()).toBe(false);
    });
  });

  describe('isTestAuthRequest', () => {
    it('should return false when TEST_AUTH_MODE is disabled', () => {
      delete process.env.TEST_AUTH_MODE;

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      expect(isTestAuthRequest(request)).toBe(false);
    });

    it('should detect test auth cookie when mode is enabled', () => {
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
      });

      expect(isTestAuthRequest(request)).toBe(true);
    });

    it('should NOT accept wrong cookie value', () => {
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: 'wrong-value' },
      });

      expect(isTestAuthRequest(request)).toBe(false);
    });

    it('should detect test auth header when mode is enabled', () => {
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      expect(isTestAuthRequest(request)).toBe(true);
    });

    it('should NOT accept wrong header value', () => {
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        headers: { [TEST_AUTH_HEADER_NAME]: 'false' },
      });

      expect(isTestAuthRequest(request)).toBe(false);
    });

    it('should handle case-insensitive header values', () => {
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        headers: { [TEST_AUTH_HEADER_NAME]: 'TRUE' },
      });

      expect(isTestAuthRequest(request)).toBe(true);
    });
  });

  describe('Attack Vector Testing', () => {
    it('should not be vulnerable to header spoofing in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      // Even if an attacker sets the header
      const request = createMockRequest({
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      expect(shouldBypassAuth(request)).toBe(false);
    });

    it('should not be vulnerable to cookie spoofing in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      // Even if an attacker sets the cookie
      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
      });

      expect(shouldBypassAuth(request)).toBe(false);
    });

    it('should not be vulnerable to environment variable injection in production', () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      // Even if somehow these get set
      process.env.BYPASS_AUTH = 'true';
      process.env.TEST_AUTH_MODE = 'true';

      const request = createMockRequest({
        cookies: { [TEST_AUTH_COOKIE_NAME]: TEST_AUTH_COOKIE_VALUE },
        headers: { [TEST_AUTH_HEADER_NAME]: 'true' },
      });

      expect(shouldBypassAuth(request)).toBe(false);
    });
  });
});
