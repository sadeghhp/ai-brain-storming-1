// ============================================
// AI Brainstorm - OpenRouter Provider
// Version: 1.0.0
// ============================================

import { BaseLLMProvider } from './base-provider';
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
  OpenRouterModel,
  OpenRouterResponse,
  OpenRouterStreamChunk,
} from '../types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter LLM Provider
 * Provides access to multiple models through a unified API
 */
export class OpenRouterProvider extends BaseLLMProvider {
  private modelsCache: LLMModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(config: LLMProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    });
  }

  get name(): string {
    return 'OpenRouter';
  }

  get type(): 'openrouter' {
    return 'openrouter';
  }

  isConfigured(): boolean {
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
      return response.ok;
    } catch (error) {
      console.error('[OpenRouter] Connection test failed:', error);
      return false;
    }
  }

  async getModels(): Promise<LLMModel[]> {
    // Return cached models if still valid
    if (this.modelsCache && Date.now() - this.modelsCacheTime < this.CACHE_TTL) {
      return this.modelsCache;
    }

    if (!this.isConfigured()) {
      // Return popular models without API key
      return this.getDefaultModels();
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        console.warn('[OpenRouter] Failed to fetch models, using defaults');
        return this.getDefaultModels();
      }

      const data = await response.json() as { data: OpenRouterModel[] };
      
      this.modelsCache = data.data.map(model => ({
        id: model.id,
        name: model.name,
        contextLength: model.context_length,
        description: model.description,
        pricing: {
          prompt: parseFloat(model.pricing.prompt) * 1000000,
          completion: parseFloat(model.pricing.completion) * 1000000,
        },
      }));

      this.modelsCacheTime = Date.now();
      return this.modelsCache;
    } catch (error) {
      console.error('[OpenRouter] Error fetching models:', error);
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): LLMModel[] {
    return [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
      { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', contextLength: 200000 },
      { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', contextLength: 200000 },
      { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', contextLength: 128000 },
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextLength: 128000 },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128000 },
      { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', contextLength: 2800000 },
      { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', contextLength: 131072 },
      { id: 'mistralai/mistral-large', name: 'Mistral Large', contextLength: 128000 },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', contextLength: 64000 },
    ];
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.isConfigured()) {
      throw this.createError('NOT_CONFIGURED', 'OpenRouter API key not configured', false);
    }

    const controller = this.createAbortController(options.signal);

    const response = await this.fetchWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'AI Brainstorm',
        },
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json() as OpenRouterResponse;

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
      finishReason: data.choices[0]?.finish_reason || 'stop',
      model: data.model,
    };
  }

  async stream(
    options: LLMRequestOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    if (!this.isConfigured()) {
      throw this.createError('NOT_CONFIGURED', 'OpenRouter API key not configured', false);
    }

    const controller = this.createAbortController(options.signal);

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'AI Brainstorm',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 0.7,
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

    try {
      for await (const data of this.parseSSEStream(reader)) {
        try {
          const parsed = JSON.parse(data) as OpenRouterStreamChunk;
          const delta = parsed.choices[0]?.delta;
          
          if (delta?.content) {
            fullContent += delta.content;
            onChunk({ content: delta.content, done: false });
          }

          if (parsed.choices[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }

      onChunk({ content: '', done: true });

      return {
        content: fullContent,
        tokensUsed: 0, // Not available in streaming
        finishReason,
        model,
      };
    } finally {
      reader.releaseLock();
    }
  }
}

