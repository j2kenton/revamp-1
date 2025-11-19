/**
 * LLM Service
 * Handles communication with Language Model APIs
 */

import OpenAI, { type APIError } from 'openai';
import type {
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { logError, logInfo, logWarn } from '@/utils/logger';
import type { MessageModel } from '@/types/models';

interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: number;
  processingTime: number;
}

interface LLMError extends Error {
  code?: string;
  retryable?: boolean;
}

interface LLMRequestOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface LLMStreamOptions extends LLMRequestOptions {
  mockDelay?: number;
}

const DEFAULT_TEMPERATURE = 0.7;
const FALLBACK_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const openAiApiKey = process.env.OPENAI_API_KEY ?? '';
const openAiOrganizationId = process.env.OPENAI_ORGANIZATION_ID;
const openAiProjectId = process.env.OPENAI_PROJECT_ID;

let openAiClient: OpenAI | null = null;
let hasLoggedMissingOpenAIKey = false;
let hasLoggedBrowserEnvironmentFallback = false;

function isOpenAIConfigured(): boolean {
  return Boolean(openAiApiKey);
}

function isBrowserLikeEnvironment(): boolean {
  return typeof window !== 'undefined';
}

function shouldUseMockLLM(): boolean {
  if (isBrowserLikeEnvironment()) {
    if (!hasLoggedBrowserEnvironmentFallback && process.env.NODE_ENV !== 'test') {
      logWarn(
        'LLM service was invoked in a browser-like environment. Using mock responses to avoid exposing sensitive credentials.',
      );
      hasLoggedBrowserEnvironmentFallback = true;
    }
    return true;
  }

  if (isOpenAIConfigured()) {
    return false;
  }
  if (!hasLoggedMissingOpenAIKey && process.env.NODE_ENV !== 'test') {
    logWarn(
      'OPENAI_API_KEY is not configured. Falling back to mock LLM responses.',
    );
    hasLoggedMissingOpenAIKey = true;
  }
  return true;
}

function getOpenAIClient(): OpenAI {
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required.');
  }
  if (!openAiClient) {
    openAiClient = new OpenAI({
      apiKey: openAiApiKey,
      ...(openAiOrganizationId ? { organization: openAiOrganizationId } : {}),
      ...(openAiProjectId ? { project: openAiProjectId } : {}),
    });
  }
  return openAiClient;
}

function resolveModel(model?: string): string {
  return model?.trim() || FALLBACK_MODEL;
}

function normalizeMessagesForOpenAI(
  messages: Array<{ role: string; content: string }>,
): ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    const role =
      msg.role === 'system' || msg.role === 'assistant' || msg.role === 'user'
        ? msg.role
        : 'user';
    return {
      role,
      content: msg.content,
    };
  });
}

type MessageContent = ChatCompletionMessageParam['content'];

function extractMessageContent(
  content: MessageContent | string | null | undefined,
): string {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) {
          return '';
        }
        if (typeof part === 'string') {
          return part;
        }
        const structuredPart = part as ChatCompletionContentPart;
        if (
          'text' in structuredPart &&
          typeof structuredPart.text === 'string'
        ) {
          return structuredPart.text;
        }
        return '';
      })
      .join('');
  }

  return '';
}

function isRetryableApiError(error: unknown): boolean {
  const apiError = error as Partial<APIError> | undefined;
  if (apiError && typeof apiError.status === 'number') {
    if (apiError.status === 429) {
      return true;
    }
    return apiError.status >= 500;
  }
  return true;
}

/**
 * Circuit Breaker States
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit Breaker for LLM Service
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(
    private failureThreshold: number = 5,
    private successThreshold: number = 2,
    private timeout: number = 60000, // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
      // Transition to half-open to test recovery
      this.state = CircuitState.HALF_OPEN;
      logInfo('Circuit breaker transitioning to HALF_OPEN');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
        logInfo('Circuit breaker CLOSED - service recovered');
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.successCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.timeout;
      logError(
        'Circuit breaker OPEN - too many failures',
        new Error('Circuit breaker opened'),
        {
          failureCount: this.failureCount,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString(),
        },
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}

// Global circuit breaker instance
const llmCircuitBreaker = new CircuitBreaker();

/**
 * Access the singleton circuit breaker instance.
 *
 * @remarks
 * This is provided for observability hooks (e.g., health dashboards) and unit tests
 * that need to inspect breaker state transitions. The returned object is the live,
 * shared instance, so mutating it (calling `reset`, `execute`, etc.) will affect all
 * LLM calls for every user. Prefer read-only access (e.g., `getState()`) unless you
 * are explicitly coordinating a controlled test. Never modify breaker thresholds at
 * runtime outside of test environments.
 */
export function getCircuitBreaker(): CircuitBreaker {
  return llmCircuitBreaker;
}

/**
 * Streaming callback for LLM responses
 */
export type StreamCallback = (chunk: string) => void;

