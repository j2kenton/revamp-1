/**
 * Logging Utilities
 * Centralized logging with different log levels
 * SECURITY (HIGH-05): Includes sensitive data masking
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

interface LogContext {
  [key: string]: unknown;
}

/**
 * SECURITY (HIGH-05): Keys that should be masked in logs
 * These patterns are case-insensitive
 */
const SENSITIVE_KEY_PATTERNS = [
  'token',
  'password',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'bearer',
  'credential',
  'private',
  'session',
  'cookie',
];

/**
 * Keys that should be partially masked (show first/last few chars)
 */
const PARTIAL_MASK_KEYS = ['email', 'ip', 'ipaddress', 'ip_address'];

/**
 * Mask a value completely
 */
function maskValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '[REDACTED]';
  }
  const strValue = String(value);
  if (strValue.length === 0) {
    return '[EMPTY]';
  }
  return '[REDACTED]';
}

/**
 * Partially mask a value (for emails, IPs, etc.)
 */
function partialMask(value: unknown): string {
  if (value === null || value === undefined) {
    return '[REDACTED]';
  }
  const strValue = String(value);
  if (strValue.length <= 4) {
    return '[REDACTED]';
  }

  // For emails, mask the local part
  if (strValue.includes('@')) {
    const [local, domain] = strValue.split('@');
    if (local && domain) {
      const maskedLocal =
        local.length > 2 ? local[0] + '***' + local[local.length - 1] : '***';
      return `${maskedLocal}@${domain}`;
    }
  }

  // For other values, show first 2 and last 2 characters
  return strValue.slice(0, 2) + '***' + strValue.slice(-2);
}

/**
 * Check if a key should be completely masked
 */
function shouldMaskCompletely(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));
}

/**
 * Check if a key should be partially masked
 */
function shouldMaskPartially(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return PARTIAL_MASK_KEYS.some((pattern) => lowerKey.includes(pattern));
}

/**
 * SECURITY (HIGH-05): Recursively mask sensitive data in objects
 */
function maskSensitiveData(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  const MAX_DEPTH = 10;
  if (depth > MAX_DEPTH) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveData(item, depth + 1));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (shouldMaskCompletely(key)) {
      masked[key] = maskValue(value);
    } else if (shouldMaskPartially(key)) {
      masked[key] = partialMask(value);
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value, depth + 1);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
}

const defaultConfig: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableRemote: process.env.NODE_ENV === 'production',
};

/**
 * Format log message with timestamp and context
 * SECURITY (HIGH-05): Applies sensitive data masking before logging
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  // Apply sensitive data masking to context
  const maskedContext = context ? maskSensitiveData(context) : undefined;
  const contextStr = maskedContext ? ` ${JSON.stringify(maskedContext)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

/**
 * Determine if a log level should be logged based on current config
 */
function shouldLog(level: LogLevel, config: LoggerConfig): boolean {
  const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  const currentLevelIndex = levels.indexOf(config.level);
  const messageLevelIndex = levels.indexOf(level);
  return messageLevelIndex <= currentLevelIndex;
}

/**
 * Log error message
 */
export function logError(
  message: string,
  error?: Error | unknown,
  context?: LogContext,
): void {
  if (!shouldLog(LogLevel.ERROR, defaultConfig)) return;

  const errorContext = {
    ...context,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
  };

  const formatted = formatMessage(LogLevel.ERROR, message, errorContext);

  if (defaultConfig.enableConsole) {
    console.error(formatted);
  }

  // TODO: Send to remote logging service (e.g., Sentry)
  if (defaultConfig.enableRemote) {
    // sendToRemoteLogger(formatted, errorContext);
  }
}

/**
 * Log warning message
 */
export function logWarn(message: string, context?: LogContext): void {
  if (!shouldLog(LogLevel.WARN, defaultConfig)) return;

  const formatted = formatMessage(LogLevel.WARN, message, context);

  if (defaultConfig.enableConsole) {
    console.warn(formatted);
  }
}

/**
 * Log info message
 */
export function logInfo(message: string, context?: LogContext): void {
  if (!shouldLog(LogLevel.INFO, defaultConfig)) return;

  const formatted = formatMessage(LogLevel.INFO, message, context);

  if (defaultConfig.enableConsole) {
    console.info(formatted);
  }
}

/**
 * Log debug message
 */
export function logDebug(message: string, context?: LogContext): void {
  if (!shouldLog(LogLevel.DEBUG, defaultConfig)) return;

  const formatted = formatMessage(LogLevel.DEBUG, message, context);

  if (defaultConfig.enableConsole) {
    console.debug(formatted);
  }
}

/**
 * Create a logger instance with a specific context
 */
export function createLogger(defaultContext: LogContext) {
  return {
    error: (message: string, error?: Error | unknown, context?: LogContext) =>
      logError(message, error, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      logWarn(message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) =>
      logInfo(message, { ...defaultContext, ...context }),
    debug: (message: string, context?: LogContext) =>
      logDebug(message, { ...defaultContext, ...context }),
  };
}
