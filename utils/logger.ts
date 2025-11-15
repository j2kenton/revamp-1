/**
 * Logging Utilities
 * Centralized logging with different log levels
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
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
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
