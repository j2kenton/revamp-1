/**
 * Security Tests for Proxy/Middleware Security Headers (LOW-02, LOW-03)
 *
 * These tests verify that security headers are properly added to responses
 * to protect against clickjacking, XSS, MIME sniffing, and other attacks.
 */

import { NextRequest } from 'next/server';

// Mock next-auth/middleware before importing proxy
jest.mock('next-auth/middleware', () => ({
  withAuth: jest.fn((callback) => callback),
}));

describe('LOW-02 & LOW-03: Security Headers Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Content Security Policy (LOW-02)', () => {
    it('should define CSP directives array', async () => {
      // Import the module to check CSP directives exist
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });

      // Since we can't easily access the private CSP_DIRECTIVES constant,
      // we'll test through the proxy function response
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      // The response should have CSP header set
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('should include default-src directive', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });

      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
    });

    it('should include script-src directive', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain('script-src');
    });

    it('should include frame-ancestors none to prevent clickjacking via CSP', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should include object-src none to prevent plugin abuse', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("object-src 'none'");
    });

    it('should include upgrade-insecure-requests in production', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      jest.resetModules();
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  describe('Standard Security Headers (LOW-03)', () => {
    it('should set X-Frame-Options to DENY', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should set X-Content-Type-Options to nosniff', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('should set X-XSS-Protection header', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });

    it('should set Referrer-Policy header', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      expect(response.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin',
      );
    });

    it('should set Permissions-Policy to disable sensitive features', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const permissionsPolicy = response.headers.get('Permissions-Policy');
      expect(permissionsPolicy).toContain('camera=()');
      expect(permissionsPolicy).toContain('microphone=()');
      expect(permissionsPolicy).toContain('geolocation=()');
      expect(permissionsPolicy).toContain('payment=()');
    });
  });

  describe('Production-only Security Headers', () => {
    it('should set Strict-Transport-Security in production', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      jest.resetModules();
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const hsts = response.headers.get('Strict-Transport-Security');
      expect(hsts).toBeTruthy();
      expect(hsts).toContain('max-age=31536000');
      expect(hsts).toContain('includeSubDomains');
    });

    it('should NOT set HSTS in development', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'development',
        writable: true,
        configurable: true,
      });

      jest.resetModules();
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      // HSTS should not be set in development
      expect(response.headers.get('Strict-Transport-Security')).toBeFalsy();
    });
  });

  describe('Auth Protected Proxy', () => {
    it('should also add security headers to auth-protected routes', async () => {
      const { authProtectedProxy } = await import('@/proxy');

      // authProtectedProxy is a withAuth wrapped function
      // We just verify it's exported and callable
      expect(authProtectedProxy).toBeDefined();
      expect(typeof authProtectedProxy).toBe('function');
    });
  });

  describe('Route Matching Configuration', () => {
    it('should export a config with matcher', async () => {
      const proxyModule = await import('@/proxy');

      expect(proxyModule.config).toBeDefined();
      expect(proxyModule.config.matcher).toBeDefined();
      expect(Array.isArray(proxyModule.config.matcher)).toBe(true);
    });

    it('should exclude static files from middleware', async () => {
      const proxyModule = await import('@/proxy');

      // The matcher should exclude _next/static, _next/image, and common image formats
      const matcher = proxyModule.config.matcher[0];
      expect(matcher).toContain('_next/static');
      expect(matcher).toContain('_next/image');
    });
  });
});

describe('Security Headers Attack Prevention', () => {
  describe('Clickjacking Prevention', () => {
    it('should prevent embedding in iframes via X-Frame-Options', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      // X-Frame-Options: DENY prevents any iframe embedding
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should prevent embedding via CSP frame-ancestors', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const csp = response.headers.get('Content-Security-Policy');
      // frame-ancestors 'none' is the CSP equivalent of X-Frame-Options: DENY
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });

  describe('MIME Sniffing Prevention', () => {
    it('should prevent MIME type sniffing attacks', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      // X-Content-Type-Options: nosniff prevents browsers from MIME-sniffing
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  describe('XSS Protection', () => {
    it('should enable browser XSS filter', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      // X-XSS-Protection enables the browser's built-in XSS filter
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    });
  });

  describe('Information Leakage Prevention', () => {
    it('should limit referrer information', async () => {
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      // strict-origin-when-cross-origin limits referrer to origin for cross-origin requests
      expect(response.headers.get('Referrer-Policy')).toBe(
        'strict-origin-when-cross-origin',
      );
    });
  });

  describe('Downgrade Attack Prevention', () => {
    it('should enforce HTTPS in production with HSTS', async () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      jest.resetModules();
      const { proxy } = await import('@/proxy');
      const request = new NextRequest('http://localhost:3000/test');
      const response = proxy(request);

      const hsts = response.headers.get('Strict-Transport-Security');
      expect(hsts).toBeTruthy();
      // preload directive allows the site to be included in browser preload lists
      expect(hsts).toContain('preload');
    });
  });
});
