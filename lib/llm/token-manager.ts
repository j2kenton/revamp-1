/**
 * Token Management Utilities
 * Provides helpers for counting tokens, estimating cost, and managing context windows.
 */

const CHARS_PER_TOKEN_ESTIMATE = 4;
const MIN_TOKEN_COUNT = 0;
const COST_DECIMAL_PLACES = 6;
const OUTPUT_TOKEN_RATIO = 0.5;
const MIN_OUTPUT_TOKENS = 1;
const LOOP_DECREMENT = 1;
const FALLBACK_MESSAGE_INDEX_OFFSET = 1;

export const TOKEN_LIMITS = {
  maxMessageTokens: 4000,
  maxContextTokens: 12000,
  maxTotalTokens: 16000,
};

const COST_PER_INPUT_TOKEN = 0.00003;
const COST_PER_OUTPUT_TOKEN = 0.00006;

interface ConversationMessage {
  text: string;
  role: 'user' | 'assistant' | 'system' | string;
}

export class TokenManager {
  /**
   * Rough approximation based on length.
   */
  static countTokens(text: string): number {
    if (!text) return MIN_TOKEN_COUNT;
    const normalized = text.trim();
    if (!normalized) return MIN_TOKEN_COUNT;
    const charEstimate = Math.ceil(normalized.length / CHARS_PER_TOKEN_ESTIMATE);
    const wordEstimate = normalized.split(/\s+/).length;
    return Math.max(charEstimate, wordEstimate);
  }

  static estimateCost(inputTokens: number, outputTokens: number) {
    const inputCost = Number((inputTokens * COST_PER_INPUT_TOKEN).toFixed(COST_DECIMAL_PLACES));
    const outputCost = Number((outputTokens * COST_PER_OUTPUT_TOKEN).toFixed(COST_DECIMAL_PLACES));
    return {
      inputCost,
      outputCost,
      totalCost: Number((inputCost + outputCost).toFixed(COST_DECIMAL_PLACES)),
    };
  }

  static validateTokenBudget(message: string, context: string) {
    const messageTokens = this.countTokens(message);
    const contextTokens = this.countTokens(context);
    const totalTokens = messageTokens + contextTokens;

    if (messageTokens > TOKEN_LIMITS.maxMessageTokens) {
      return {
        valid: false,
        messageTokens,
        contextTokens,
        totalTokens,
        estimatedCost: MIN_TOKEN_COUNT,
        error: `Message too long (${messageTokens}/${TOKEN_LIMITS.maxMessageTokens})`,
      };
    }

    if (contextTokens > TOKEN_LIMITS.maxContextTokens) {
      return {
        valid: false,
        messageTokens,
        contextTokens,
        totalTokens,
        estimatedCost: MIN_TOKEN_COUNT,
        error: `Context too long (${contextTokens}/${TOKEN_LIMITS.maxContextTokens})`,
      };
    }

    if (totalTokens > TOKEN_LIMITS.maxTotalTokens) {
      return {
        valid: false,
        messageTokens,
        contextTokens,
        totalTokens,
        estimatedCost: MIN_TOKEN_COUNT,
        error: `Total input too long (${totalTokens}/${TOKEN_LIMITS.maxTotalTokens})`,
      };
    }

    const estimatedOutputTokens = Math.max(Math.ceil(messageTokens * OUTPUT_TOKEN_RATIO), MIN_OUTPUT_TOKENS);
    const { totalCost } = this.estimateCost(totalTokens, estimatedOutputTokens);

    return {
      valid: true,
      messageTokens,
      contextTokens,
      totalTokens,
      estimatedCost: totalCost,
    };
  }

  static truncateContext(
    messages: ConversationMessage[],
    maxTokens: number = TOKEN_LIMITS.maxContextTokens,
  ) {
    const kept: ConversationMessage[] = [];
    let tokenCount = MIN_TOKEN_COUNT;

    for (let i = messages.length - LOOP_DECREMENT; i >= MIN_TOKEN_COUNT; i -= LOOP_DECREMENT) {
      const msg = messages[i];
      const msgTokens = this.countTokens(msg.text);

      if (tokenCount + msgTokens > maxTokens && kept.length > MIN_TOKEN_COUNT) {
        continue;
      }

      kept.push(msg);
      tokenCount += msgTokens;
    }

    kept.reverse();
    const removedCount = messages.length - kept.length;

    if (kept.length === MIN_TOKEN_COUNT && messages.length > MIN_TOKEN_COUNT) {
      return {
        truncatedMessages: [messages[messages.length - LOOP_DECREMENT]],
        removedCount: messages.length - FALLBACK_MESSAGE_INDEX_OFFSET,
      };
    }

    return { truncatedMessages: kept, removedCount };
  }

  static addTruncationNotice(
    messages: ConversationMessage[],
    removedCount: number,
  ) {
    if (!removedCount) {
      return messages;
    }

    const notice: ConversationMessage = {
      role: 'system',
      text: `Context truncated. ${removedCount} earlier messages were removed.`,
    };

    return [notice, ...messages];
  }
}
