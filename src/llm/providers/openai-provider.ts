// ============================================
// AI Brainstorm - OpenAI-Compatible Provider
// Version: 1.0.0
// ============================================

import { BaseLLMProvider, type ExtendedProviderConfig } from './base-provider';
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
  OpenRouterResponse,
  OpenRouterStreamChunk,
} from '../types';
import type { ApiFormat } from '../../types';

/**
 * OpenAI-Compatible LLM Provider
 * Works with OpenRouter, vLLM, LM Studio, LocalAI, and any OpenAI-compatible API
 */
export class OpenAIProvider extends BaseLLMProvider {
  private modelsCache: LLMModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private providerName: string;

  constructor(
    config: LLMProviderConfig,
    extendedConfig?: Partial<ExtendedProviderConfig>,
    providerName: string = 'OpenAI-Compatible'
  ) {
    super(config, extendedConfig);
    this.providerName = providerName;
  }

  get name(): string {
    return this.providerName;
  }

  get apiFormat(): ApiFormat {
    return 'openai';
  }

  isConfigured(): boolean {
    // Some OpenAI-compatible APIs don't require API keys (local servers)
    // Return true if baseUrl is set
    return !!this.config.baseUrl;
  }

  async testConnection(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
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

    if (!this.isConfigured()) {
      return this.getDefaultModels();
    }

    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[${this.name}] Failed to fetch models, using defaults`);
        return this.getDefaultModels();
      }

      const data = await response.json() as { data: Array<{ id: string; context_length?: number; name?: string }> };
      
      this.modelsCache = data.data.map(model => ({
        id: model.id,
        name: model.name || model.id,
        contextLength: model.context_length || 4096,
      }));

      this.modelsCacheTime = Date.now();
      return this.modelsCache;
    } catch (error) {
      console.error(`[${this.name}] Error fetching models:`, error);
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): LLMModel[] {
    // Common OpenAI models as fallback
    return [
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextLength: 128000 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextLength: 16385 },
    ];
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.isConfigured()) {
      throw this.createError('NOT_CONFIGURED', 'Provider not configured', false);
    }

    const controller = this.createAbortController(options.signal);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await this.fetchWithRetry(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers,
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
      throw this.createError('NOT_CONFIGURED', 'Provider not configured', false);
    }

    const controller = this.createAbortController(options.signal);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
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
      const hint =
        response.status === 404
          ? `Endpoint not found. Check this provider's Base URL.\n` +
            `This app expects OpenAI-style endpoints at:\n` +
            `- ${this.config.baseUrl}/models\n` +
            `- ${this.config.baseUrl}/chat/completions\n`
          : '';
      throw this.createError(`HTTP_${response.status}`, hint ? `${hint}\n${errorText}` : errorText, response.status >= 500);
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

  /**
   * Clear the models cache
   */
  clearModelsCache(): void {
    this.modelsCache = null;
    this.modelsCacheTime = 0;
  }
}

