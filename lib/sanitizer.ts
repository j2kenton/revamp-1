/**
 * Content Sanitization Utilities
 * Plain-text focused sanitization to prevent XSS in server and client contexts
 */

const TAG_REGEX = /<[^>]*>/g;

/**
 * Sanitize HTML content
 * @param dirty - Raw HTML string
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(dirty: string): string {
  // Strip any HTML tags then escape remaining special characters.
  const withoutTags = dirty.replace(TAG_REGEX, '');
  return escapeSpecialChars(withoutTags);
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
 * Allows basic formatting but prevents XSS
 */
export function sanitizeChatMessage(message: string): string {
  return sanitizeHtml(message);
}

/**
 * Escape special characters for SQL/JSON contexts
 * Note: This is a basic implementation. Use parameterized queries for SQL.
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
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const allowedProtocols = ['http:', 'https:', 'mailto:'];

    if (!allowedProtocols.includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}
