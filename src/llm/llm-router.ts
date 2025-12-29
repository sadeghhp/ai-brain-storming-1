// ============================================
// AI Brainstorm - LLM Router
// ============================================

import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OllamaProvider } from './providers/ollama';
import { BaseLLMProvider, type ExtendedProviderConfig } from './providers/base-provider';
import { providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type {
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMModel,
  LLMProviderConfig,
} from './types';
import type { LLMProvider as LLMProviderEntity, ApiFormat, ProviderModel } from '../types';

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
   * Create a provider instance based on API format
   */
  private createProvider(entity: LLMProviderEntity): BaseLLMProvider | null {
    const config: LLMProviderConfig = {
      apiKey: entity.apiKey,
      baseUrl: entity.baseUrl,
    };

    const extendedConfig: Partial<ExtendedProviderConfig> = {
      autoFetchModels: entity.autoFetchModels,
      userModels: entity.models,
    };

    switch (entity.apiFormat) {
      case 'openai':
        return new OpenAIProvider(config, extendedConfig, entity.name);
      case 'anthropic':
        return new AnthropicProvider(config, extendedConfig, entity.name);
      case 'ollama':
        return new OllamaProvider(config, extendedConfig, entity.name);
      default:
        console.warn(`[LLMRouter] Unknown API format: ${entity.apiFormat}`);
        return null;
    }
  }

  /**
   * Register a provider from storage entity
   */
  registerProvider(entity: LLMProviderEntity): void {
    const provider = this.createProvider(entity);
    if (provider) {
      this.providers.set(entity.id, provider);
    }
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
   * Sync provider's user models from storage
   */
  async syncProviderModels(id: string): Promise<void> {
    const provider = this.providers.get(id);
    const entity = await providerStorage.getById(id);
    
    if (provider && entity) {
      provider.setUserModels(entity.models);
      provider.setAutoFetchModels(entity.autoFetchModels);
      this.modelsCache.delete(id);
    }
  }

  /**
   * Reload a provider (re-create with updated settings)
   */
  async reloadProvider(id: string): Promise<void> {
    const entity = await providerStorage.getById(id);
    if (!entity) {
      console.warn(`[LLMRouter] Provider not found: ${id}`);
      return;
    }

    // Abort any ongoing requests
    const oldProvider = this.providers.get(id);
    oldProvider?.abort();

    // Create new provider with updated settings
    const newProvider = this.createProvider(entity);
    if (newProvider) {
      this.providers.set(id, newProvider);
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
   * Fetch models from a provider and return as ProviderModel[] for storage
   * This is used to auto-fetch models and persist them in provider storage
   */
  async fetchModelsForStorage(providerId: string): Promise<ProviderModel[]> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      console.warn(`[LLMRouter] Provider not found: ${providerId}`);
      return [];
    }

    try {
      // Use the provider's direct fetchModels() to get fresh models from API
      const llmModels = await provider.fetchModels();
      
      // Convert LLMModel[] to ProviderModel[] for storage
      const providerModels: ProviderModel[] = llmModels.map(m => ({
        id: m.id,
        name: m.name,
        contextLength: m.contextLength,
        isCustom: false, // Auto-fetched models are not custom
      }));

      // Sort by name
      providerModels.sort((a, b) => a.name.localeCompare(b.name));

      // Clear cache so next getModels() will include these
      this.modelsCache.delete(providerId);

      return providerModels;
    } catch (error) {
      console.error(`[LLMRouter] Failed to fetch models for provider ${providerId}:`, error);
      return [];
    }
  }

  /**
   * Check if a provider supports model auto-fetching
   * (i.e., has a working fetchModels implementation)
   */
  canAutoFetchModels(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    return provider?.isConfigured() ?? false;
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
  async createNewProvider(
    name: string,
    apiFormat: ApiFormat,
    baseUrl: string,
    apiKey?: string,
    autoFetchModels: boolean = true
  ): Promise<LLMProviderEntity> {
    const entity = await providerStorage.create({
      name,
      apiFormat,
      baseUrl,
      apiKey,
      autoFetchModels,
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

