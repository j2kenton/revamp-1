/**
 * Content Sanitization Utilities
 * Uses DOMPurify for robust XSS protection (HIGH-02)
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content - strips all HTML for plain text output
 * SECURITY (HIGH-02): Using DOMPurify instead of regex-based sanitization
 * @param dirty - Raw HTML string
 * @returns Sanitized plain text string
 */
export function sanitizeHtml(dirty: string): string {
  // Strip ALL HTML tags for plain text contexts
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

/**
 * Sanitize plain text (strips all HTML)
 * @param dirty - Raw text that may contain HTML
 * @returns Plain text with all HTML removed
 */
export function sanitizePlainText(dirty: string): string {
  return sanitizeHtml(dirty);
}

/**
 * Sanitize user input for chat messages
 * Strips all HTML to prevent XSS in chat contexts
 */
export function sanitizeChatMessage(message: string): string {
  return sanitizeHtml(message);
}

/**
 * Sanitize HTML allowing safe tags for rich content display
 * Use this only when you need to preserve some formatting
 * @param dirty - Raw HTML string
 * @returns Sanitized HTML with safe tags preserved
 */
export function sanitizeRichHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'b',
      'i',
      'em',
      'strong',
      'a',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'blockquote',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    // Force all links to have safe attributes
    ADD_ATTR: ['target', 'rel'],
    // Callback to ensure safe link attributes
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'form',
      'input',
      'object',
      'embed',
    ],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
    ],
  });
}

/**
 * Escape special characters for contexts where HTML entities are needed
 * Note: Prefer DOMPurify sanitization over manual escaping
 */
export function escapeSpecialChars(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize URLs
 * Only allows http, https, and mailto protocols
 * SECURITY: Prevents javascript: URLs and other dangerous protocols
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const allowedProtocols = ['http:', 'https:', 'mailto:'];

    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }

    // Additional check for encoded javascript: URLs
    const decodedHref = decodeURIComponent(parsed.href).toLowerCase();
    if (decodedHref.includes('javascript:') || decodedHref.includes('data:')) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}
