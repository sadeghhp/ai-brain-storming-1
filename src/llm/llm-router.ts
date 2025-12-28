// ============================================
// AI Brainstorm - LLM Router
// Version: 1.0.0
// ============================================

import { OpenRouterProvider } from './providers/openrouter';
import { OllamaProvider } from './providers/ollama';
import { BaseLLMProvider } from './providers/base-provider';
import { providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
} from './types';
import type { LLMProvider as LLMProviderEntity, LLMProviderType } from '../types';

/**
 * LLM Router - Routes requests to the appropriate provider
 */
class LLMRouterService {
  private providers: Map<string, BaseLLMProvider> = new Map();
  private modelsCache: Map<string, LLMModel[]> = new Map();
  private initialized = false;

  /**
   * Initialize the router with stored providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const storedProviders = await providerStorage.getAll();

    for (const provider of storedProviders) {
      this.registerProvider(provider);
    }

    this.initialized = true;
    console.log(`[LLMRouter] Initialized with ${this.providers.size} providers`);
  }

  /**
   * Register a provider from storage entity
   */
  registerProvider(entity: LLMProviderEntity): void {
    const config: LLMProviderConfig = {
      apiKey: entity.apiKey,
      baseUrl: entity.baseUrl,
    };

    let provider: BaseLLMProvider;

    switch (entity.type) {
      case 'openrouter':
        provider = new OpenRouterProvider(config);
        break;
      case 'ollama':
        provider = new OllamaProvider(config);
        break;
      default:
        console.warn(`[LLMRouter] Unknown provider type: ${entity.type}`);
        return;
    }

    this.providers.set(entity.id, provider);
  }

  /**
   * Update a provider's configuration
   */
  async updateProvider(id: string, config: Partial<LLMProviderConfig>): Promise<void> {
    const provider = this.providers.get(id);
    if (provider) {
      provider.updateConfig(config);
      
      // Update in storage
      await providerStorage.update(id, config);
      
      // Clear models cache for this provider
      this.modelsCache.delete(id);
    }
  }

  /**
   * Test a provider's connection
   */
  async testProvider(id: string): Promise<boolean> {
    const provider = this.providers.get(id);
    if (!provider) {
      console.warn(`[LLMRouter] Provider not found: ${id}`);
      return false;
    }

    const success = await provider.testConnection();

    if (success) {
      await providerStorage.setActive(id, true);
      eventBus.emit('provider:connected', id);
    } else {
      await providerStorage.setActive(id, false);
      eventBus.emit('provider:disconnected', id);
    }

    return success;
  }

  /**
   * Get available models from a provider
   */
  async getModels(providerId: string): Promise<LLMModel[]> {
    // Check cache first
    const cached = this.modelsCache.get(providerId);
    if (cached) {
      return cached;
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      console.warn(`[LLMRouter] Provider not found: ${providerId}`);
      return [];
    }

    const models = await provider.getModels();
    this.modelsCache.set(providerId, models);

    return models;
  }

  /**
   * Get all models from all active providers
   */
  async getAllModels(): Promise<Map<string, LLMModel[]>> {
    const result = new Map<string, LLMModel[]>();
    const activeProviders = await providerStorage.getActive();

    for (const entity of activeProviders) {
      const models = await this.getModels(entity.id);
      result.set(entity.id, models);
    }

    return result;
  }

  /**
   * Check if a provider is configured
   */
  isConfigured(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    return provider?.isConfigured() ?? false;
  }

  /**
   * Send a completion request
   */
  async complete(providerId: string, options: LLMRequestOptions): Promise<LLMResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    return provider.complete(options);
  }

  /**
   * Send a streaming completion request
   */
  async stream(
    providerId: string,
    options: LLMRequestOptions,
    onChunk: (chunk: LLMStreamChunk) => void
  ): Promise<LLMResponse> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    return provider.stream(options, onChunk);
  }

  /**
   * Abort any ongoing request for a provider
   */
  abort(providerId: string): void {
    const provider = this.providers.get(providerId);
    provider?.abort();
  }

  /**
   * Abort all ongoing requests
   */
  abortAll(): void {
    for (const provider of this.providers.values()) {
      provider.abort();
    }
  }

  /**
   * Get provider by ID
   */
  getProvider(id: string): BaseLLMProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all registered provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Create a new provider
   */
  async createProvider(
    name: string,
    type: LLMProviderType,
    baseUrl: string,
    apiKey?: string
  ): Promise<LLMProviderEntity> {
    const entity = await providerStorage.create({
      name,
      type,
      baseUrl,
      apiKey,
    });

    this.registerProvider(entity);
    return entity;
  }

  /**
   * Delete a provider
   */
  async deleteProvider(id: string): Promise<void> {
    const provider = this.providers.get(id);
    provider?.abort();
    
    this.providers.delete(id);
    this.modelsCache.delete(id);
    
    await providerStorage.delete(id);
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.modelsCache.clear();
  }
}

// Singleton instance
export const llmRouter = new LLMRouterService();

