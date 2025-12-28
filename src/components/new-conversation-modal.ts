// ============================================
// AI Brainstorm - New Conversation Modal
// Version: 2.3.0
// ============================================

import { ConversationEngine } from '../engine/conversation-engine';
import { presetStorage, providerStorage } from '../storage/storage-manager';
import { presetCategories } from '../agents/presets';
import { llmRouter } from '../llm/llm-router';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { AgentPreset, LLMProvider, ConversationMode, ProviderModel } from '../types';
import './agent-editor-modal';
import type { AgentEditorModal, AgentEditorResult } from './agent-editor-modal';

interface CustomAgent {
  id: string;
  name: string;
  role: string;
  expertise: string;
  systemPrompt: string;
  strengths: string;
  thinkingStyle: string;
  thinkingDepth: number;
  creativityLevel: number;
  notebookUsage: number;
  llmProviderId: string;
  modelId: string;
  presetId?: string;
}

export class NewConversationModal extends HTMLElement {
  private presets: AgentPreset[] = [];
  private providers: LLMProvider[] = [];
  private selectedPresets: Set<string> = new Set();
  private selectedProviderId: string | null = null;
  private selectedModelId: string | null = null;
  private isAdvancedMode: boolean = false;
  private customAgents: CustomAgent[] = [];
  private editingAgentIndex: number = -1;
  private isFetchingModels: boolean = false;
  private modelFetchError: string | null = null;
  private expandedCategories: Set<string> = new Set();

  static get observedAttributes() {
    return ['open'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    await this.loadData();
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === 'open') {
      if (newValue === 'true') {
        this.loadData().then(() => this.render());
      }
      this.updateVisibility();
    }
  }

  private async loadData() {
    this.presets = await presetStorage.getAll();
    this.providers = await providerStorage.getAll();
    
    // Auto-fetch models for active providers that have none
    await this.autoFetchModelsIfNeeded();
  }

  /**
   * Auto-fetch models for providers that:
   * - Are active
   * - Have autoFetchModels enabled
   * - Have no models in storage
   */
  private async autoFetchModelsIfNeeded(): Promise<void> {
    const activeProviders = this.providers.filter(p => p.isActive);
    
    for (const provider of activeProviders) {
      if (provider.autoFetchModels && (!provider.models || provider.models.length === 0)) {
        await this.fetchAndPersistModels(provider.id);
      }
    }
  }

  /**
   * Fetch models from a provider and persist them to storage
   */
  private async fetchAndPersistModels(providerId: string): Promise<ProviderModel[]> {
    this.isFetchingModels = true;
    this.modelFetchError = null;
    
    try {
      // Ensure router is initialized
      await llmRouter.initialize();
      
      // Fetch models from the provider API
      const fetchedModels = await llmRouter.fetchModelsForStorage(providerId);
      
      if (fetchedModels.length > 0) {
        // Get existing custom models to preserve them
        const provider = this.providers.find(p => p.id === providerId);
        const customModels = (provider?.models || []).filter(m => m.isCustom);
        
        // Merge: custom models + fetched models (dedupe by id)
        const customIds = new Set(customModels.map(m => m.id));
        const uniqueFetched = fetchedModels.filter(m => !customIds.has(m.id));
        const mergedModels = [...customModels, ...uniqueFetched];
        
        // Persist to storage
        // (Use `update()` instead of `setModels()` to avoid type/interface mismatches.)
        await providerStorage.update(providerId, { models: mergedModels });
        
        // Reload providers to get updated models
        this.providers = await providerStorage.getAll();
        
        return mergedModels;
      }
      
      return [];
    } catch (error) {
      console.error(`[NewConversationModal] Failed to fetch models for provider ${providerId}:`, error);
      this.modelFetchError = 'Failed to fetch models. Check provider configuration.';
      return [];
    } finally {
      this.isFetchingModels = false;
    }
  }

  private updateVisibility() {
    const isOpen = this.getAttribute('open') === 'true';
    const overlay = this.shadowRoot?.querySelector('.modal-overlay') as HTMLElement;
    if (overlay) {
      overlay.style.display = isOpen ? 'flex' : 'none';
    }
  }