/**
 * Mock LLM service for development
 * Replace with actual LLM API integration (OpenAI, Anthropic, etc.)
 */
export async function callLLM(
  messages: Array<{ role: string; content: string }>,
  options: LLMRequestOptions = {},
): Promise<LLMResponse> {
  if (shouldUseMockLLM()) {
    return callMockLLM(messages, options);
  }

  const startTime = Date.now();

  try {
    const client = getOpenAIClient();
    const normalizedMessages = normalizeMessagesForOpenAI(messages);
    const model = resolveModel(options.model);

    const requestPayload: ChatCompletionCreateParams = {
      model,
      messages: normalizedMessages,
      temperature:
        typeof options.temperature === 'number'
          ? options.temperature
          : DEFAULT_TEMPERATURE,
    };

    if (typeof options.maxTokens === 'number') {
      requestPayload.max_tokens = options.maxTokens;
    }

    const response = await client.chat.completions.create(requestPayload);
    const choice = response.choices?.[0];
    const content = extractMessageContent(choice?.message?.content);

    if (!content) {
      throw new Error('OpenAI response did not include any content.');
    }

    const processingTime = Date.now() - startTime;

    logInfo('LLM request completed', {
      model: response.model ?? model,
      processingTime,
      messageCount: messages.length,
    });

    return {
      content,
      model: response.model ?? model,
      tokensUsed: response.usage?.total_tokens ?? calculateTokenCount(content),
      processingTime,
    };
  } catch (error) {
    logError('LLM request failed', error, {
      model: options.model,
      messageCount: messages.length,
    });

    const llmError: LLMError =
      error instanceof Error ? error : new Error('Unknown LLM error');

    llmError.retryable = isRetryableApiError(error);
    throw llmError;
  }
}

/**
 * Stream LLM response
 * Calls the callback function with each token as it arrives
 */
export async function callLLMStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: StreamCallback,
  options: LLMStreamOptions = {},
): Promise<LLMResponse> {
  if (shouldUseMockLLM()) {
    return callMockLLMStream(messages, onChunk, options);
  }

  const startTime = Date.now();

  try {
    const client = getOpenAIClient();
    const normalizedMessages = normalizeMessagesForOpenAI(messages);
    const model = resolveModel(options.model);

    const requestPayload: ChatCompletionCreateParamsStreaming = {
      model,
      messages: normalizedMessages,
      temperature:
        typeof options.temperature === 'number'
          ? options.temperature
          : DEFAULT_TEMPERATURE,
      stream: true,
    };

    if (typeof options.maxTokens === 'number') {
      requestPayload.max_tokens = options.maxTokens;
    }

    const stream = await client.chat.completions.create(requestPayload);

    let fullContent = '';
    let observedModel = model;

    for await (const chunk of stream) {
      if (chunk.model) {
        observedModel = chunk.model;
      }

      const deltaContent = extractMessageContent(
        chunk.choices?.[0]?.delta?.content ?? null,
      );

      if (deltaContent) {
        fullContent += deltaContent;
        onChunk(deltaContent);
      }
    }

    const finalContent = fullContent.trim();

    if (!finalContent) {
      throw new Error('OpenAI streaming response returned no content.');
    }

    const processingTime = Date.now() - startTime;

    logInfo('LLM streaming request completed', {
      model: observedModel,
      processingTime,
      messageCount: messages.length,
    });

    return {
      content: finalContent,
      model: observedModel,
      tokensUsed: calculateTokenCount(finalContent),
      processingTime,
    };
  } catch (error) {
    logError('LLM streaming request failed', error, {
      model: options.model,
      messageCount: messages.length,
    });

    const llmError: LLMError =
      error instanceof Error ? error : new Error('Unknown LLM streaming error');

    llmError.retryable = isRetryableApiError(error);
    throw llmError;
  }
}

async function callMockLLM(
  messages: Array<{ role: string; content: string }>,
  options: LLMRequestOptions,
): Promise<LLMResponse> {
  const startTime = Date.now();
  const latestContent = messages[messages.length - 1]?.content ?? '';

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const mockResponse = `This is a mock response to: "${latestContent}".

In a production environment, this would be replaced with an actual AI response from a service like OpenAI, Anthropic Claude, or another LLM provider.

To integrate a real LLM:
1. Configure your API keys in environment variables
2. Ensure the LLM client is initialized on the server
3. Handle rate limiting and errors appropriately`;

  const processingTime = Date.now() - startTime;

  logInfo('LLM request completed (mock)', {
    model: options.model || 'mock',
    processingTime,
    messageCount: messages.length,
  });

  return {
    content: mockResponse,
    model: options.model || 'mock-model',
    tokensUsed: Math.floor(Math.random() * 500) + 100,
    processingTime,
  };
}

