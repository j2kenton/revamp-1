/**
 * Content Sanitization Utilities
 */

import sanitizeHtmlLib, { type Attributes } from 'sanitize-html';

type SanitizeOptions = Parameters<typeof sanitizeHtmlLib>[1];

const SAFE_URL_SCHEMES = ['http', 'https', 'mailto'] as const;
const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:'] as const;

const stripAllHtmlOptions: SanitizeOptions = {
  allowedTags: [],
  allowedAttributes: {},
  allowedSchemes: [...SAFE_URL_SCHEMES],
  allowProtocolRelative: false,
  enforceHtmlBoundary: true,
};

/**
 * Sanitize HTML content - strips all HTML for plain text output
 * @param dirty - Raw HTML string
 * @returns Sanitized plain text string
 */
export function sanitizeHtml(dirty: string): string {
  return sanitizeHtmlLib(dirty, stripAllHtmlOptions);
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
  const richHtmlOptions: SanitizeOptions = {
    allowedTags: [
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
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      code: [],
      pre: [],
    },
    allowedSchemes: [...SAFE_URL_SCHEMES],
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tag: string, attribs: Attributes) => {
        const safeHref = attribs.href ? sanitizeUrl(attribs.href) : null;
        const safeAttribs: Record<string, string> = {
          ...attribs,
          target: '_blank',
          rel: 'noopener noreferrer',
        };

        if (safeHref) {
          safeAttribs.href = safeHref;
        } else {
          delete safeAttribs.href;
        }

        return { tagName: 'a', attribs: safeAttribs };
      },
    },
  };

  return sanitizeHtmlLib(dirty, richHtmlOptions);
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
    if (
      !SAFE_URL_PROTOCOLS.includes(
        parsed.protocol as (typeof SAFE_URL_PROTOCOLS)[number]
      )
    ) {
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