  private close() {
    this.setAttribute('open', 'false');
    this.selectedPresets.clear();
    this.selectedProviderId = null;
    this.selectedModelId = null;
    this.customAgents = [];
    this.editingAgentIndex = -1;
  }

  private generateAgentId(): string {
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getDefaultProvider(): LLMProvider | undefined {
    return this.providers.find(p => p.isActive && (p.models?.length ?? 0) > 0);
  }

  private getDefaultProviderAndModel(): { provider: LLMProvider; modelId: string } | null {
    const provider = this.getDefaultProvider();
    if (!provider) return null;
    const firstModel = provider.models[0];
    if (!firstModel) return null;
    return { provider, modelId: firstModel.id };
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';
    const activeProviders = this.providers.filter(p => p.isActive);
    const defaultProviderId = activeProviders[0]?.id || '';
    const providerId = this.selectedProviderId || defaultProviderId;
    const selectedProvider = this.providers.find(p => p.id === providerId) || activeProviders[0];
    const availableModels = (selectedProvider?.models || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    const defaultModelId = availableModels[0]?.id || '';
    const modelId = this.selectedModelId && availableModels.some(m => m.id === this.selectedModelId)
      ? this.selectedModelId
      : defaultModelId;

    const hasModels = availableModels.length > 0;
    const hasActiveProvider = activeProviders.length > 0;
    
    const canCreate = this.isAdvancedMode 
      ? this.customAgents.length >= 2 
      : (this.selectedPresets.size >= 2 && hasModels && hasActiveProvider);

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: var(--z-modal, 400);
          display: ${isOpen ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal-content {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          width: 100%;
          max-width: 720px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.05),
            0 20px 50px -10px rgba(0, 0, 0, 0.5),
            0 0 80px -20px var(--color-primary-dim);
        }

        /* Keep footer visible: make the form a flex container so the body can scroll. */
        .modal-form {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
        }

        @keyframes scaleIn {
          from { 
            opacity: 0; 
            transform: scale(0.9) translateY(10px); 
          }
          to { 
            opacity: 1; 
            transform: scale(1) translateY(0); 
          }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          flex-shrink: 0;
        }

        .modal-header h2 {
          margin: 0;
          font-size: var(--text-xl);
          color: var(--color-text-primary);
          font-weight: var(--font-semibold);
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--color-text-tertiary);
          cursor: pointer;
          padding: var(--space-2);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
          transform: rotate(90deg);
        }

        .modal-body {
          padding: var(--space-6);
          overflow-y: auto;
          overflow-x: hidden;
          flex: 1;
          min-height: 0;
        }

        .form-group {
          margin-bottom: var(--space-5);
        }

        .form-group:last-child {
          margin-bottom: 0;
        }

        .form-label {
          display: block;
          margin-bottom: var(--space-2);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          letter-spacing: 0.01em;
        }

        .form-input, .form-select, .form-textarea {
          width: 100%;
          padding: var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-primary);
          font-family: inherit;
          font-size: var(--text-base);
          transition: all var(--transition-fast);
        }

        .form-input:hover, .form-select:hover, .form-textarea:hover {
          border-color: var(--color-border-strong);
        }

        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-dim);
          background: var(--color-bg-tertiary);
        }

        .form-input::placeholder, .form-textarea::placeholder {
          color: var(--color-text-tertiary);
        }

        .form-textarea {
          min-height: 80px;
          resize: vertical;
          line-height: 1.5;
        }

        .mode-selector {
          display: flex;
          gap: var(--space-2);
        }

        .mode-option {
          flex: 1;
          padding: var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: center;
          transition: all var(--transition-fast);
        }

        .mode-option:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          transform: translateY(-1px);
        }

        .mode-option.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          box-shadow: 0 0 0 1px var(--color-primary);
        }

        .mode-option .mode-icon {
          font-size: var(--text-xl);
          margin-bottom: var(--space-1);
          display: block;
        }

        .mode-option .mode-name {
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
        }

        .preset-section-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .preset-count {
          font-size: var(--text-xs);
          color: var(--color-primary);
          background: var(--color-primary-dim);
          padding: 2px 8px;
          border-radius: var(--radius-full);
        }

        .preset-grid-wrapper {
          position: relative;
        }

        .preset-grid {
          max-height: 240px;
          overflow-y: auto;
          overflow-x: hidden;
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          scroll-behavior: smooth;
        }

        .preset-chip {
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--text-sm);
          text-align: center;
          transition: all var(--transition-fast);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--color-text-secondary);
        }

        .preset-chip:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
          transform: translateY(-1px);
        }

        .preset-chip.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          color: var(--color-primary);
          box-shadow: 0 0 0 1px var(--color-primary);
        }

        .preset-category {
          border-bottom: 1px solid var(--color-border);
        }

        .preset-category:last-child {
          border-bottom: none;
        }

        .preset-category-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3);
          cursor: pointer;
          transition: background var(--transition-fast);
          user-select: none;
        }

        .preset-category-header:hover {
          background: var(--color-surface-hover);
        }

        .preset-category-header.expanded {
          background: var(--color-surface);
        }

        .preset-category-title {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
        }

        .preset-category-icon {
          font-size: var(--text-base);
        }

        .preset-category-count {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          margin-left: var(--space-2);
        }

        .preset-category-chevron {
          transition: transform 0.2s ease;
          color: var(--color-text-tertiary);
        }

        .preset-category-header.expanded .preset-category-chevron {
          transform: rotate(180deg);
        }

        .preset-category-content {
          display: none;
          padding: var(--space-3);
          padding-top: 0;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .preset-category-content.expanded {
          display: flex;
        }

        .provider-warning {
          padding: var(--space-3) var(--space-4);
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: var(--radius-md);
          color: var(--color-warning);
          font-size: var(--text-sm);
          margin-bottom: var(--space-4);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .model-warning {
          padding: var(--space-3) var(--space-4);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          color: var(--color-error);
          font-size: var(--text-sm);
          margin-top: var(--space-2);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
        }

        .model-warning-text {
          flex: 1;
        }

        .settings-cta {
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-primary);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }

        .settings-cta:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .fetching-models {
          padding: var(--space-2) var(--space-3);
          background: var(--color-primary-dim);
          border: 1px solid var(--color-primary);
          border-radius: var(--radius-md);
          color: var(--color-primary);
          font-size: var(--text-sm);
          margin-top: var(--space-2);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .btn {
          padding: var(--space-2) var(--space-5);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          font-size: var(--text-sm);
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
        }

        .btn-secondary {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-primary);
        }

        .btn-secondary:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
        }

        .btn-primary {
          background: var(--color-primary);
          border: 1px solid var(--color-primary);
          color: var(--color-bg-primary);
          box-shadow: 0 2px 8px var(--color-primary-dim);
        }

        .btn-primary:hover:not(:disabled) {
          box-shadow: 0 4px 16px var(--color-primary-glow);
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
        }

        @media (max-width: 480px) {
          .modal-overlay {
            padding: var(--space-2);
          }

          .modal-header,
          .modal-footer {
            padding-left: var(--space-4);
            padding-right: var(--space-4);
          }

          .modal-body {
            padding: var(--space-4);
          }

          .modal-footer {
            flex-direction: column-reverse;
            align-items: stretch;
          }

          .modal-footer .btn {
            width: 100%;
            /* Ensure full-width behavior across browsers/layout contexts */
            display: flex;
          }
        }

        .inline-select {
          display: flex;
          gap: var(--space-2);
        }

        .inline-select .form-select {
          flex: 1;
          min-width: 0;
        }

        .form-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23606070' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
        }

        /* Mode Toggle */
        .agent-mode-toggle {
          display: flex;
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 2px;
          margin-bottom: var(--space-4);
        }

        .mode-toggle-btn {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .mode-toggle-btn:hover:not(.active) {
          color: var(--color-text-primary);
        }

        .mode-toggle-btn.active {
          background: var(--color-primary);
          color: var(--color-bg-primary);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        /* Agent List */
        .agent-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }

        .agent-card {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }

        .agent-card:hover {
          border-color: var(--color-border-strong);
          background: var(--color-surface-hover);
        }

        .agent-avatar {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: var(--font-bold);
          font-size: var(--text-sm);
          flex-shrink: 0;
        }

        .agent-info {
          flex: 1;
          min-width: 0;
        }

        .agent-name {
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          font-size: var(--text-sm);
          margin-bottom: 2px;
        }

        .agent-meta {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .agent-model-badge {
          padding: 1px 6px;
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }

        .agent-actions {
          display: flex;
          gap: var(--space-1);
        }

        .agent-action-btn {
          padding: var(--space-1);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .agent-action-btn:hover {
          background: var(--color-bg-tertiary);
          color: var(--color-text-primary);
        }

        .agent-action-btn.delete:hover {
          background: rgba(239, 68, 68, 0.15);
          color: var(--color-error);
        }

        .add-agent-btns {
          display: flex;
          gap: var(--space-2);
        }

        .add-agent-btn {
          flex: 1;
          padding: var(--space-3);
          background: transparent;
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
        }

        .add-agent-btn:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
          background: var(--color-primary-dim);
        }

        .empty-agents {
          padding: var(--space-6);
          text-align: center;
          color: var(--color-text-tertiary);
          font-size: var(--text-sm);
          background: var(--color-bg-tertiary);
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-3);
        }

        .section-divider {
          height: 1px;
          background: var(--color-border);
          margin: var(--space-5) 0;
        }
      </style>

      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2>New Conversation</h2>
            <button class="close-btn" id="close-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <form id="new-conv-form" class="modal-form">
            <div class="modal-body">
              ${this.providers.filter(p => p.isActive).length === 0 ? `
                <div class="provider-warning">
                  ⚠️ No LLM providers configured. Please go to Settings to add an API key.
                </div>
              ` : ''}

              <div class="form-group">
                <label class="form-label">Subject</label>
                <input type="text" class="form-input" id="subject" placeholder="e.g., Design a modern web application" required>
              </div>

              <div class="form-group">
                <label class="form-label">Goal</label>
                <textarea class="form-textarea" id="goal" placeholder="What do you want to achieve from this discussion?" required></textarea>
              </div>

              <div class="form-group">
                <label class="form-label">Conversation Mode</label>
                <div class="mode-selector">
                  <div class="mode-option selected" data-mode="round-robin">
                    <div class="mode-icon">🔄</div>
                    <div class="mode-name">Round Robin</div>
                  </div>
                  <div class="mode-option" data-mode="moderator">
                    <div class="mode-icon">👨‍⚖️</div>
                    <div class="mode-name">Moderated</div>
                  </div>
                  <div class="mode-option" data-mode="dynamic">
                    <div class="mode-icon">💬</div>
                    <div class="mode-name">Dynamic</div>
                  </div>
                </div>
              </div>

              <div class="section-divider"></div>

              <!-- Agent Mode Toggle -->
              <div class="form-group">
                <label class="form-label">Agent Configuration</label>
                <div class="agent-mode-toggle">
                  <button type="button" class="mode-toggle-btn ${!this.isAdvancedMode ? 'active' : ''}" data-agent-mode="simple">
                    Simple
                  </button>
                  <button type="button" class="mode-toggle-btn ${this.isAdvancedMode ? 'active' : ''}" data-agent-mode="advanced">
                    Advanced
                  </button>
                </div>
              </div>

              ${!this.isAdvancedMode ? `
                <!-- Simple Mode: Shared LLM + Preset Selection -->
                <div class="form-group">
                  <label class="form-label">LLM Provider & Model (for all agents)</label>
                  <div class="inline-select">
                    <select class="form-select" id="provider">
                      ${this.providers.map(p => `
                        <option value="${p.id}" ${!p.isActive ? 'disabled' : ''} ${p.id === providerId ? 'selected' : ''}>
                          ${p.name} ${!p.isActive ? '(not configured)' : ''}
                        </option>
                      `).join('')}
                    </select>
                    <select class="form-select" id="model" ${!hasModels ? 'disabled' : ''}>
                      ${availableModels.length > 0 ? availableModels.map(m => `
                        <option value="${m.id}" ${m.id === modelId ? 'selected' : ''}>
                          ${m.name}
                        </option>
                      `).join('') : `
                        <option value="" disabled selected>
                          ${selectedProvider ? 'No models available' : 'Select a provider'}
                        </option>
                      `}
                    </select>
                  </div>
                  ${this.isFetchingModels ? `
                    <div class="fetching-models">
                      <span class="spinner"></span>
                      Fetching available models...
                    </div>
                  ` : ''}
                  ${!hasModels && selectedProvider && !this.isFetchingModels ? `
                    <div class="model-warning">
                      <span class="model-warning-text">
                        ${this.modelFetchError || 'No models configured for this provider. Add models in Settings or enable auto-fetch.'}
                      </span>
                      <div style="display: flex; gap: var(--space-2);">
                        ${selectedProvider.autoFetchModels ? `
                          <button type="button" class="settings-cta" id="refresh-models">
                            Retry
                          </button>
                        ` : ''}
                        <button type="button" class="settings-cta" id="open-settings">
                          Settings
                        </button>
                      </div>
                    </div>
                  ` : ''}
                </div>

                <div class="form-group">
                  <div class="preset-section-label">
                    <label class="form-label" style="margin-bottom: 0;">Select Agents</label>
                    <span class="preset-count">${this.selectedPresets.size} selected</span>
                  </div>
                  <div class="preset-grid-wrapper">
                    <div class="preset-grid">
                      ${this.renderPresetCategoriesForSelection()}
                    </div>
                  </div>
                </div>
              ` : `
                <!-- Advanced Mode: Custom Agent List -->
                <div class="form-group">
                  <div class="preset-section-label">
                    <label class="form-label" style="margin-bottom: 0;">Agents</label>
                    <span class="preset-count">${this.customAgents.length} agents</span>
                  </div>
                  
                  ${this.customAgents.length === 0 ? `
                    <div class="empty-agents">
                      No agents added yet. Add at least 2 agents to start a conversation.
                    </div>
                  ` : `
                    <div class="agent-list">
                      ${this.customAgents.map((agent, index) => {
                        const provider = this.providers.find(p => p.id === agent.llmProviderId);
                        const model = provider?.models.find(m => m.id === agent.modelId);
                        const initials = agent.name.slice(0, 2).toUpperCase();
                        const color = this.getAgentColor(index);
                        
                        return `
                          <div class="agent-card" data-index="${index}">
                            <div class="agent-avatar" style="background: ${color}20; color: ${color};">
                              ${initials}
                            </div>
                            <div class="agent-info">
                              <div class="agent-name">${agent.name}</div>
                              <div class="agent-meta">
                                <span>${agent.role}</span>
                                <span class="agent-model-badge">${model?.name || agent.modelId}</span>
                              </div>
                            </div>
                            <div class="agent-actions">
                              <button type="button" class="agent-action-btn edit" data-index="${index}" title="Edit">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button type="button" class="agent-action-btn delete" data-index="${index}" title="Remove">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                  <path d="M3 6h18"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                  
                  <div class="add-agent-btns">
                    <button type="button" class="add-agent-btn" id="add-custom-agent">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Custom Agent
                    </button>
                    <button type="button" class="add-agent-btn" id="add-from-preset">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                      </svg>
                      From Preset
                    </button>
                  </div>
                </div>
              `}
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary" ${!canCreate ? 'disabled' : ''}>
                Create Conversation
              </button>
            </div>
          </form>
        </div>
      </div>

      <agent-editor-modal id="agent-editor"></agent-editor-modal>
    `;

    this.setupEventHandlers();
  }

  private getPresetsByCategory(): Map<string, AgentPreset[]> {
    const grouped = new Map<string, AgentPreset[]>();
    
    // Initialize all categories
    for (const category of presetCategories) {
      if (category.id !== 'custom') {
        grouped.set(category.id, []);
      }
    }
    
    // Group presets by category
    for (const preset of this.presets) {
      const categoryPresets = grouped.get(preset.category);
      if (categoryPresets) {
        categoryPresets.push(preset);
      }
    }
    
    return grouped;
  }

  private renderPresetCategoriesForSelection(): string {
    const grouped = this.getPresetsByCategory();
    
    // Auto-expand first category with presets if none expanded
    if (this.expandedCategories.size === 0) {
      for (const [categoryId, presets] of grouped) {
        if (presets.length > 0) {
          this.expandedCategories.add(categoryId);
          break;
        }
      }
    }
    
    return presetCategories
      .filter(cat => cat.id !== 'custom')
      .map(category => {
        const presets = grouped.get(category.id) || [];
        if (presets.length === 0) return ''; // Hide empty categories
        
        const isExpanded = this.expandedCategories.has(category.id);
        const selectedCount = presets.filter(p => this.selectedPresets.has(p.id)).length;
        
        return `
          <div class="preset-category" data-category="${category.id}">
            <div class="preset-category-header ${isExpanded ? 'expanded' : ''}" data-category="${category.id}">
              <div class="preset-category-title">
                <span class="preset-category-icon">${category.icon}</span>
                <span>${category.name}</span>
                <span class="preset-category-count">${selectedCount > 0 ? `${selectedCount}/` : ''}${presets.length}</span>
              </div>
              <svg class="preset-category-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
            <div class="preset-category-content ${isExpanded ? 'expanded' : ''}">
              ${presets.map(p => `
                <div class="preset-chip ${this.selectedPresets.has(p.id) ? 'selected' : ''}" data-preset-id="${p.id}">
                  ${p.name}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('');
  }

  private getAgentColor(index: number): string {
    const colors = [
      '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
      '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#0ea5e9', '#3b82f6',
    ];
    return colors[index % colors.length];
  }

  private setupEventHandlers() {
    // Close button
    this.shadowRoot?.getElementById('close-btn')?.addEventListener('click', () => this.close());
    this.shadowRoot?.getElementById('cancel-btn')?.addEventListener('click', () => this.close());

    // Click outside to close
    this.shadowRoot?.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
        this.close();
      }
    });

    // Mode selector
    this.shadowRoot?.querySelectorAll('.mode-option').forEach(option => {
      option.addEventListener('click', () => {
        this.shadowRoot?.querySelectorAll('.mode-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      });
    });

    // Agent mode toggle
    this.shadowRoot?.querySelectorAll('.mode-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-agent-mode');
        this.isAdvancedMode = mode === 'advanced';
        this.render();
      });
    });

    // Simple mode: Provider/model selection
    const providerSelect = this.shadowRoot?.getElementById('provider') as HTMLSelectElement | null;
    const modelSelect = this.shadowRoot?.getElementById('model') as HTMLSelectElement | null;

    providerSelect?.addEventListener('change', async () => {
      this.selectedProviderId = providerSelect.value;
      this.selectedModelId = null;
      
      // Check if selected provider needs model fetch
      const selectedProvider = this.providers.find(p => p.id === this.selectedProviderId);
      if (selectedProvider && selectedProvider.isActive && selectedProvider.autoFetchModels) {
        if (!selectedProvider.models || selectedProvider.models.length === 0) {
          this.render(); // Show loading state
          await this.fetchAndPersistModels(selectedProvider.id);
        }
      }
      
      this.render();
    });

    modelSelect?.addEventListener('change', () => {
      this.selectedModelId = modelSelect.value;
    });

    // Open Settings CTA
    this.shadowRoot?.getElementById('open-settings')?.addEventListener('click', () => {
      this.close();
      eventBus.emit('settings:open', undefined);
    });

    // Refresh Models button
    this.shadowRoot?.getElementById('refresh-models')?.addEventListener('click', async () => {
      const providerId = this.selectedProviderId || (this.shadowRoot?.getElementById('provider') as HTMLSelectElement)?.value;
      if (providerId) {
        this.render(); // Show loading state
        await this.fetchAndPersistModels(providerId);
        this.render();
      }
    });

    // Category accordion toggle
    this.shadowRoot?.querySelectorAll('.preset-category-header').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const categoryId = header.getAttribute('data-category');
        if (!categoryId) return;
        
        const content = header.nextElementSibling as HTMLElement;
        const isExpanded = header.classList.contains('expanded');
        
        if (isExpanded) {
          this.expandedCategories.delete(categoryId);
          header.classList.remove('expanded');
          content?.classList.remove('expanded');
        } else {
          this.expandedCategories.add(categoryId);
          header.classList.add('expanded');
          content?.classList.add('expanded');
        }
      });
    });

    // Simple mode: Preset selection
    this.shadowRoot?.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = chip.getAttribute('data-preset-id');
        if (!presetId) return;

        if (this.selectedPresets.has(presetId)) {
          this.selectedPresets.delete(presetId);
          chip.classList.remove('selected');
        } else {
          this.selectedPresets.add(presetId);
          chip.classList.add('selected');
        }

        this.updateSelectionState();
      });
    });

    // Advanced mode: Add custom agent
    this.shadowRoot?.getElementById('add-custom-agent')?.addEventListener('click', () => {
      this.openAgentEditor('create');
    });

    // Advanced mode: Add from preset
    this.shadowRoot?.getElementById('add-from-preset')?.addEventListener('click', () => {
      this.showPresetPicker();
    });

    // Advanced mode: Edit/Delete agent
    this.shadowRoot?.querySelectorAll('.agent-action-btn.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index') || '-1');
        if (index >= 0) {
          this.openAgentEditor('edit', index);
        }
      });
    });

    this.shadowRoot?.querySelectorAll('.agent-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index') || '-1');
        if (index >= 0) {
          this.customAgents.splice(index, 1);
          this.render();
        }
      });
    });

    // Agent editor events
    const agentEditor = this.shadowRoot?.getElementById('agent-editor') as AgentEditorModal;
    agentEditor?.addEventListener('agent:saved', ((e: CustomEvent) => {
      const { result, mode } = e.detail as { result: AgentEditorResult; mode: string };
      
      if (mode === 'edit' && this.editingAgentIndex >= 0) {
        // Update existing agent
        this.customAgents[this.editingAgentIndex] = {
          ...this.customAgents[this.editingAgentIndex],
          ...result,
        };
      } else {
        // Add new agent
        this.customAgents.push({
          id: this.generateAgentId(),
          ...result,
        });
      }
      
      this.editingAgentIndex = -1;
      this.render();
    }) as EventListener);

    agentEditor?.addEventListener('agent:cancelled', () => {
      this.editingAgentIndex = -1;
    });

    // Form submission
    this.shadowRoot?.getElementById('new-conv-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createConversation();
    });
  }

  private openAgentEditor(mode: 'create' | 'edit', index?: number) {
    const agentEditor = this.shadowRoot?.getElementById('agent-editor') as AgentEditorModal;
    if (!agentEditor) return;

    const defaultProvider = this.getDefaultProviderAndModel();

    if (mode === 'edit' && index !== undefined && index >= 0) {
      this.editingAgentIndex = index;
      const agent = this.customAgents[index];
      agentEditor.configure({
        mode: 'edit',
        agent: agent,
        conversationId: undefined,
        order: index,
      });
    } else {
      this.editingAgentIndex = -1;
      if (!defaultProvider) {
        alert('Configure an active provider with at least one model before adding agents.');
        return;
      }
      agentEditor.configure({
        mode: 'create',
        agent: {
          llmProviderId: defaultProvider.provider.id,
          modelId: defaultProvider.modelId,
        },
        order: this.customAgents.length,
      });
    }

    agentEditor.setAttribute('open', 'true');
  }

  private async showPresetPicker() {
    // For simplicity, we'll create a quick preset picker using the existing preset grid
    // and convert selected preset to a custom agent
    const preset = await this.pickPreset();
    if (preset) {
      const defaultProvider = this.getDefaultProviderAndModel();
      if (!defaultProvider) {
        alert('Configure an active provider with at least one model before adding agents from presets.');
        return;
      }
      
      this.customAgents.push({
        id: this.generateAgentId(),
        name: preset.name,
        role: preset.name,
        expertise: preset.expertise,
        systemPrompt: preset.systemPrompt,
        strengths: preset.strengths,
        thinkingStyle: preset.thinkingStyle,
        thinkingDepth: preset.defaultThinkingDepth,
        creativityLevel: preset.defaultCreativityLevel,
        notebookUsage: 50,
        llmProviderId: defaultProvider.provider.id,
        modelId: defaultProvider.modelId,
        presetId: preset.id,
      });
      
      this.render();
    }
  }

  private pickPreset(): Promise<AgentPreset | null> {
    return new Promise((resolve) => {
      // Create a simple modal for preset selection
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      `;

      const modal = document.createElement('div');
      modal.style.cssText = `
        background: var(--color-bg-secondary);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 24px;
        max-width: 500px;
        max-height: 400px;
        overflow-y: auto;
      `;

      modal.innerHTML = `
        <h3 style="margin: 0 0 16px; color: var(--color-text-primary);">Select a Preset</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
          ${this.presets.map(p => `
            <button type="button" style="
              padding: 12px;
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: 8px;
              color: var(--color-text-primary);
              cursor: pointer;
              text-align: left;
              font-size: 14px;
            " data-preset-id="${p.id}">
              <strong>${p.name}</strong>
            </button>
          `).join('')}
        </div>
        <button type="button" style="
          margin-top: 16px;
          padding: 8px 16px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          color: var(--color-text-secondary);
          cursor: pointer;
        " id="cancel-preset">Cancel</button>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cleanup = () => {
        document.body.removeChild(overlay);
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve(null);
        }
      });

      modal.querySelector('#cancel-preset')?.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      modal.querySelectorAll('[data-preset-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const presetId = btn.getAttribute('data-preset-id');
          const preset = this.presets.find(p => p.id === presetId);
          cleanup();
          resolve(preset || null);
        });
      });
    });
  }

  private updateSelectionState() {
    const countBadge = this.shadowRoot?.querySelector('.preset-count') as HTMLElement;
    if (countBadge) {
      countBadge.textContent = `${this.selectedPresets.size} selected`;
    }

    // Update category counts
    const grouped = this.getPresetsByCategory();
    this.shadowRoot?.querySelectorAll('.preset-category').forEach(categoryEl => {
      const categoryId = categoryEl.getAttribute('data-category');
      if (!categoryId) return;
      
      const presets = grouped.get(categoryId) || [];
      const selectedCount = presets.filter(p => this.selectedPresets.has(p.id)).length;
      const countEl = categoryEl.querySelector('.preset-category-count') as HTMLElement;
      if (countEl) {
        countEl.textContent = selectedCount > 0 ? `${selectedCount}/${presets.length}` : `${presets.length}`;
      }
    });

    const submitBtn = this.shadowRoot?.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.disabled = this.selectedPresets.size < 2;
    }
  }

  private async createConversation() {
    const subject = (this.shadowRoot?.getElementById('subject') as HTMLInputElement)?.value;
    const goal = (this.shadowRoot?.getElementById('goal') as HTMLTextAreaElement)?.value;
    const modeElement = this.shadowRoot?.querySelector('.mode-option.selected') as HTMLElement;
    const mode = (modeElement?.getAttribute('data-mode') || 'round-robin') as ConversationMode;

    if (!subject || !goal) {
      return;
    }

    let agentConfigs: Array<{
      presetId?: string;
      name?: string;
      role?: string;
      expertise?: string;
      llmProviderId: string;
      modelId: string;
      thinkingDepth?: number;
      creativityLevel?: number;
    }>;

    if (this.isAdvancedMode) {
      // Advanced mode: use custom agents
      if (this.customAgents.length < 2) {
        return;
      }

      const invalidAgent = this.customAgents.find(a => !a.llmProviderId || !a.modelId);
      if (invalidAgent) {
        alert('Each agent must have an active provider and model selected before creating the conversation.');
        return;
      }

      agentConfigs = this.customAgents.map(agent => ({
        presetId: agent.presetId,
        name: agent.name,
        role: agent.role,
        expertise: agent.expertise,
        llmProviderId: agent.llmProviderId,
        modelId: agent.modelId,
        thinkingDepth: agent.thinkingDepth,
        creativityLevel: agent.creativityLevel,
      }));
    } else {
      // Simple mode: use presets with shared LLM
      const providerId = this.selectedProviderId || (this.shadowRoot?.getElementById('provider') as HTMLSelectElement)?.value;
      const modelId = this.selectedModelId || (this.shadowRoot?.getElementById('model') as HTMLSelectElement)?.value;

      if (!providerId || !modelId || this.selectedPresets.size < 2) {
        return;
      }

      agentConfigs = Array.from(this.selectedPresets).map(presetId => ({
        presetId,
        llmProviderId: providerId,
        modelId,
      }));
    }

    try {
      const engine = await ConversationEngine.create(
        subject,
        goal,
        mode,
        agentConfigs,
        {
          speedMs: 2000,
          maxContextTokens: 8000,
          includeSecretary: true,
        }
      );

      this.close();
      eventBus.emit('conversation:selected', engine.getConversation().id);
    } catch (error) {
      console.error('[NewConversationModal] Failed to create conversation:', error);
    }
  }
}

customElements.define('new-conversation-modal', NewConversationModal);
