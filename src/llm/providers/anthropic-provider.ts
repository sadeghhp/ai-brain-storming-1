// ============================================
// AI Brainstorm - Anthropic-Compatible Provider
// ============================================

import { BaseLLMProvider, type ExtendedProviderConfig } from './base-provider';
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
} from '../types';
import type { ApiFormat } from '../../types';
import { countTokens } from '../token-counter';
import { CACHE } from '../../constants';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/**
 * Anthropic API response types
 */
interface AnthropicMessage {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
  message?: AnthropicMessage;
  usage?: {
    output_tokens: number;
  };
}

/**
 * Anthropic-Compatible LLM Provider
 * Handles Anthropic Claude API format
 */
export class AnthropicProvider extends BaseLLMProvider {
  private modelsCache: LLMModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly CACHE_TTL = CACHE.MODELS_TTL_MS;
  private providerName: string;

  constructor(
    config: LLMProviderConfig,
    extendedConfig?: Partial<ExtendedProviderConfig>,
    providerName: string = 'Anthropic'
  ) {
    super({
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    }, extendedConfig);
    this.providerName = providerName;
  }

  get name(): string {
    return this.providerName;
  }

  get apiFormat(): ApiFormat {
    return 'anthropic';
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      // Anthropic doesn't have a models endpoint, so we test with a minimal request
      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      
      // Even a 400 error means we connected successfully
      return response.ok || response.status === 400 || response.status === 401;
    } catch (error) {
      console.error(`[${this.name}] Connection test failed:`, error);
      return false;
    }
  }

  async fetchModels(): Promise<LLMModel[]> {
    // Return cached models if still valid
    if (this.modelsCache && Date.now() - this.modelsCacheTime < this.CACHE_TTL) {
      return this.modelsCache;
    }

    // Anthropic doesn't have a public models endpoint, return known models
    this.modelsCache = this.getDefaultModels();
    this.modelsCacheTime = Date.now();
    return this.modelsCache;
  }

  private getDefaultModels(): LLMModel[] {
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextLength: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextLength: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextLength: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextLength: 200000 },
    ];
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.isConfigured()) {
      throw this.createError('NOT_CONFIGURED', 'Anthropic API key not configured', false);
    }

    const controller = this.createAbortController(options.signal);

    // Convert messages to Anthropic format
    const { systemMessage, messages } = this.convertMessages(options.messages);

    const response = await this.fetchWithRetry(
      `${this.config.baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          system: systemMessage,
          messages,
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json() as AnthropicMessage;

    const content = data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
      finishReason: data.stop_reason || 'stop',
      model: data.model,
    };
  }

  async stream(
    options: LLMRequestOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    if (!this.isConfigured()) {
      throw this.createError('NOT_CONFIGURED', 'Anthropic API key not configured', false);
    }

    const controller = this.createAbortController(options.signal);

    // Convert messages to Anthropic format
    const { systemMessage, messages } = this.convertMessages(options.messages);

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
        system: systemMessage,
        messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw this.createError(`HTTP_${response.status}`, errorText, response.status >= 500);
    }

    if (!response.body) {
      throw this.createError('NO_BODY', 'Response body is empty', false);
    }

    const reader = response.body.getReader();
    let fullContent = '';
    let finishReason = 'stop';
    let model = options.model;
    let tokensUsed = 0;

    try {
      for await (const data of this.parseSSEStream(reader)) {
        try {
          const event = JSON.parse(data) as AnthropicStreamEvent;
          
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullContent += event.delta.text;
            onChunk({ content: event.delta.text, done: false });
          }
          
          if (event.type === 'message_delta' && event.delta?.stop_reason) {
            finishReason = event.delta.stop_reason;
          }

          if (event.type === 'message_delta' && event.usage) {
            tokensUsed = event.usage.output_tokens;
          }

          if (event.type === 'message_start' && event.message) {
            model = event.message.model;
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }

      onChunk({ content: '', done: true });

      // Estimate tokens if not provided by the API
      const estimatedTokens = tokensUsed > 0 ? tokensUsed : countTokens(fullContent);

      return {
        content: fullContent,
        tokensUsed: estimatedTokens,
        finishReason,
        model,
      };
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Convert OpenAI-style messages to Anthropic format
   */
  private convertMessages(messages: Array<{ role: string; content: string }>): {
    systemMessage: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    let systemMessage = '';
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemMessage += (systemMessage ? '\n' : '') + msg.content;
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Ensure first message is from user (Anthropic requirement)
    if (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
      anthropicMessages.unshift({
        role: 'user',
        content: 'Please continue.',
      });
    }

    return { systemMessage, messages: anthropicMessages };
  }

  /**
   * Clear the models cache
   */
  clearModelsCache(): void {
    this.modelsCache = null;
    this.modelsCacheTime = 0;
  }
}

