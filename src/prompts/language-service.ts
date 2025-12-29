// ============================================
// AI Brainstorm - Language Service
// Version: 1.1.0
// ============================================

import type { PromptTemplates, TemplateParams, LanguageCode } from './types';
import englishPrompts from './en.json';
import persianPrompts from './persian.json';
import { llmRouter } from '../llm/llm-router';

const PROMPTS_DB_NAME = 'PromptTemplatesDB';
const PROMPTS_STORE_NAME = 'templates';

// Bundled prompt packs shipped with the app (always available, no IndexedDB needed)
const BUNDLED_PROMPTS: Record<string, PromptTemplates> = {
  '': englishPrompts as PromptTemplates,
  Persian: persianPrompts as PromptTemplates,
};

/**
 * Translation progress event
 */
export interface TranslationProgress {
  languageCode: string;
  languageName: string;
  progress: number; // 0-100
  currentSection: string;
  status: 'translating' | 'completed' | 'failed';
  error?: string;
}

/**
 * LanguageService - Manages prompt templates for different languages
 * 
 * English is the master language (bundled with app).
 * Other languages are translated via LLM on first use and cached in IndexedDB.
 */
class LanguageServiceImpl {
  private cache: Map<string, PromptTemplates> = new Map();
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    // Initialize bundled prompts in cache
    for (const [code, prompts] of Object.entries(BUNDLED_PROMPTS)) {
      this.cache.set(code, prompts);
    }
    
