import { TokenManager, TOKEN_LIMITS } from '@/lib/llm/token-manager';

describe('TokenManager', () => {
  it('counts tokens for basic text', () => {
    const count = TokenManager.countTokens('Hello world');
    expect(count).toBeGreaterThan(0);
  });

  it('estimates cost for inputs', () => {
    const result = TokenManager.estimateCost(1000, 500);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it('validates budgets', () => {
    const result = TokenManager.validateTokenBudget('Hi', 'Context');
    expect(result.valid).toBe(true);
  });

  it('rejects oversized messages', () => {
    const longMessage = 'x'.repeat(TOKEN_LIMITS.maxMessageTokens * 5);
    const result = TokenManager.validateTokenBudget(longMessage, '');
    expect(result.valid).toBe(false);
  });

  it('truncates context to fit window', () => {
    const messages = Array.from({ length: 10 }).map((_, idx) => ({
      text: `Message ${idx}`,
      role: 'user',
    }));

    const { truncatedMessages, removedCount } = TokenManager.truncateContext(
      messages,
      5,
    );

    expect(truncatedMessages.length).toBeGreaterThan(0);
    expect(removedCount).toBeGreaterThan(0);
  });
});
