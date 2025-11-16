/**
 * Sanitizer Tests
 */

import {
  sanitizeHtml,
  sanitizePlainText,
  sanitizeChatMessage,
  escapeSpecialChars,
  sanitizeUrl,
} from '@/lib/sanitizer';

describe('Sanitizer', () => {
  describe('sanitizeHtml', () => {
    it('should strip all HTML by default', () => {
      const dirty = '<script>alert("XSS")</script>Hello';
      const clean = sanitizeHtml(dirty);
      expect(clean).toBe('Hello');
      expect(clean).not.toContain('<script>');
    });

    it('should remove dangerous tags', () => {
      const dirty = '<img src=x onerror=alert(1)>Hello';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<img');
      expect(clean).not.toContain('onerror');
    });

    it('should handle empty string', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should handle plain text', () => {
      const text = 'Hello, world!';
      expect(sanitizeHtml(text)).toBe(text);
    });
  });

  describe('sanitizePlainText', () => {
    it('should strip all HTML tags', () => {
      const dirty = '<b>Bold</b> and <i>italic</i>';
      const clean = sanitizePlainText(dirty);
      expect(clean).toBe('Bold and italic');
    });

    it('should remove script tags', () => {
      const dirty = 'Hello <script>alert("XSS")</script> World';
      const clean = sanitizePlainText(dirty);
      expect(clean).toBe('Hello  World');
    });
  });

  describe('sanitizeChatMessage', () => {
    it('should sanitize chat messages', () => {
      const message = 'Hello <script>alert("XSS")</script>';
      const clean = sanitizeChatMessage(message);
      expect(clean).not.toContain('<script>');
    });

    it('should preserve plain text content', () => {
      const message = 'Hello, how are you?';
      const clean = sanitizeChatMessage(message);
      expect(clean).toBe(message);
    });
  });

  describe('escapeSpecialChars', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const output = escapeSpecialChars(input);
      expect(output).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape ampersands', () => {
      expect(escapeSpecialChars('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      expect(escapeSpecialChars(`He said "hello"`)).toContain('&quot;');
      expect(escapeSpecialChars(`It's nice`)).toContain('&#x27;');
    });

    it('should handle empty string', () => {
      expect(escapeSpecialChars('')).toBe('');
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow http URLs', () => {
      const url = 'http://example.com';
      expect(sanitizeUrl(url)).toBe(url + '/');
    });

    it('should allow https URLs', () => {
      const url = 'https://example.com';
      expect(sanitizeUrl(url)).toBe(url + '/');
    });

    it('should allow mailto URLs', () => {
      const url = 'mailto:test@example.com';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should reject javascript URLs', () => {
      const url = 'javascript:alert("XSS")';
      expect(sanitizeUrl(url)).toBeNull();
    });

    it('should reject data URLs', () => {
      const url = 'data:text/html,<script>alert("XSS")</script>';
      expect(sanitizeUrl(url)).toBeNull();
    });

    it('should reject file URLs', () => {
      const url = 'file:///etc/passwd';
      expect(sanitizeUrl(url)).toBeNull();
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeUrl('not a url')).toBeNull();
    });

    it('should handle empty string', () => {
      expect(sanitizeUrl('')).toBeNull();
    });
  });
});
