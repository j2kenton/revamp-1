/**
 * Token Management Utilities
 * Provides helpers for counting tokens, estimating cost, and managing context windows.
 */

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
    if (!text) return 0;
    const normalized = text.trim();
    if (!normalized) return 0;
    const charEstimate = Math.ceil(normalized.length / 4);
    const wordEstimate = normalized.split(/\s+/).length;
    return Math.max(charEstimate, wordEstimate);
  }

  static estimateCost(inputTokens: number, outputTokens: number) {
    const inputCost = Number((inputTokens * COST_PER_INPUT_TOKEN).toFixed(6));
    const outputCost = Number((outputTokens * COST_PER_OUTPUT_TOKEN).toFixed(6));
    return {
      inputCost,
      outputCost,
      totalCost: Number((inputCost + outputCost).toFixed(6)),
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
        estimatedCost: 0,
        error: `Message too long (${messageTokens}/${TOKEN_LIMITS.maxMessageTokens})`,
      };
    }

    if (contextTokens > TOKEN_LIMITS.maxContextTokens) {
      return {
        valid: false,
        messageTokens,
        contextTokens,
        totalTokens,
        estimatedCost: 0,
        error: `Context too long (${contextTokens}/${TOKEN_LIMITS.maxContextTokens})`,
      };
    }

    if (totalTokens > TOKEN_LIMITS.maxTotalTokens) {
      return {
        valid: false,
        messageTokens,
        contextTokens,
        totalTokens,
        estimatedCost: 0,
        error: `Total input too long (${totalTokens}/${TOKEN_LIMITS.maxTotalTokens})`,
      };
    }

    const estimatedOutputTokens = Math.max(Math.ceil(messageTokens * 0.5), 1);
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
    let tokenCount = 0;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const msgTokens = this.countTokens(msg.text);

      if (tokenCount + msgTokens > maxTokens && kept.length > 0) {
        continue;
      }

      kept.push(msg);
      tokenCount += msgTokens;
    }

    kept.reverse();
    const removedCount = messages.length - kept.length;

    if (kept.length === 0 && messages.length > 0) {
      return {
        truncatedMessages: [messages[messages.length - 1]],
        removedCount: messages.length - 1,
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
