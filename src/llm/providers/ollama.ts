// ============================================
// AI Brainstorm - Ollama Provider
// ============================================

import { BaseLLMProvider, type ExtendedProviderConfig } from './base-provider';
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
  OllamaModel,
  OllamaChatRequest,
  OllamaChatResponse,
} from '../types';
import type { ApiFormat } from '../../types';

const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Ollama LLM Provider
 * Connects to local Ollama instance for running local models
 */
export class OllamaProvider extends BaseLLMProvider {
  private modelsCache: LLMModel[] | null = null;
  private modelsCacheTime: number = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1 minute (local, so faster refresh)
  private corsWarningShown = false;
  private providerName: string;

  constructor(
    config: LLMProviderConfig,
    extendedConfig?: Partial<ExtendedProviderConfig>,
    providerName: string = 'Ollama'
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
    return 'ollama';
  }

  isConfigured(): boolean {
    // Ollama doesn't need an API key
    return true;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (!response.ok) {
        return false;
      }

      // Reset CORS warning flag on successful connection
      this.corsWarningShown = false;
      return true;
    } catch (error) {
      this.handleConnectionError(error);
      return false;
    }
  }

  private handleConnectionError(error: unknown): void {
    if (error instanceof TypeError && !this.corsWarningShown) {
      this.corsWarningShown = true;
      console.warn(`
[Ollama] Connection failed - likely a CORS issue.
To fix this, start Ollama with CORS enabled:

Windows (PowerShell):
  $env:OLLAMA_ORIGINS="*"; ollama serve

macOS/Linux:
  OLLAMA_ORIGINS=* ollama serve

Or set it permanently in your environment variables.
      `);
    } else {
      console.error('[Ollama] Connection error:', error);
    }
  }

  async fetchModels(): Promise<LLMModel[]> {
    // Return cached models if still valid
    if (this.modelsCache && Date.now() - this.modelsCacheTime < this.CACHE_TTL) {
      return this.modelsCache;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn('[Ollama] Failed to fetch models');
        return [];
      }

      const data = await response.json() as { models: OllamaModel[] };
      
      this.modelsCache = data.models.map(model => ({
        id: model.name,
        name: this.formatModelName(model.name),
        contextLength: this.estimateContextLength(model),
        description: model.details
          ? `${model.details.family} - ${model.details.parameter_size}`
          : undefined,
      }));

      this.modelsCacheTime = Date.now();
      return this.modelsCache;
    } catch (error) {
      this.handleConnectionError(error);
      return [];
    }
  }

  private formatModelName(name: string): string {
    // Convert "llama3.2:latest" to "Llama 3.2"
    return name
      .replace(/:latest$/, '')
      .replace(/([a-z])(\d)/gi, '$1 $2')
      .replace(/^(\w)/, (_, c) => c.toUpperCase())
      .replace(/-/g, ' ');
  }

  private estimateContextLength(model: OllamaModel): number {
    // Estimate based on model name/size
    const name = model.name.toLowerCase();
    
    if (name.includes('llama3') || name.includes('llama-3')) {
      return 128000;
    }
    if (name.includes('mistral') || name.includes('mixtral')) {
      return 32768;
    }
    if (name.includes('gemma')) {
      return 8192;
    }
    if (name.includes('phi')) {
      return 4096;
    }
    if (name.includes('qwen')) {
      return 32768;
    }
    
    // Default context length
    return 4096;
  }

  async complete(options: LLMRequestOptions): Promise<LLMResponse> {
    const controller = this.createAbortController(options.signal);

    const request: OllamaChatRequest = {
      model: options.model,
      messages: options.messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 4096,
      },
    };

    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }
      );

      const data = await response.json() as OllamaChatResponse;

      return {
        content: data.message?.content || '',
        tokensUsed: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        finishReason: data.done ? 'stop' : 'length',
        model: data.model,
      };
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  async stream(
    options: LLMRequestOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    const controller = this.createAbortController(options.signal);

    const request: OllamaChatRequest = {
      model: options.model,
      messages: options.messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 4096,
      },
    };

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
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
      const decoder = new TextDecoder();
      let fullContent = '';
      let tokensUsed = 0;
      let model = options.model;

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const parsed = JSON.parse(line) as OllamaChatResponse;
              
              if (parsed.message?.content) {
                fullContent += parsed.message.content;
                onChunk({ content: parsed.message.content, done: false });
              }

              if (parsed.done) {
                tokensUsed = (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0);
                model = parsed.model;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }

        onChunk({ content: '', done: true });

        return {
          content: fullContent,
          tokensUsed,
          finishReason: 'stop',
          model,
        };
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
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

