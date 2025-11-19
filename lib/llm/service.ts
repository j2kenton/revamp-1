/**
 * LLM Service
 * Handles communication with Language Model APIs
 */

import { logError, logInfo, logWarn } from '@/utils/logger';
import type { MessageModel } from '@/types/models';
type GoogleGenAIModule = typeof import('@google/genai');
type GoogleGenAIClient = InstanceType<GoogleGenAIModule['GoogleGenAI']>;

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

const DEFAULT_TEMPERATURE = 1;
const FALLBACK_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

let geminiClient: GoogleGenAIClient | null = null;
let googleGenAIModulePromise: Promise<GoogleGenAIModule> | null = null;
let hasLoggedMissingGeminiKey = false;
let hasLoggedBrowserEnvironmentFallback = false;

function getGeminiApiKey(): string | undefined {
  const rawKey = process.env.GEMINI_API_KEY;
  if (!rawKey) {
    return undefined;
  }
  const trimmed = rawKey.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

function isBrowserLikeEnvironment(): boolean {
  return typeof window !== 'undefined';
}

function shouldUseMockLLM(): boolean {
  if (isBrowserLikeEnvironment()) {
    if (
      !hasLoggedBrowserEnvironmentFallback &&
      process.env.NODE_ENV !== 'test'
    ) {
      logWarn(
        'LLM service was invoked in a browser-like environment. Using mock responses to avoid exposing sensitive credentials.',
      );
      hasLoggedBrowserEnvironmentFallback = true;
    }
    return true;
  }

  if (isGeminiConfigured()) {
    return false;
  }
  if (!hasLoggedMissingGeminiKey && process.env.NODE_ENV !== 'test') {
    logWarn(
      'GEMINI_API_KEY is not configured. Falling back to mock LLM responses.',
    );
    hasLoggedMissingGeminiKey = true;
  }
  return true;
}

async function loadGoogleGenAIModule(): Promise<GoogleGenAIModule> {
  if (!googleGenAIModulePromise) {
    googleGenAIModulePromise = import('@google/genai');
  }
  return googleGenAIModulePromise;
}

async function getGeminiClient(): Promise<GoogleGenAIClient> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required.');
  }
  if (!geminiClient) {
    const { GoogleGenAI } = await loadGoogleGenAIModule();
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

function resolveModel(model?: string): string {
  return model?.trim() || FALLBACK_MODEL;
}

function normalizeMessagesForGemini(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((msg) => {
    // Gemini uses 'user' and 'model' roles
    // Map 'assistant' to 'model', 'system' is handled differently usually but for chat 'user'/'model' is standard
    // For now, we'll map 'system' to 'user' with a prefix or just 'user' if the API supports system instructions separately
    // The new SDK might support system instructions in the config.
    // For simplicity in this migration, we'll map roles.

    let role = 'user';
    if (msg.role === 'assistant') {
      role = 'model';
    } else if (msg.role === 'model') {
      role = 'model';
    }

    return {
      role,
      parts: [{ text: msg.content }],
    };
  });
}

function isRetryableApiError(_error: unknown): boolean {
  // TODO: Check specific Gemini error codes
  // For now, assume standard HTTP status codes if available or generic error check
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
    const client = await getGeminiClient();
    const modelName = resolveModel(options.model);

    // Separate system message if present
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const contents = normalizeMessagesForGemini(chatMessages);

    const config: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    } = {
      temperature:
        typeof options.temperature === 'number'
          ? options.temperature
          : DEFAULT_TEMPERATURE,
    };

    if (typeof options.maxTokens === 'number') {
      config.maxOutputTokens = options.maxTokens;
    }

    if (systemMessage) {
      config.systemInstruction = systemMessage.content;
    }

    const response = await client.models.generateContent({
      model: modelName,
      contents,
      config,
    });

    const content = response.text;

    if (!content) {
      throw new Error('Gemini response did not include any content.');
    }

    const processingTime = Date.now() - startTime;

    logInfo('LLM request completed', {
      model: modelName,
      processingTime,
      messageCount: messages.length,
    });

    return {
      content,
      model: modelName,
      tokensUsed:
        response.usageMetadata?.totalTokenCount ?? calculateTokenCount(content),
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
    const client = await getGeminiClient();
    const modelName = resolveModel(options.model);

    // Separate system message if present
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const contents = normalizeMessagesForGemini(chatMessages);

    const config: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    } = {
      temperature:
        typeof options.temperature === 'number'
          ? options.temperature
          : DEFAULT_TEMPERATURE,
    };

    if (typeof options.maxTokens === 'number') {
      config.maxOutputTokens = options.maxTokens;
    }

    if (systemMessage) {
      config.systemInstruction = systemMessage.content;
    }

    const stream = await client.models.generateContentStream({
      model: modelName,
      contents,
      config,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullContent += chunkText;
        onChunk(chunkText);
      }
    }

    const finalContent = fullContent.trim();

    if (!finalContent) {
      throw new Error('Gemini streaming response returned no content.');
    }

    const processingTime = Date.now() - startTime;

    logInfo('LLM streaming request completed', {
      model: modelName,
      processingTime,
      messageCount: messages.length,
    });

    return {
      content: finalContent,
      model: modelName,
      tokensUsed: calculateTokenCount(finalContent), // Usage metadata might be available in the final chunk, but for now approx
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
