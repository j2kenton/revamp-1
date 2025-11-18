import * as llmService from '@/lib/llm/service';

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
});