async function callMockLLMStream(
  messages: Array<{ role: string; content: string }>,
  onChunk: StreamCallback,
  options: LLMStreamOptions,
): Promise<LLMResponse> {
  const startTime = Date.now();
  const latestContent = messages[messages.length - 1]?.content ?? '';

  const mockResponse = `This is a streaming mock response to: "${latestContent}".

In a production environment, this would stream tokens from a real LLM API like OpenAI or Anthropic.

Each word is sent as a separate chunk to simulate real streaming behavior.`;

  const words = mockResponse.split(' ');
  let fullContent = '';

  const mockDelay =
    typeof options.mockDelay === 'number' && options.mockDelay >= 0
      ? options.mockDelay
      : 30;

  for (let i = 0; i < words.length; i++) {
    const word = `${words[i]} `;
    fullContent += word;
    onChunk(word);
    await new Promise((resolve) => setTimeout(resolve, mockDelay));
  }

  const processingTime = Date.now() - startTime;

  logInfo('LLM streaming request completed (mock)', {
    model: options.model || 'mock-streaming',
    processingTime,
    messageCount: messages.length,
  });

  return {
    content: fullContent.trim(),
    model: options.model || 'mock-streaming-model',
    tokensUsed: words.length,
    processingTime,
  };
}

/**
 * Calculate token count (simplified)
 * In production, use proper tokenizer for the specific model
 */
export function calculateTokenCount(text: string): number {
  // Rough approximation: ~4 characters per token
  // Use proper tokenizers like tiktoken for OpenAI models
  return Math.ceil(text.length / 4);
}

/**
 * Validate token count before API call
 */
export function validateTokenCount(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 8000,
): boolean {
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be a positive number');
  }

  const totalTokens = messages.reduce(
    (sum, msg) => sum + calculateTokenCount(msg.content),
    0,
  );

  return totalTokens <= maxTokens;
}

/**
 * Smart context window management
 * Truncates messages to fit within token limit while preserving important context
 */
export function truncateMessagesToFit(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 8000,
): {
  messages: Array<{ role: string; content: string }>;
  truncated: boolean;
  removedCount: number;
} {
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be a positive number');
  }

  const totalTokens = messages.reduce(
    (sum, msg) => sum + calculateTokenCount(msg.content),
    0,
  );

  if (totalTokens <= maxTokens) {
    return { messages, truncated: false, removedCount: 0 };
  }

  // Strategy: Keep the system message (if any) and the most recent messages
  // Remove oldest user/assistant messages first
  const systemMessages = messages.filter((msg) => msg.role === 'system');
  const conversationMessages = messages.filter((msg) => msg.role !== 'system');

  let currentTokens = systemMessages.reduce(
    (sum, msg) => sum + calculateTokenCount(msg.content),
    0,
  );

  // Add messages from most recent to oldest until we hit the limit
  const keptMessages: Array<{ role: string; content: string }> = [];
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    const msg = conversationMessages[i];
    const msgTokens = calculateTokenCount(msg.content);

    if (currentTokens + msgTokens <= maxTokens) {
      keptMessages.unshift(msg);
      currentTokens += msgTokens;
    } else {
      // If we can't fit this message, stop
      break;
    }
  }

  const removedCount = conversationMessages.length - keptMessages.length;

  if (removedCount > 0) {
    logWarn('Context truncated to fit token limit', {
      originalCount: messages.length,
      keptCount: systemMessages.length + keptMessages.length,
      removedCount,
      maxTokens,
      currentTokens,
    });
  }

  return {
    messages: [...systemMessages, ...keptMessages],
    truncated: removedCount > 0,
    removedCount,
  };
}

/**
 * Format messages for LLM API
 */
export function formatMessagesForLLM(
  messages: MessageModel[],
): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content,
  }));
}

/**
 * Retry LLM call with exponential backoff and circuit breaker
 */
export async function callLLMWithRetry(
  messages: Array<{ role: string; content: string }>,
  options: LLMRequestOptions = {},
  maxRetries: number = 3,
): Promise<LLMResponse> {
  // Check circuit breaker first
  return llmCircuitBreaker.execute(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await callLLM(messages, options);
      } catch (error) {
        lastError = error as Error;

        const llmError = error as LLMError;
        if (!llmError.retryable) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          logInfo(`Retrying LLM call in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  });
}

/**
 * Retry LLM streaming call with exponential backoff and circuit breaker
 */
export async function callLLMStreamWithRetry(
  messages: Array<{ role: string; content: string }>,
  onChunk: StreamCallback,
  options: LLMStreamOptions = {},
  maxRetries: number = 3,
): Promise<LLMResponse> {
  // Check circuit breaker first
  return llmCircuitBreaker.execute(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await callLLMStream(messages, onChunk, options);
      } catch (error) {
        lastError = error as Error;

        const llmError = error as LLMError;
        if (!llmError.retryable) {
          throw error;
        }

        if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          logInfo(`Retrying LLM streaming call in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('LLM streaming call failed after retries');
  });
}

/**
 * Get fallback message when circuit is open
 */
export function getFallbackMessage(): string {
  return 'The AI service is temporarily unavailable. Please try again in a few moments. We apologize for the inconvenience.';
}