    // Initialize IndexedDB for other languages
    this.dbReady = this.initDB();
  }

  /**
   * Initialize IndexedDB for storing translated prompts
   */
  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PROMPTS_DB_NAME, 1);
      
      request.onerror = () => {
        console.error('[LanguageService] Failed to open IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[LanguageService] IndexedDB initialized');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(PROMPTS_STORE_NAME)) {
          db.createObjectStore(PROMPTS_STORE_NAME, { keyPath: 'language' });
        }
      };
    });
  }

  /**
   * Get English prompts (master/base language)
   */
  getEnglishPrompts(): PromptTemplates {
    return BUNDLED_PROMPTS[''];
  }

  /**
   * Get prompts synchronously from cache
   * Returns English if language not cached
   * Use this for synchronous code paths, but ensure language is pre-loaded
   */
  getPromptsSync(languageCode: LanguageCode | string): PromptTemplates {
    // Bundled languages (always available)
    if (!languageCode) return this.getEnglishPrompts();
    if (languageCode in BUNDLED_PROMPTS) return BUNDLED_PROMPTS[languageCode];

    // Check cache
    if (this.cache.has(languageCode)) {
      return this.cache.get(languageCode)!;
    }

    // Fallback to English
    console.warn(`[LanguageService] Language "${languageCode}" not in cache, using English`);
    return this.getEnglishPrompts();
  }

  /**
   * Pre-load prompts for a language (async)
   * Call this before using getPromptsSync to ensure language is available
   */
  async preloadLanguage(languageCode: LanguageCode | string): Promise<boolean> {
    // Bundled languages are always available
    if (!languageCode) return true;
    if (languageCode in BUNDLED_PROMPTS) return true;

    if (this.cache.has(languageCode)) {
      return true;
    }

    await this.dbReady;
    const stored = await this.loadFromDB(languageCode);
    
    if (stored) {
      this.cache.set(languageCode, stored);
      return true;
    }

    return false;
  }

  /**
   * Get prompts for a specific language
   * Returns English if language not available
   */
  async getPrompts(languageCode: LanguageCode | string): Promise<PromptTemplates> {
    // Bundled languages (always available)
    if (!languageCode) return this.getEnglishPrompts();
    if (languageCode in BUNDLED_PROMPTS) return BUNDLED_PROMPTS[languageCode];

    // Check cache first
    if (this.cache.has(languageCode)) {
      return this.cache.get(languageCode)!;
    }

    // Try to load from IndexedDB
    await this.dbReady;
    const stored = await this.loadFromDB(languageCode);
    
    if (stored) {
      this.cache.set(languageCode, stored);
      return stored;
    }

    // Language not available - return English as fallback
    console.warn(`[LanguageService] Language "${languageCode}" not available, using English`);
    return this.getEnglishPrompts();
  }

  /**
   * Check if a language is available (has translated prompts)
   */
  async isLanguageAvailable(languageCode: LanguageCode | string): Promise<boolean> {
    // Bundled languages are always available
    if (!languageCode) return true;
    if (languageCode in BUNDLED_PROMPTS) return true;

    // Check cache
    if (this.cache.has(languageCode)) {
      return true;
    }

    // Check IndexedDB
    await this.dbReady;
    const stored = await this.loadFromDB(languageCode);
    return stored !== null;
  }

  /**
   * Get list of available (already translated) languages
   */
  async getAvailableLanguages(): Promise<string[]> {
    const languages = [''];  // English always available
    
    await this.dbReady;
    
    return new Promise((resolve) => {
      if (!this.db) {
        resolve(languages);
        return;
      }

      const transaction = this.db.transaction(PROMPTS_STORE_NAME, 'readonly');
      const store = transaction.objectStore(PROMPTS_STORE_NAME);
      const request = store.getAllKeys();
      
      request.onsuccess = () => {
        const keys = request.result as string[];
        resolve([...languages, ...keys]);
      };
      
      request.onerror = () => {
        resolve(languages);
      };
    });
  }

  /**
   * Translate prompts to a new language using LLM
   * @param targetLanguageCode The language code to translate to
   * @param targetLanguageName The display name of the language
   * @param onProgress Optional callback for progress updates
   * @param providerId Optional LLM provider ID (will be passed to llmRouter)
   * @param modelId Optional model ID (will be passed to llmRouter)
   */
  async translateLanguage(
    targetLanguageCode: string,
    targetLanguageName: string,
    onProgress?: (progress: TranslationProgress) => void,
    providerId?: string,
    modelId?: string
  ): Promise<PromptTemplates> {
    const english = this.getEnglishPrompts();
    
    // For translation, we need a provider and model - try to find available ones
    const providerIds = llmRouter.getProviderIds();
    if (providerIds.length === 0) {
      throw new Error('No LLM provider configured. Please configure a provider in settings.');
    }
    
    // Use provided IDs or first available
    const effectiveProviderId = providerId || providerIds[0];
    const provider = llmRouter.getProvider(effectiveProviderId);
    
    if (!provider) {
      throw new Error(`Provider ${effectiveProviderId} not found.`);
    }
    
    // Get first available model from the provider's config
    const effectiveModelId = modelId || 'gpt-4o-mini'; // Default to a common model

    const emitProgress = (progress: number, section: string, status: 'translating' | 'completed' | 'failed' = 'translating') => {
      const event: TranslationProgress = {
        languageCode: targetLanguageCode,
        languageName: targetLanguageName,
        progress,
        currentSection: section,
        status,
      };
      onProgress?.(event);
    };

    emitProgress(0, 'Starting translation...');

    try {
      // Create translated template structure
      const translated: PromptTemplates = {
        version: english.version,
        language: targetLanguageCode,
        languageName: targetLanguageName,
        agent: await this.translateAgentPrompts(english.agent, targetLanguageName, effectiveProviderId, effectiveModelId, (p: number) => emitProgress(p * 0.3, 'Agent prompts')),
        secretary: await this.translateSecretaryPrompts(english.secretary, targetLanguageName, effectiveProviderId, effectiveModelId, (p: number) => emitProgress(30 + p * 0.35, 'Secretary prompts')),
        strategies: await this.translateStrategyPrompts(english.strategies, targetLanguageName, effectiveProviderId, effectiveModelId, (p: number) => emitProgress(65 + p * 0.2, 'Strategy prompts')),
        context: await this.translateContextPrompts(english.context, targetLanguageName, effectiveProviderId, effectiveModelId, (p: number) => emitProgress(85 + p * 0.15, 'Context prompts')),
      };

      // Save to IndexedDB
      await this.saveToDB(translated);
      
      // Update cache
      this.cache.set(targetLanguageCode, translated);

      emitProgress(100, 'Translation complete', 'completed');
      
      return translated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      emitProgress(0, errorMessage, 'failed');
      throw error;
    }
  }

  /**
   * Delete a translated language from storage
   */
  async deleteLanguage(languageCode: string): Promise<void> {
    if (!languageCode || languageCode === '') {
      throw new Error('Cannot delete English prompts');
    }

    this.cache.delete(languageCode);
    
    await this.dbReady;
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PROMPTS_STORE_NAME);
      const request = store.delete(languageCode);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // Template Interpolation
  // ============================================

  /**
   * Interpolate template variables in a string
   * @param template Template string with {variable} placeholders
   * @param params Key-value pairs for substitution
   */
  interpolate(template: string, params: TemplateParams): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  // ============================================
  // Private Methods
  // ============================================

  private async loadFromDB(languageCode: string): Promise<PromptTemplates | null> {
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(PROMPTS_STORE_NAME, 'readonly');
      const store = transaction.objectStore(PROMPTS_STORE_NAME);
      const request = store.get(languageCode);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        resolve(null);
      };
    });
  }

  private async saveToDB(prompts: PromptTemplates): Promise<void> {
    await this.dbReady;
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(PROMPTS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(PROMPTS_STORE_NAME);
      const request = store.put(prompts);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // Translation Methods (LLM-based)
  // ============================================

  private async translateText(
    text: string,
    targetLanguage: string,
    providerId: string,
    modelId: string
  ): Promise<string> {
    const response = await llmRouter.complete(providerId, {
      model: modelId,
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${targetLanguage}. 
Preserve all placeholders like {variable} exactly as they are - do not translate content inside curly braces.
Preserve markdown formatting, line breaks, and special characters.
Only output the translated text, nothing else.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.3,
      maxTokens: 2000,
    });
    
    return response.content.trim();
  }

  private async translateStringRecord<T>(
    obj: T,
    targetLanguage: string,
    providerId: string,
    modelId: string
  ): Promise<T> {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(obj as Record<string, unknown>);
    
    for (const [key, value] of entries) {
      if (typeof value === 'string') {
        result[key] = await this.translateText(value, targetLanguage, providerId, modelId);
      } else {
        result[key] = value;
      }
    }
    
    return result as T;
  }

  private async translateAgentPrompts(
    agent: PromptTemplates['agent'],
    targetLanguage: string,
    providerId: string,
    modelId: string,
    onProgress: (progress: number) => void
  ): Promise<PromptTemplates['agent']> {
    onProgress(0);
    
    const [
      coreIdentity,
      conversationContext,
      goalTemplate,
      secretaryRole,
    ] = await Promise.all([
      this.translateText(agent.coreIdentity, targetLanguage, providerId, modelId),
      this.translateText(agent.conversationContext, targetLanguage, providerId, modelId),
      this.translateText(agent.goalTemplate, targetLanguage, providerId, modelId),
      this.translateText(agent.secretaryRole, targetLanguage, providerId, modelId),
    ]);
    onProgress(25);
    
    const thinkingDepth = await this.translateStringRecord(agent.thinkingDepth, targetLanguage, providerId, modelId);
    onProgress(40);
    
    const creativityGuidance = await this.translateStringRecord(agent.creativityGuidance, targetLanguage, providerId, modelId);
    onProgress(55);
    
    const wordLimit = await this.translateStringRecord(agent.wordLimit, targetLanguage, providerId, modelId);
    
    // Translate depth configs
    const depthConfigs: PromptTemplates['agent']['depthConfigs'] = {
      brief: await this.translateStringRecord(agent.depthConfigs.brief, targetLanguage, providerId, modelId),
      concise: await this.translateStringRecord(agent.depthConfigs.concise, targetLanguage, providerId, modelId),
      standard: await this.translateStringRecord(agent.depthConfigs.standard, targetLanguage, providerId, modelId),
      detailed: await this.translateStringRecord(agent.depthConfigs.detailed, targetLanguage, providerId, modelId),
      deep: await this.translateStringRecord(agent.depthConfigs.deep, targetLanguage, providerId, modelId),
    };
    onProgress(75);
    
    const [
      plainTextRules,
      languageRequirement,
      interactionGuidelines,
      strategyApproach,
    ] = await Promise.all([
      this.translateText(agent.plainTextRules, targetLanguage, providerId, modelId),
      this.translateText(agent.languageRequirement, targetLanguage, providerId, modelId),
      this.translateText(agent.interactionGuidelines, targetLanguage, providerId, modelId),
      this.translateText(agent.strategyApproach, targetLanguage, providerId, modelId),
    ]);
    onProgress(100);
    
    return {
      coreIdentity,
      conversationContext,
      goalTemplate,
      secretaryRole,
      thinkingDepth,
      creativityGuidance,
      wordLimit,
      depthConfigs,
      plainTextRules,
      languageRequirement,
      interactionGuidelines,
      strategyApproach,
    };
  }

  private async translateSecretaryPrompts(
    secretary: PromptTemplates['secretary'],
    targetLanguage: string,
    providerId: string,
    modelId: string,
    onProgress: (progress: number) => void
  ): Promise<PromptTemplates['secretary']> {
    onProgress(0);
    
    const neutralityPrompt = await this.translateText(secretary.neutralityPrompt, targetLanguage, providerId, modelId);
    onProgress(10);
    
    const roundDecisionFallbacks = await this.translateStringRecord(secretary.roundDecisionFallbacks, targetLanguage, providerId, modelId);
    onProgress(15);
    
    const [
      roundSummarySystem,
      roundAnalysisSystem,
      summarySystem,
      summarySystemWithLanguage,
      summaryUser,
    ] = await Promise.all([
      this.translateText(secretary.roundSummarySystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.roundAnalysisSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.summarySystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.summarySystemWithLanguage, targetLanguage, providerId, modelId),
      this.translateText(secretary.summaryUser, targetLanguage, providerId, modelId),
    ]);
    onProgress(35);
    
    const [
      noteExtractionSystem,
      noteExtractionUser,
      executiveSummarySystem,
      finalExecutiveSummarySystem,
      themeExtractionSystem,
    ] = await Promise.all([
      this.translateText(secretary.noteExtractionSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.noteExtractionUser, targetLanguage, providerId, modelId),
      this.translateText(secretary.executiveSummarySystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.finalExecutiveSummarySystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.themeExtractionSystem, targetLanguage, providerId, modelId),
    ]);
    onProgress(55);
    
    const [
      consensusExtractionSystem,
      disagreementExtractionSystem,
      recommendationsExtractionSystem,
      actionItemsExtractionSystem,
      openQuestionsExtractionSystem,
    ] = await Promise.all([
      this.translateText(secretary.consensusExtractionSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.disagreementExtractionSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.recommendationsExtractionSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.actionItemsExtractionSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.openQuestionsExtractionSystem, targetLanguage, providerId, modelId),
    ]);
    onProgress(70);
    
    const [
      incrementalUpdateSystem,
      incrementalUpdateUser,
      statusUpdateSystem,
      distillationSystem,
      distillationUser,
    ] = await Promise.all([
      this.translateText(secretary.incrementalUpdateSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.incrementalUpdateUser, targetLanguage, providerId, modelId),
      this.translateText(secretary.statusUpdateSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.distillationSystem, targetLanguage, providerId, modelId),
      this.translateText(secretary.distillationUser, targetLanguage, providerId, modelId),
    ]);
    onProgress(85);
    
    const resultDocument = await this.translateStringRecord(secretary.resultDocument, targetLanguage, providerId, modelId);
    const defaults = await this.translateStringRecord(secretary.defaults, targetLanguage, providerId, modelId);
    onProgress(100);
    
    return {
      neutralityPrompt,
      roundDecisionFallbacks,
      roundSummarySystem,
      roundAnalysisSystem,
      summarySystem,
      summarySystemWithLanguage,
      summaryUser,
      noteExtractionSystem,
      noteExtractionUser,
      executiveSummarySystem,
      finalExecutiveSummarySystem,
      themeExtractionSystem,
      consensusExtractionSystem,
      disagreementExtractionSystem,
      recommendationsExtractionSystem,
      actionItemsExtractionSystem,
      openQuestionsExtractionSystem,
      incrementalUpdateSystem,
      incrementalUpdateUser,
      statusUpdateSystem,
      resultDocument,
      distillationSystem,
      distillationUser,
      defaults,
    };
  }

  private async translateStrategyPrompts(
    strategies: PromptTemplates['strategies'],
    targetLanguage: string,
    providerId: string,
    modelId: string,
    onProgress: (progress: number) => void
  ): Promise<PromptTemplates['strategies']> {
    const strategyKeys = [
      'open-brainstorm',
      'structured-debate',
      'decision-matrix',
      'problem-first',
      'expert-deep-dive',
      'devils-advocate',
    ] as const;
    
    const result: Partial<PromptTemplates['strategies']> = {};
    
    for (let i = 0; i < strategyKeys.length; i++) {
      const key = strategyKeys[i];
      const strategy = strategies[key];
      
      const [
        name,
        description,
        shortDescription,
        openingPromptTemplate,
        groundRulesTemplate,
        agentInstructions,
        firstTurnPrompt,
      ] = await Promise.all([
        this.translateText(strategy.name, targetLanguage, providerId, modelId),
        this.translateText(strategy.description, targetLanguage, providerId, modelId),
        this.translateText(strategy.shortDescription, targetLanguage, providerId, modelId),
        this.translateText(strategy.openingPromptTemplate, targetLanguage, providerId, modelId),
        this.translateText(strategy.groundRulesTemplate, targetLanguage, providerId, modelId),
        this.translateText(strategy.agentInstructions, targetLanguage, providerId, modelId),
        this.translateText(strategy.firstTurnPrompt, targetLanguage, providerId, modelId),
      ]);
      
      result[key] = {
        name,
        description,
        shortDescription,
        openingPromptTemplate,
        groundRulesTemplate,
        agentInstructions,
        firstTurnPrompt,
      };
      
      onProgress(((i + 1) / strategyKeys.length) * 90);
    }
    
    const defaultFirstTurnPrompt = await this.translateText(
      strategies.defaultFirstTurnPrompt,
      targetLanguage,
      providerId,
      modelId
    );
    onProgress(100);
    
    return {
      ...result,
      defaultFirstTurnPrompt,
    } as PromptTemplates['strategies'];
  }

  private async translateContextPrompts(
    context: PromptTemplates['context'],
    targetLanguage: string,
    providerId: string,
    modelId: string,
    onProgress: (progress: number) => void
  ): Promise<PromptTemplates['context']> {
    onProgress(0);
    
    const [
      discussionContext,
      roundDecisionReasoning,
      distilledMemoryHeader,
      currentDiscussionState,
      keyDecisionsMade,
      openQuestionsLabel,
      keyFactsHeader,
      secretarySummary,
      notebookHeader,
      userGuidancePrefix,
      discussionOpeningPrefix,
    ] = await Promise.all([
      this.translateText(context.discussionContext, targetLanguage, providerId, modelId),
      this.translateText(context.roundDecisionReasoning, targetLanguage, providerId, modelId),
      this.translateText(context.distilledMemoryHeader, targetLanguage, providerId, modelId),
      this.translateText(context.currentDiscussionState, targetLanguage, providerId, modelId),
      this.translateText(context.keyDecisionsMade, targetLanguage, providerId, modelId),
      this.translateText(context.openQuestionsLabel, targetLanguage, providerId, modelId),
      this.translateText(context.keyFactsHeader, targetLanguage, providerId, modelId),
      this.translateText(context.secretarySummary, targetLanguage, providerId, modelId),
      this.translateText(context.notebookHeader, targetLanguage, providerId, modelId),
      this.translateText(context.userGuidancePrefix, targetLanguage, providerId, modelId),
      this.translateText(context.discussionOpeningPrefix, targetLanguage, providerId, modelId),
    ]);
    onProgress(40);
    
    const currentState = await this.translateStringRecord(context.currentState, targetLanguage, providerId, modelId);
    const phaseGuidance = await this.translateStringRecord(context.phaseGuidance, targetLanguage, providerId, modelId);
    const messagePrefixes = await this.translateStringRecord(context.messagePrefixes, targetLanguage, providerId, modelId);
    onProgress(70);
    
    const turnPrompts = await this.translateStringRecord(context.turnPrompts, targetLanguage, providerId, modelId);
    onProgress(90);
    
    // Translate finishing phase prompts if they exist
    const finishingPhaseSource = (context as any).finishingPhase as unknown;
    const finishingPhase = finishingPhaseSource
      ? await this.translateStringRecord(finishingPhaseSource as any, targetLanguage, providerId, modelId)
      : undefined;
    onProgress(100);
    
    return {
      discussionContext,
      currentState,
      phaseGuidance,
      roundDecisionReasoning,
      distilledMemoryHeader,
      currentDiscussionState,
      keyDecisionsMade,
      openQuestionsLabel,
      keyFactsHeader,
      secretarySummary,
      notebookHeader,
      userGuidancePrefix,
      discussionOpeningPrefix,
      messagePrefixes,
      turnPrompts,
      ...(finishingPhase && { finishingPhase }),
    };
  }
}

// Singleton export
export const languageService = new LanguageServiceImpl();

