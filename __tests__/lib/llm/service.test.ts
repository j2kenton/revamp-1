import * as llmService from '@/lib/llm/service';
import { redisCircuitBreaker } from '@/lib/redis/circuit-breaker';

// Mock the Redis circuit breaker
jest.mock('@/lib/redis/circuit-breaker', () => ({
  redisCircuitBreaker: {
    getState: jest.fn(() => 'CLOSED'),
  },
}));

const baseMessages = [{ role: 'user', content: 'Hello there' }];

describe('LLM service', () => {
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      callback: TimerHandler,
    ) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  it('callLLM returns mock content', async () => {
    const result = await llmService.callLLM(baseMessages);

    expect(result.content).toContain('Hello there');
    expect(result.model).toBeTruthy();
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it('streams chunks via callLLMStream', async () => {
    const chunks: string[] = [];
    const result = await llmService.callLLMStream(
      baseMessages,
      (chunk: string) => {
        chunks.push(chunk);
      },
      { mockDelay: 0 },
    );

    expect(chunks.length).toBeGreaterThan(0);
    expect(result.content).toContain('Hello there');
  });

  it('calculateTokenCount approximates based on length', () => {
    const short = llmService.calculateTokenCount('abcd');
    const longer = llmService.calculateTokenCount('a'.repeat(40));

    expect(short).toBe(1);
    expect(longer).toBeGreaterThan(short);
  });

  it('validateTokenCount enforces limits', () => {
    const valid = llmService.validateTokenCount(baseMessages, 10);
    expect(valid).toBe(true);

    const invalid = llmService.validateTokenCount(
      [{ role: 'user', content: 'a'.repeat(200) }],
      1,
    );
    expect(invalid).toBe(false);
  });

  it('truncateMessagesToFit removes oldest entries first', () => {
    const messages = [
      { role: 'system', content: 'system info' },
      { role: 'user', content: 'older message' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'latest question' },
    ];

    const {
      messages: trimmed,
      truncated,
      removedCount,
    } = llmService.truncateMessagesToFit(messages, 7);

    expect(truncated).toBe(true);
    expect(removedCount).toBeGreaterThan(0);
    expect(trimmed[0].role).toBe('system');
    expect(trimmed[trimmed.length - 1].content).toBe('latest question');
  });

  it('formatMessagesForLLM maps MessageModel shape', () => {
    const now = new Date();
    const formatted = llmService.formatMessagesForLLM([
      {
        id: '1',
        chatId: 'c1',
        role: 'user',
        content: 'Hi',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '2',
        chatId: 'c1',
        role: 'assistant',
        content: 'Hello',
        status: 'sent',
        parentMessageId: null,
        metadata: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(formatted).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
    ]);
  });

  it('getFallbackMessage provides a helpful string', () => {
    expect(llmService.getFallbackMessage()).toContain(
      'temporarily unavailable',
    );
  });

  // SECURITY TEST: MED-03 - Redis circuit breaker check in LLM service
  describe('MED-03: Redis circuit breaker integration', () => {
    beforeEach(() => {
      // Reset mock to CLOSED state
      (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');
    });

    describe('callLLMWithRetry', () => {
      it('should allow LLM calls when Redis circuit breaker is CLOSED', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');

        const result = await llmService.callLLMWithRetry(baseMessages);

        // Should succeed (mock LLM)
        expect(result.content).toBeTruthy();
      });

      it('should deny LLM calls when Redis circuit breaker is OPEN', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        await expect(llmService.callLLMWithRetry(baseMessages)).rejects.toThrow(
          /Service temporarily unavailable|rate limiting/i,
        );
      });

      it('should prevent LLM cost abuse when rate limiting is unavailable', async () => {
        // This is the key security test for MED-03
        // When Redis is down, rate limiting cannot work
        // Therefore LLM calls should be denied to prevent cost abuse
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        await expect(
          llmService.callLLMWithRetry(baseMessages),
        ).rejects.toThrow();

        // Verify circuit breaker was checked
        expect(redisCircuitBreaker.getState).toHaveBeenCalled();
      });
    });

    describe('callLLMStreamWithRetry', () => {
      it('should allow streaming LLM calls when Redis circuit breaker is CLOSED', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');

        const chunks: string[] = [];
        const result = await llmService.callLLMStreamWithRetry(
          baseMessages,
          (chunk: string) => {
            chunks.push(chunk);
          },
          { mockDelay: 0 },
        );

        expect(result.content).toBeTruthy();
        expect(chunks.length).toBeGreaterThan(0);
      });

      it('should deny streaming LLM calls when Redis circuit breaker is OPEN', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        const chunks: string[] = [];

        await expect(
          llmService.callLLMStreamWithRetry(
            baseMessages,
            (chunk: string) => {
              chunks.push(chunk);
            },
            { mockDelay: 0 },
          ),
        ).rejects.toThrow(/Service temporarily unavailable|rate limiting/i);

        // No chunks should have been streamed
        expect(chunks.length).toBe(0);
      });

      it('should prevent streaming cost abuse when rate limiting is unavailable', async () => {
        // Streaming calls are even more expensive - must be blocked when Redis is down
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        await expect(
          llmService.callLLMStreamWithRetry(baseMessages, () => {}, {
            mockDelay: 0,
          }),
        ).rejects.toThrow();

        expect(redisCircuitBreaker.getState).toHaveBeenCalled();
      });
    });

    describe('Circuit breaker states', () => {
      it('should allow requests in CLOSED state', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('CLOSED');

        const result = await llmService.callLLMWithRetry(baseMessages);
        expect(result.content).toBeTruthy();
      });

      it('should deny requests in OPEN state', async () => {
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue('OPEN');

        await expect(
          llmService.callLLMWithRetry(baseMessages),
        ).rejects.toThrow();
      });

      it('should allow requests in HALF_OPEN state (testing recovery)', async () => {
        // HALF_OPEN means the circuit breaker is testing if the service recovered
        // We should allow requests through to test
        (redisCircuitBreaker.getState as jest.Mock).mockReturnValue(
          'HALF_OPEN',
        );

        const result = await llmService.callLLMWithRetry(baseMessages);
        expect(result.content).toBeTruthy();
      });
    });
  });
});
