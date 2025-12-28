// ============================================
// AI Brainstorm - Base LLM Provider
// Version: 2.0.0
// ============================================

import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
  LLMError,
} from '../types';
import type { ApiFormat, ProviderModel } from '../../types';

/**
 * Extended provider config with user-defined models
 */
export interface ExtendedProviderConfig extends LLMProviderConfig {
  autoFetchModels: boolean;
  userModels: ProviderModel[];
}

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseLLMProvider {
  protected config: LLMProviderConfig;
  protected extendedConfig: ExtendedProviderConfig;
  protected abortController: AbortController | null = null;

  constructor(config: LLMProviderConfig, extendedConfig?: Partial<ExtendedProviderConfig>) {
    this.config = config;
    this.extendedConfig = {
      ...config,
      autoFetchModels: extendedConfig?.autoFetchModels ?? true,
      userModels: extendedConfig?.userModels ?? [],
    };
  }

  /**
   * Get provider name
   */
  abstract get name(): string;

  /**
   * Get API format type
   */
  abstract get apiFormat(): ApiFormat;

  /**
   * Check if provider is configured (has API key if needed)
   */
  abstract isConfigured(): boolean;

  /**
   * Test connection to the provider
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Fetch models from the provider API (auto-fetch)
   */
  abstract fetchModels(): Promise<LLMModel[]>;

  /**
   * Get available models - combines user-defined and auto-fetched
   */
  async getModels(): Promise<LLMModel[]> {
    const userModels: LLMModel[] = this.extendedConfig.userModels.map(m => ({
      id: m.id,
      name: m.name,
      contextLength: m.contextLength,
    }));

    if (!this.extendedConfig.autoFetchModels) {
      return userModels;
    }

    try {
      const fetchedModels = await this.fetchModels();
      // Merge: user models take precedence (by id)
      const userModelIds = new Set(userModels.map(m => m.id));
      const uniqueFetchedModels = fetchedModels.filter(m => !userModelIds.has(m.id));
      return [...userModels, ...uniqueFetchedModels];
    } catch (error) {
      console.warn(`[${this.name}] Failed to fetch models, using user-defined only`);
      return userModels;
    }
  }

  /**
   * Send a completion request (non-streaming)
   */
  abstract complete(options: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * Send a streaming completion request
   */
  abstract stream(
    options: LLMRequestOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse>;

  /**
   * Update user-defined models
   */
  setUserModels(models: ProviderModel[]): void {
    this.extendedConfig.userModels = models;
  }

  /**
   * Set auto-fetch mode
   */
  setAutoFetchModels(enabled: boolean): void {
    this.extendedConfig.autoFetchModels = enabled;
  }

  /**
   * Abort any ongoing request
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Create a new AbortController for a request
   */
  protected createAbortController(externalSignal?: AbortSignal): AbortController {
    this.abort(); // Cancel any existing request
    this.abortController = new AbortController();

    // Link external signal if provided
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => {
        this.abortController?.abort();
      });
    }

    return this.abortController;
  }

  /**
   * Update provider configuration
   */
  updateConfig(config: Partial<LLMProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Handle fetch errors with retries
   */
  protected async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null;
    let delay = 1000; // Start with 1 second delay

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        if (response.ok) {
          return response;
        }

        // Check if error is retryable
        if (response.status === 429 || response.status >= 500) {
          // Rate limit or server error - retry
          const retryAfter = response.headers.get('Retry-After');
          delay = retryAfter ? parseInt(retryAfter) * 1000 : delay * 2;

          if (attempt < maxRetries - 1) {
            console.warn(`[${this.name}] Request failed (${response.status}), retrying in ${delay}ms...`);
            await this.sleep(delay);
            continue;
          }
        }

        // Non-retryable error
        const errorBody = await response.text();
        throw this.createError(
          `HTTP ${response.status}`,
          errorBody,
          response.status >= 500 || response.status === 429
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw this.createError('ABORTED', 'Request was aborted', false);
        }

        lastError = error as Error;

        if (attempt < maxRetries - 1) {
          console.warn(`[${this.name}] Request failed, retrying in ${delay}ms...`, error);
          await this.sleep(delay);
          delay *= 2; // Exponential backoff
        }
      }
    }

    throw lastError || this.createError('UNKNOWN', 'Request failed after retries', false);
  }

  /**
   * Create a standardized error object
   */
  protected createError(code: string, message: string, retryable: boolean, details?: unknown): LLMError {
    return {
      code,
      message,
      retryable,
      details,
    };
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse SSE stream
   */
  protected async *parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        
        // Accept both "data: " (with space) and "data:" (without space)
        if (trimmed.startsWith('data:')) {
          const data = trimmed.slice('data:'.length).trimStart();
          
          if (data === '[DONE]') {
            return;
          }
          
          yield data;
        }
      }
    }
  }
}

