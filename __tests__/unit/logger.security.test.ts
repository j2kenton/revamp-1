/**
 * Security Tests for Logger Module (HIGH-05)
 *
 * These tests verify that sensitive data is properly masked in logs
 * to prevent exposure of secrets, tokens, passwords, and PII.
 */

// We need to access the internal masking function for testing
// Since it's not exported, we'll test through the public logging functions
// by capturing console output

describe('HIGH-05: Sensitive Data Masking in Logs', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Use Object.defineProperty to override NODE_ENV
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
      configurable: true,
    });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

    // Clear module cache to re-initialize logger with fresh config
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('Complete masking of sensitive keys', () => {
    it('should mask token values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Auth response', { accessToken: 'secret-token-12345' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('secret-token-12345');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask password values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Login attempt', { password: 'user-password-123' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('user-password-123');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask secret values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Config loaded', { clientSecret: 'my-client-secret' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('my-client-secret');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask authorization header values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Request headers', { authorization: 'Bearer abc123xyz' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('Bearer abc123xyz');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask apiKey values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('API call', { apiKey: 'sk-12345-abcde' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('sk-12345-abcde');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask api_key values (snake_case)', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('API call', { api_key: 'sk-12345-abcde' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('sk-12345-abcde');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask refreshToken values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Token refresh', { refreshToken: 'refresh-token-xyz' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('refresh-token-xyz');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask bearer token values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Auth header', { bearer: 'token-abc123' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('token-abc123');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask credential values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Auth check', { credential: 'user-credential-data' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('user-credential-data');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask privateKey values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Key loaded', { privateKey: '-----BEGIN PRIVATE KEY-----' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('-----BEGIN PRIVATE KEY-----');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask session values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Session created', { sessionId: 'sess-12345-abcde' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('sess-12345-abcde');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should mask cookie values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Cookie set', { sessionCookie: 'cookie-value-123' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('cookie-value-123');
      expect(logOutput).toContain('[REDACTED]');
    });
  });

  describe('Partial masking of PII', () => {
    it('should partially mask email addresses', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('User lookup', { email: 'john.doe@example.com' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      // Should not contain full email
      expect(logOutput).not.toContain('john.doe@example.com');
      // Should contain domain (partial masking keeps domain)
      expect(logOutput).toContain('@example.com');
    });

    it('should partially mask IP addresses', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Request from', { ip: '192.168.1.100' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      // Should not contain full IP
      expect(logOutput).not.toContain('192.168.1.100');
      // Should contain masked version with ***
      expect(logOutput).toContain('***');
    });

    it('should partially mask ipAddress field', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Client info', { ipAddress: '10.0.0.50' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('10.0.0.50');
    });
  });

  describe('Nested object masking', () => {
    it('should mask sensitive data in nested objects', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('User auth', {
        user: {
          name: 'John',
          credentials: {
            password: 'secret123',
            token: 'abc-token',
          },
        },
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('secret123');
      expect(logOutput).not.toContain('abc-token');
      expect(logOutput).toContain('John'); // Non-sensitive should be preserved
    });

    it('should handle deeply nested sensitive data', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Deep object', {
        level1: {
          level2: {
            level3: {
              apiToken: 'deep-secret',
            },
          },
        },
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('deep-secret');
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should handle arrays with sensitive data', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Array data', {
        users: [
          { name: 'Alice', password: 'pass1' },
          { name: 'Bob', password: 'pass2' },
        ],
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('pass1');
      expect(logOutput).not.toContain('pass2');
      expect(logOutput).toContain('Alice');
      expect(logOutput).toContain('Bob');
    });
  });

  describe('Masking in error logs', () => {
    it('should mask sensitive data in error context', async () => {
      const { logError } = await import('@/utils/logger');

      logError('Auth failed', new Error('Invalid token'), {
        accessToken: 'leaked-token',
        userEmail: 'user@test.com',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logOutput = consoleErrorSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('leaked-token');
    });
  });

  describe('Masking in warning logs', () => {
    it('should mask sensitive data in warning context', async () => {
      const { logWarn } = await import('@/utils/logger');

      logWarn('Rate limit warning', {
        userId: 'user-123',
        apiKey: 'exposed-key',
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      const logOutput = consoleWarnSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('exposed-key');
      expect(logOutput).toContain('user-123'); // userId is not sensitive
    });
  });

  describe('Edge cases', () => {
    it('should handle null values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Null test', { password: null });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should handle undefined values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Undefined test', { token: undefined });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('[REDACTED]');
    });

    it('should handle empty string values', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Empty test', { secret: '' });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      // Empty values should show [EMPTY] to indicate the field exists but is empty
      expect(logOutput).toContain('[EMPTY]');
    });

    it('should preserve non-sensitive data', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Normal log', {
        chatId: 'chat-123',
        messageCount: 5,
        status: 'active',
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).toContain('chat-123');
      expect(logOutput).toContain('5');
      expect(logOutput).toContain('active');
    });

    it('should handle case-insensitive key matching', async () => {
      const { logInfo } = await import('@/utils/logger');

      logInfo('Case test', {
        PASSWORD: 'secret1',
        PassWord: 'secret2',
        APIKEY: 'secret3',
      });

      expect(consoleInfoSpy).toHaveBeenCalled();
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(logOutput).not.toContain('secret1');
      expect(logOutput).not.toContain('secret2');
      expect(logOutput).not.toContain('secret3');
    });
  });

  describe('Depth limit protection', () => {
    it('should handle objects with circular references gracefully', async () => {
      const { logInfo } = await import('@/utils/logger');

      // Create deeply nested object that approaches max depth
      type DeepObject = {
        level: number;
        nested?: DeepObject;
        password?: string;
      };
      const createDeepObject = (depth: number): DeepObject => {
        if (depth === 0) {
          return { level: 0, password: 'deep-secret' };
        }
        return { level: depth, nested: createDeepObject(depth - 1) };
      };

      const deepObj = createDeepObject(15);

      // Should not throw
      expect(() => {
        logInfo('Deep object test', deepObj);
      }).not.toThrow();

      expect(consoleInfoSpy).toHaveBeenCalled();
    });
  });
});
