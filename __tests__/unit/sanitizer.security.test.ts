/**
 * Security Tests for Sanitizer Module (HIGH-02)
 *
 * These tests verify that the sanitizer properly prevents XSS attacks
 * after the migration from regex-based sanitization to sanitize-html library.
 */

import {
  sanitizeHtml,
  sanitizePlainText,
  sanitizeChatMessage,
  sanitizeRichHtml,
  sanitizeUrl,
} from '@/lib/sanitizer';

describe('HIGH-02: XSS Sanitization Security Tests', () => {
  describe('sanitizeHtml - XSS Attack Vectors', () => {
    it('should block script tags', () => {
      const dirty = '<script>alert("XSS")</script>Hello';
      const clean = sanitizeHtml(dirty);
      expect(clean).toBe('Hello');
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
    });

    it('should block event handlers (onerror)', () => {
      const dirty = '<img src=x onerror=alert(1)>Hello';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('<img');
    });

    it('should block event handlers (onload)', () => {
      const dirty = '<svg onload=alert(1)>test</svg>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onload');
      expect(clean).not.toContain('<svg');
    });

    it('should block event handlers (onclick)', () => {
      const dirty = '<div onclick="alert(1)">click me</div>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onclick');
    });

    it('should block event handlers (onmouseover)', () => {
      const dirty = '<a onmouseover="alert(1)">hover</a>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onmouseover');
    });

    it('should handle encoded HTML entities that could decode to scripts', () => {
      // These would be dangerous if decoded after sanitization
      const dirty = '&lt;script&gt;alert(1)&lt;/script&gt;';
      const clean = sanitizeHtml(dirty);
      // Should not contain actual script tags after any decoding
      expect(clean).not.toMatch(/<script>/i);
    });

    it('should block SVG-based XSS vectors', () => {
      const vectors = [
        '<svg><script>alert(1)</script></svg>',
        '<svg onload="alert(1)"></svg>',
        '<svg><animate onbegin="alert(1)"></animate></svg>',
      ];

      vectors.forEach((dirty) => {
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('<script>');
        expect(clean).not.toContain('onload');
        expect(clean).not.toContain('onbegin');
        expect(clean).not.toContain('alert');
      });
    });

    it('should block malformed/nested HTML XSS attempts', () => {
      const vectors = [
        '<SCRIPT>alert(1)</SCRIPT>',
        '<ScRiPt>alert(1)</ScRiPt>',
      ];

      vectors.forEach((dirty) => {
        const clean = sanitizeHtml(dirty);
        expect(clean.toLowerCase()).not.toContain('<script');
        // Script content should be removed entirely
        expect(clean).toBe('');
      });
    });

    it('should handle nested script tags safely', () => {
      // These are edge cases - the important thing is no executable JS remains
      const dirty1 = '<scr<script>ipt>alert(1)</script>';
      const clean1 = sanitizeHtml(dirty1);
      // Should not contain actual script tags
      expect(clean1.toLowerCase()).not.toMatch(/<script[^>]*>/);

      const dirty2 = '<<script>script>alert(1)<</script>/script>';
      const clean2 = sanitizeHtml(dirty2);
      expect(clean2.toLowerCase()).not.toMatch(/<script[^>]*>/);
    });

    it('should block iframe injection', () => {
      const dirty = '<iframe src="javascript:alert(1)"></iframe>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<iframe');
      expect(clean).not.toContain('javascript:');
    });

    it('should block object/embed tags', () => {
      const vectors = [
        '<object data="javascript:alert(1)"></object>',
        '<embed src="javascript:alert(1)">',
      ];

      vectors.forEach((dirty) => {
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('<object');
        expect(clean).not.toContain('<embed');
      });
    });

    it('should block style-based XSS', () => {
      const vectors = [
        '<div style="background:url(javascript:alert(1))">test</div>',
        '<style>body{background:url(javascript:alert(1))}</style>',
      ];

      vectors.forEach((dirty) => {
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('javascript:');
      });
    });

    it('should block data: URLs in attributes', () => {
      const dirty =
        '<a href="data:text/html,<script>alert(1)</script>">click</a>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('data:');
    });

    it('should block base tag injection', () => {
      const dirty = '<base href="https://evil.com/">';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<base');
    });

    it('should block form action hijacking', () => {
      const dirty = '<form action="https://evil.com/steal"><input></form>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<form');
      expect(clean).not.toContain('evil.com');
    });
  });

  describe('sanitizeChatMessage - Chat-specific sanitization', () => {
    it('should preserve normal chat text', () => {
      const message = 'Hello, how are you today?';
      expect(sanitizeChatMessage(message)).toBe(message);
    });

    it('should strip all HTML from chat messages', () => {
      const message = '<b>Bold</b> and <script>alert(1)</script> text';
      const clean = sanitizeChatMessage(message);
      expect(clean).not.toContain('<b>');
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Bold');
      expect(clean).toContain('text');
    });

    it('should handle special characters in chat', () => {
      const message = 'User said: "Hello" & \'goodbye\'';
      const clean = sanitizeChatMessage(message);
      // Should preserve readable text
      expect(clean).toContain('User said');
    });
  });

  describe('sanitizeRichHtml - Selective tag allowance', () => {
    it('should allow safe formatting tags', () => {
      const dirty = '<p><strong>Bold</strong> and <em>italic</em></p>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).toContain('<p>');
      expect(clean).toContain('<strong>');
      expect(clean).toContain('<em>');
    });

    it('should allow code blocks', () => {
      const dirty = '<pre><code>const x = 1;</code></pre>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).toContain('<pre>');
      expect(clean).toContain('<code>');
    });

    it('should allow lists', () => {
      const dirty = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).toContain('<ul>');
      expect(clean).toContain('<li>');
    });

    it('should still block script tags in rich HTML', () => {
      const dirty = '<p>Hello</p><script>alert(1)</script>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).not.toContain('<script>');
    });

    it('should still block event handlers in rich HTML', () => {
      const dirty = '<p onclick="alert(1)">Click me</p>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).not.toContain('onclick');
    });

    it('should transform links with safe attributes', () => {
      const dirty = '<a href="https://example.com">Link</a>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).toContain('href="https://example.com/"');
      expect(clean).toContain('target="_blank"');
      expect(clean).toContain('rel="noopener noreferrer"');
    });

    it('should remove unsafe link protocols', () => {
      const dirty = '<a href="javascript:alert(1)">Evil Link</a>';
      const clean = sanitizeRichHtml(dirty);
      expect(clean).not.toContain('javascript:');
    });
  });

  describe('sanitizeUrl - URL validation', () => {
    it('should allow http URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    });

    it('should allow https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('should allow mailto URLs', () => {
      expect(sanitizeUrl('mailto:test@example.com')).toBe(
        'mailto:test@example.com',
      );
    });

    it('should reject javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('should reject javascript: URLs with encoding', () => {
      // URL-encoded javascript
      expect(sanitizeUrl('javascript%3Aalert(1)')).toBeNull();
    });

    it('should reject data: URLs', () => {
      expect(
        sanitizeUrl('data:text/html,<script>alert(1)</script>'),
      ).toBeNull();
    });

    it('should reject data: URLs with encoding', () => {
      expect(
        sanitizeUrl('data%3Atext/html,<script>alert(1)</script>'),
      ).toBeNull();
    });

    it('should reject file: URLs', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
    });

    it('should reject vbscript: URLs', () => {
      expect(sanitizeUrl('vbscript:msgbox(1)')).toBeNull();
    });

    it('should reject invalid URLs', () => {
      expect(sanitizeUrl('not-a-valid-url')).toBeNull();
      expect(sanitizeUrl('')).toBeNull();
    });

    it('should handle URLs with query strings', () => {
      expect(sanitizeUrl('https://example.com/path?query=1')).toBe(
        'https://example.com/path?query=1',
      );
    });

    it('should handle URLs with fragments', () => {
      expect(sanitizeUrl('https://example.com/path#section')).toBe(
        'https://example.com/path#section',
      );
    });

    it('should handle complex URLs', () => {
      const url = 'https://user:pass@example.com:8080/path?q=1#hash';
      const result = sanitizeUrl(url);
      expect(result).not.toBeNull();
      expect(result).toContain('example.com');
    });
  });

  describe('sanitizePlainText - Text extraction', () => {
    it('should extract plain text from HTML', () => {
      const dirty = '<p>Hello <b>world</b>!</p>';
      expect(sanitizePlainText(dirty)).toBe('Hello world!');
    });

    it('should remove all tags including dangerous ones', () => {
      const dirty = '<script>evil()</script><p>Safe text</p>';
      const clean = sanitizePlainText(dirty);
      expect(clean).not.toContain('<');
      expect(clean).not.toContain('>');
      expect(clean).toContain('Safe text');
    });
  });
});
