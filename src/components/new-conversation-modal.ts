// ============================================
// AI Brainstorm - New Conversation Modal
// ============================================

import { ConversationEngine } from '../engine/conversation-engine';
import { presetStorage, providerStorage, settingsStorage, mcpServerStorage } from '../storage/storage-manager';
import { getSoftwareTeamPresets, getFinanceTeamPresets, getAITeamPresets, getGeneralTeamPresets, getCriticalThinkingTeamPresets } from '../agents/presets';
import { llmRouter } from '../llm/llm-router';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { startingStrategies, getStrategyById, buildOpeningStatement, buildGroundRules } from '../strategies/starting-strategies';
import { conversationTemplates, templateCategories, getTemplateById } from '../strategies/conversation-templates';
import { getEnabledLanguages, type Language } from '../utils/languages';
import { languageService, type TranslationProgress } from '../prompts/language-service';
import { validateSubject, validateGoal, sanitizeInput } from '../utils/validation';
import './agent-preset-editor-modal';
import type { AgentPresetEditorModal } from './agent-preset-editor-modal';
import type { AgentPreset, LLMProvider, ConversationMode, StartingStrategyId, ConversationDepth, AppSettings, MCPServer, ToolApprovalMode, ProviderModel } from '../types';

// Quick team definitions for dropdown
const QUICK_TEAMS = [
  { id: 'software', name: 'Software Team', icon: '💻', getPresets: getSoftwareTeamPresets },
  { id: 'finance', name: 'Finance Team', icon: '📈', getPresets: getFinanceTeamPresets },
  { id: 'ai', name: 'AI/ML Team', icon: '🤖', getPresets: getAITeamPresets },
  { id: 'general', name: 'General Team', icon: '🎯', getPresets: getGeneralTeamPresets },
  { id: 'critical', name: 'Critical Thinking', icon: '🔍', getPresets: getCriticalThinkingTeamPresets },
] as const;

// Depth level configuration for UI display
const DEPTH_LEVELS: Array<{ id: ConversationDepth; name: string; icon: string; description: string }> = [
  { id: 'brief', name: 'Brief', icon: '⚡', description: '1-2 sentences' },
  { id: 'concise', name: 'Concise', icon: '📝', description: 'Short paragraphs' },
  { id: 'standard', name: 'Standard', icon: '💬', description: 'Balanced (~150 words)' },
  { id: 'detailed', name: 'Detailed', icon: '📖', description: 'In-depth analysis' },
  { id: 'deep', name: 'Deep', icon: '🔬', description: 'Comprehensive' },
];

export class NewConversationModal extends HTMLElement {
  private readonly uid = `new-conversation-${Math.random().toString(36).slice(2, 10)}`;
  private presets: AgentPreset[] = [];
  private providers: LLMProvider[] = [];
  private selectedPresets: Set<string> = new Set();
  private selectedProviderId: string | null = null;
  private selectedModelId: string | null = null;
  private isFetchingModels: boolean = false;
  private modelFetchError: string | null = null;
  // Draft form fields (persist across re-renders)
  private draftSubject: string = '';
  private draftGoal: string = '';
  private selectedMode: ConversationMode = 'round-robin';
  // Strategy and template state
  private selectedStrategyId: StartingStrategyId = 'open-brainstorm';
  private selectedTemplateId: string | null = null;
  private customOpeningStatement: string = '';
  private showOpeningStatementField: boolean = false;
  // Conversation depth state
  private selectedDepth: ConversationDepth = 'standard';
  // Target language state
  private selectedLanguage: string = '';
  // Enabled languages from settings
  private enabledLanguages: Language[] = getEnabledLanguages(['']);
  private settingsUnsubscribe: (() => void) | null = null;
  // Language translation state
  private showTranslationModal: boolean = false;
  private translationProgress: TranslationProgress | null = null;
  private pendingLanguageSelection: { code: string; name: string } | null = null;
  // Hidden categories/presets from settings
  private hiddenCategories: Set<string> = new Set();
  private hiddenPresets: Set<string> = new Set();
  private settingsUpdateToken = 0;
  // MCP server state
  private mcpServers: MCPServer[] = [];
  private selectedMcpServerIds: Set<string> = new Set();
  private mcpToolApprovalMode: ToolApprovalMode = 'auto';
  // Agent search state
  private agentSearchQuery: string = '';

  private elId(suffix: string): string {
    return `${this.uid}-${suffix}`;
  }

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
    
    // Listen for settings updates to refresh enabled languages
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }

    this.settingsUnsubscribe = eventBus.on('settings:updated', async (settings: AppSettings) => {
      const token = ++this.settingsUpdateToken;
      const enabledLanguages = getEnabledLanguages(settings.enabledLanguages);
      const hiddenCategories = new Set(settings.hiddenCategories || []);
      const hiddenPresets = new Set(settings.hiddenPresets || []);
      
      // Re-load presets to apply new visibility filters
      const allPresets = await presetStorage.getAll();
      if (token !== this.settingsUpdateToken) return;

      this.enabledLanguages = enabledLanguages;
      this.hiddenCategories = hiddenCategories;
      this.hiddenPresets = hiddenPresets;

      this.presets = allPresets.filter(preset => {
        if (hiddenCategories.has(preset.category)) return false;
        if (hiddenPresets.has(preset.id)) return false;
        return true;
      });

      // Ensure hidden presets cannot remain selected
      const visiblePresetIds = new Set(this.presets.map(p => p.id));
      this.selectedPresets = new Set(Array.from(this.selectedPresets).filter(id => visiblePresetIds.has(id)));
      
      // Re-render only if modal is open
      if (this.getAttribute('open') === 'true') {
        this.render();
      }
    });
  }
  
  disconnectedCallback() {
    // Clean up event listener
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
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
    const allPresets = await presetStorage.getAll();
    this.providers = await providerStorage.getAll();
    this.mcpServers = await mcpServerStorage.getAll();
    
    // Load settings for languages and hidden presets/categories
    const settings = await settingsStorage.get();
    this.enabledLanguages = getEnabledLanguages(settings.enabledLanguages);
    this.hiddenCategories = new Set(settings.hiddenCategories || []);
    this.hiddenPresets = new Set(settings.hiddenPresets || []);
    
    // Filter out hidden categories and individual presets
    this.presets = allPresets.filter(preset => {
      // Filter by category
      if (this.hiddenCategories.has(preset.category)) {
        return false;
      }
      // Filter by individual preset
      if (this.hiddenPresets.has(preset.id)) {
        return false;
      }
      return true;
    });

    // Ensure hidden presets cannot remain selected
    const visiblePresetIds = new Set(this.presets.map(p => p.id));
    this.selectedPresets = new Set(Array.from(this.selectedPresets).filter(id => visiblePresetIds.has(id)));
    
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

  /**
   * Show validation error for a field
   */
  private showValidationError(fieldId: string, message: string): void {
    const field = this.shadowRoot?.getElementById(fieldId) as HTMLInputElement | HTMLTextAreaElement;
    if (field) {
      field.classList.add('error');
      field.focus();
      
      // Show error message
      let errorEl = field.parentElement?.querySelector('.validation-error') as HTMLElement;
      if (!errorEl) {
        errorEl = document.createElement('span');
        errorEl.className = 'validation-error';
        errorEl.style.cssText = 'color: var(--error-color, #ef4444); font-size: 0.875rem; margin-top: 0.25rem; display: block;';
        field.parentElement?.appendChild(errorEl);
      }
      errorEl.textContent = message;
      
      // Clear error on input
      const clearError = () => {
        field.classList.remove('error');
        errorEl?.remove();
        field.removeEventListener('input', clearError);
      };
      field.addEventListener('input', clearError);
    }
  }

  private close() {
    this.setAttribute('open', 'false');
    this.selectedPresets.clear();
    this.selectedProviderId = null;
    this.selectedModelId = null;
    // Reset draft fields
    this.draftSubject = '';
    this.draftGoal = '';
    this.selectedMode = 'round-robin';
    // Reset strategy state
    this.selectedStrategyId = 'open-brainstorm';
    this.selectedTemplateId = null;
    this.customOpeningStatement = '';
    this.showOpeningStatementField = false;
    // Reset depth state
    this.selectedDepth = 'standard';
    // Reset language state
    this.selectedLanguage = '';
    // Reset agent search
    this.agentSearchQuery = '';
  }

  /**
   * Apply a quick team preset selection
   */
  private applyQuickTeam(teamId: string) {
    const team = QUICK_TEAMS.find(t => t.id === teamId);
    if (!team) return;
    
    const teamPresets = team.getPresets();
    const visibleIds = new Set(this.presets.map(p => p.id));
    
    // Clear current selection and add team presets
    this.selectedPresets.clear();
    for (const preset of teamPresets) {
      if (visibleIds.has(preset.id)) {
        this.selectedPresets.add(preset.id);
      }
    }
    
    this.renderPreservingDraft();
  }

  /**
   * Open the preset editor to create a new custom agent
   */
  private openPresetEditor() {
    const presetEditor = this.shadowRoot?.getElementById('preset-editor') as AgentPresetEditorModal | null;
    if (!presetEditor) return;

    presetEditor.configure({
      mode: 'create'
    });
    presetEditor.setAttribute('open', 'true');
  }

  /**
   * Update the selection count display
   */
  /**
   * Update the agent list UI (for search filtering)
   */
  private updateAgentList() {
    const listEl = this.shadowRoot?.querySelector('.agent-list');
    if (listEl) {
      listEl.innerHTML = this.renderAgentList();
      // Re-attach event handlers for the new list
      this.attachAgentListHandlers();
      // Sync selection state visuals
      this.updateAgentListSelectionState();
    }
  }

  /**
   * Update agent row/button visuals based on current selection
   */
  private updateAgentListSelectionState() {
    this.shadowRoot?.querySelectorAll('.agent-row').forEach(row => {
      const presetId = row.getAttribute('data-preset-id');
      const isSelected = !!presetId && this.selectedPresets.has(presetId);
      row.classList.toggle('selected', isSelected);
    });

    this.shadowRoot?.querySelectorAll('.agent-add-btn').forEach(btn => {
      const presetId = btn.getAttribute('data-preset-id');
      const isSelected = !!presetId && this.selectedPresets.has(presetId);
      btn.classList.toggle('added', isSelected);
      btn.textContent = isSelected ? '−' : '+';
      btn.setAttribute('title', isSelected ? 'Remove from team' : 'Add to team');
    });
  }

  /**
   * Attach event handlers to agent list items
   */
  private attachAgentListHandlers() {
    this.shadowRoot?.querySelectorAll('.agent-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = btn.getAttribute('data-preset-id');
        if (!presetId) return;
        
        if (this.selectedPresets.has(presetId)) {
          this.selectedPresets.delete(presetId);
        } else {
          this.selectedPresets.add(presetId);
        }
        
        this.updateSelectionUI();
      });
    });

    this.shadowRoot?.querySelectorAll('.agent-row').forEach(row => {
      row.addEventListener('click', () => {
        const presetId = row.getAttribute('data-preset-id');
        if (!presetId) return;
        
        if (this.selectedPresets.has(presetId)) {
          this.selectedPresets.delete(presetId);
        } else {
          this.selectedPresets.add(presetId);
        }
        
        this.updateSelectionUI();
      });
    });
  }

  /**
   * Update team panel visuals (count and member list)
   */
  private updateTeamPanel() {
    const teamCount = this.shadowRoot?.querySelector('.team-count');
    if (teamCount) {
      const count = this.selectedPresets.size;
      teamCount.textContent = `${count} agents ${count < 2 ? '(min 2)' : ''}`;
    }

    const teamMembers = this.shadowRoot?.querySelector('.team-members') as HTMLElement | null;
    const teamEmpty = this.shadowRoot?.querySelector('.team-empty') as HTMLElement | null;

    if (!teamMembers || !teamEmpty) return;

    if (this.selectedPresets.size === 0) {
      teamMembers.style.display = 'none';
      teamEmpty.style.display = 'block';
      teamMembers.innerHTML = '';
      return;
    }

    const membersHtml = Array.from(this.selectedPresets).map(id => {
      const preset = this.presets.find(p => p.id === id);
      if (!preset) return '';
      const initials = preset.name.slice(0, 2).toUpperCase();
      return `
        <div class="team-agent" data-preset-id="${id}">
          <div class="agent-avatar">${initials}</div>
          <div class="agent-info">
            <span class="agent-name">${preset.name}</span>
            <span class="agent-expertise">${preset.expertise.split(',')[0]}</span>
          </div>
          <button type="button" class="remove-agent-btn" data-preset-id="${id}" title="Remove">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    teamMembers.innerHTML = membersHtml;
    teamMembers.style.display = 'flex';
    teamEmpty.style.display = 'none';

    // Re-attach remove handlers
    this.shadowRoot?.querySelectorAll('.remove-agent-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetId = btn.getAttribute('data-preset-id');
        if (presetId) {
          this.selectedPresets.delete(presetId);
          this.updateSelectionUI();
        }
      });
    });
  }

  /**
   * Update all selection-related UI without full re-render
   */
  private updateSelectionUI() {
    this.updateTeamPanel();
    this.updateAgentListSelectionState();
    this.updateSubmitButtonState();
  }

  /**
   * Update submit button enabled/disabled state
   */
  private updateSubmitButtonState() {
    const submitBtn = this.shadowRoot?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) {
      const hasEnoughAgents = this.selectedPresets.size >= 2;
      const hasModel = !!this.selectedModelId || this.providers.some(p => p.isActive && (p.models?.length ?? 0) > 0);
      submitBtn.disabled = !(hasEnoughAgents && hasModel);
    }
  }

  /**
   * Get filtered presets based on search query
   */
  private getFilteredPresets(): AgentPreset[] {
    if (!this.agentSearchQuery.trim()) {
      return this.presets;
    }
    const query = this.agentSearchQuery.toLowerCase();
    return this.presets.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.expertise.toLowerCase().includes(query)
    );
  }

  /**
   * Render the agent list with add buttons
   */
  private renderAgentList(): string {
    const filteredPresets = this.getFilteredPresets();
    
    if (filteredPresets.length === 0) {
      return `<div class="agent-list-empty">No agents found</div>`;
    }

    return filteredPresets.map(preset => {
      const isSelected = this.selectedPresets.has(preset.id);
      return `
        <div class="agent-row ${isSelected ? 'selected' : ''}" data-preset-id="${preset.id}">
          <span class="agent-row-name">${preset.name}</span>
          <span class="agent-row-tag">${preset.expertise.split(',')[0]}</span>
          <button type="button" class="agent-add-btn ${isSelected ? 'added' : ''}" 
                  data-preset-id="${preset.id}" 
                  title="${isSelected ? 'Remove from team' : 'Add to team'}">
            ${isSelected ? '−' : '+'}
          </button>
        </div>
      `;
    }).join('');
  }

  /**
   * Capture user-entered fields from the current DOM so a subsequent render
   * doesn't wipe them.
   */
  private captureDraftFromDom(): void {
    if (!this.shadowRoot) return;
    const subjectEl = this.shadowRoot.getElementById('subject') as HTMLInputElement | null;
    const goalEl = this.shadowRoot.getElementById('goal') as HTMLTextAreaElement | null;
    if (subjectEl) this.draftSubject = subjectEl.value;
    if (goalEl) this.draftGoal = goalEl.value;

    const modeEl = this.shadowRoot.querySelector('.mode-option.selected') as HTMLElement | null;
    const mode = (modeEl?.getAttribute('data-mode') || '') as ConversationMode;
    if (mode) this.selectedMode = mode;
  }

  /**
   * Re-apply stateful values to freshly rendered DOM nodes.
   * (We intentionally avoid interpolating user text directly into HTML.)
   */
  private hydrateDraftToDom(): void {
    if (!this.shadowRoot) return;
    const subjectEl = this.shadowRoot.getElementById('subject') as HTMLInputElement | null;
    const goalEl = this.shadowRoot.getElementById('goal') as HTMLTextAreaElement | null;
    if (subjectEl && subjectEl.value !== this.draftSubject) subjectEl.value = this.draftSubject;
    if (goalEl && goalEl.value !== this.draftGoal) goalEl.value = this.draftGoal;

    const openingEl = this.shadowRoot.getElementById('opening-statement') as HTMLTextAreaElement | null;
    if (openingEl && openingEl.value !== this.customOpeningStatement) openingEl.value = this.customOpeningStatement;
  }

  private renderPreservingDraft(): void {
    this.captureDraftFromDom();
    this.render();
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
    
    const canCreate = this.selectedPresets.size >= 2 && hasModels && hasActiveProvider;

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

        /* Simplified Agent Selection */
        .agent-selection-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .step-label {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-2);
          display: block;
        }

        /* Quick Start Section */
        .quick-start-section {
          padding: var(--space-3);
          background: var(--color-primary-dim);
          border-radius: var(--radius-md);
        }

        .quick-team-buttons {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .quick-team-btn {
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-primary);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .quick-team-btn:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-primary);
          transform: translateY(-1px);
        }

        .quick-team-btn .team-icon {
          font-size: var(--text-base);
        }

        /* Selection Divider */
        .selection-divider {
          text-align: center;
          color: var(--color-text-tertiary);
          position: relative;
          font-size: var(--text-sm);
        }

        .selection-divider::before,
        .selection-divider::after {
          content: '';
          position: absolute;
          top: 50%;
          width: 40%;
          height: 1px;
          background: var(--color-border);
        }

        .selection-divider::before {
          left: 0;
        }

        .selection-divider::after {
          right: 0;
        }

        /* Agent Browser */
        .agent-browser {
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          overflow: hidden;
        }

        .agent-browser .step-label {
          padding: var(--space-3);
          padding-bottom: 0;
        }

        .agent-search-wrapper {
          position: relative;
          padding: var(--space-2) var(--space-3);
        }

        .agent-search-icon {
          position: absolute;
          left: calc(var(--space-3) + 10px);
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-tertiary);
          pointer-events: none;
        }

        .agent-search-input {
          width: 100%;
          padding: var(--space-2) var(--space-3);
          padding-left: 32px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-primary);
          font-size: var(--text-sm);
        }

        .agent-search-input:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        .agent-list {
          max-height: 200px;
          overflow-y: auto;
          border-top: 1px solid var(--color-border);
        }

        .agent-list-empty {
          padding: var(--space-4);
          text-align: center;
          color: var(--color-text-tertiary);
          font-size: var(--text-sm);
        }

        .agent-row {
          display: flex;
          align-items: center;
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--color-border);
          transition: background var(--transition-fast);
        }

        .agent-row:last-child {
          border-bottom: none;
        }

        .agent-row:hover {
          background: var(--color-surface-hover);
        }

        .agent-row.selected {
          background: var(--color-primary-dim);
        }

        .agent-row-name {
          flex: 1;
          font-size: var(--text-sm);
          color: var(--color-text-primary);
        }

        .agent-row-tag {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          margin-right: var(--space-2);
        }

        .agent-add-btn {
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-secondary);
          font-size: var(--text-lg);
          font-weight: var(--font-bold);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all var(--transition-fast);
        }

        .agent-add-btn:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .agent-add-btn.added {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: white;
        }

        /* Selected Team Panel */
        .selected-team-panel {
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
        }

        .team-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .team-header .step-label {
          margin-bottom: 0;
        }

        .team-count {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          padding: 2px 8px;
          border-radius: var(--radius-full);
        }

        .team-empty {
          padding: var(--space-4);
          text-align: center;
          color: var(--color-text-tertiary);
          font-size: var(--text-sm);
        }

        .team-members {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .team-agent {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2);
          background: var(--color-surface);
          border-radius: var(--radius-md);
          transition: background var(--transition-fast);
        }

        .team-agent:hover {
          background: var(--color-surface-hover);
        }

        .team-agent .agent-avatar {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-full);
          background: var(--color-primary-dim);
          color: var(--color-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-xs);
          font-weight: var(--font-bold);
          flex-shrink: 0;
        }

        .team-agent .agent-info {
          flex: 1;
          min-width: 0;
        }

        .team-agent .agent-name {
          display: block;
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
        }

        .team-agent .agent-expertise {
          display: block;
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .remove-agent-btn {
          padding: var(--space-1);
          background: transparent;
          border: none;
          color: var(--color-text-tertiary);
          cursor: pointer;
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }

        .remove-agent-btn:hover {
          background: rgba(239, 68, 68, 0.1);
          color: var(--color-error);
        }

        .add-custom-agent-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          width: 100%;
          padding: var(--space-2) var(--space-3);
          margin-top: var(--space-2);
          background: transparent;
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .add-custom-agent-btn:hover {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .add-custom-agent-btn svg {
          opacity: 0.7;
        }

        .add-custom-agent-btn:hover svg {
          opacity: 1;
        }

        /* MCP Server Selection */
        .mcp-server-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          padding: var(--space-2);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          max-height: 150px;
          overflow-y: auto;
        }

        .mcp-server-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .mcp-server-item:hover {
          background: var(--color-surface-hover);
        }

        .mcp-server-item:has(input:checked) {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .mcp-server-item input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: var(--color-primary);
        }

        .mcp-server-info {
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        .mcp-server-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
        }

        .mcp-server-tools {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        /* Tool Approval Mode Toggle */
        .approval-mode-toggle {
          display: flex;
          gap: var(--space-3);
        }

        .approval-option {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--color-surface);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .approval-option:hover {
          background: var(--color-surface-hover);
        }

        .approval-option.selected {
          border-color: var(--color-primary);
          background: var(--color-primary-dim);
        }

        .approval-option input {
          display: none;
        }

        .approval-icon {
          font-size: 20px;
        }

        .approval-info {
          display: flex;
          flex-direction: column;
        }

        .approval-name {
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
        }

        .approval-desc {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
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

        /* Strategy Picker Styles */
        .strategy-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-2);
        }

        @media (max-width: 560px) {
          .strategy-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .strategy-card {
          padding: var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: center;
          transition: all var(--transition-fast);
        }

        .strategy-card:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          transform: translateY(-1px);
        }

        .strategy-card.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          box-shadow: 0 0 0 1px var(--color-primary);
        }

        .strategy-icon {
          font-size: var(--text-2xl);
          margin-bottom: var(--space-1);
          display: block;
        }

        .strategy-name {
          font-weight: var(--font-medium);
          font-size: var(--text-xs);
          color: var(--color-text-primary);
          margin-bottom: 2px;
        }

        .strategy-desc {
          font-size: 10px;
          color: var(--color-text-tertiary);
          line-height: 1.3;
        }

        /* Template selector */
        .template-row {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-top: var(--space-3);
        }

        .template-row .form-select {
          flex: 1;
        }

        .template-label {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          display: flex;
          align-items: center;
          gap: var(--space-1);
          white-space: nowrap;
        }

        /* Opening statement toggle */
        .opening-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-top: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          transition: all var(--transition-fast);
        }

        .opening-toggle:hover {
          color: var(--color-text-primary);
          background: var(--color-surface);
        }

        .opening-toggle-icon {
          transition: transform 0.2s ease;
        }

        .opening-toggle.expanded .opening-toggle-icon {
          transform: rotate(90deg);
        }

        .opening-statement-field {
          margin-top: var(--space-2);
          display: none;
        }

        .opening-statement-field.visible {
          display: block;
        }

        .opening-statement-field .form-textarea {
          min-height: 60px;
          font-size: var(--text-sm);
        }

        .opening-hint {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-top: var(--space-1);
        }

        /* Depth Selector Styles */
        .depth-selector {
          display: flex;
          gap: var(--space-1);
          padding: var(--space-1);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
        }

        .depth-option {
          flex: 1;
          padding: var(--space-2) var(--space-1);
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: center;
          transition: all var(--transition-fast);
          min-width: 0;
        }

        .depth-option:hover {
          background: var(--color-surface-hover);
        }

        .depth-option.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          box-shadow: 0 0 0 1px var(--color-primary);
        }

        .depth-option .depth-icon {
          font-size: var(--text-lg);
          display: block;
          margin-bottom: 2px;
        }

        .depth-option .depth-name {
          font-weight: var(--font-medium);
          font-size: var(--text-xs);
          color: var(--color-text-primary);
          white-space: nowrap;
        }

        .depth-option .depth-desc {
          font-size: 9px;
          color: var(--color-text-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media (max-width: 560px) {
          .depth-option .depth-desc {
            display: none;
          }
        }

        /* Translation Modal Styles */
        .translation-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: calc(var(--z-modal, 400) + 10);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
        }

        .translation-modal {
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          width: 400px;
          max-width: 90vw;
          box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.5);
        }

        .translation-modal h3 {
          margin: 0 0 var(--space-4) 0;
          color: var(--color-text-primary);
          font-size: var(--text-lg);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .translation-modal p {
          margin: 0 0 var(--space-4) 0;
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          line-height: 1.5;
        }

        .translation-progress {
          margin: var(--space-4) 0;
        }

        .progress-bar {
          height: 8px;
          background: var(--color-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
          border-radius: var(--radius-full);
          transition: width 0.3s ease;
        }

        .progress-text {
          margin-top: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          text-align: center;
        }

        .translation-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          margin-top: var(--space-4);
        }

        .translation-btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          font-size: var(--text-sm);
        }

        .translation-btn.cancel {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
        }

        .translation-btn.cancel:hover {
          background: var(--color-surface-hover);
        }

        .translation-btn.primary {
          background: var(--color-primary);
          border: none;
          color: white;
        }

        .translation-btn.primary:hover {
          opacity: 0.9;
        }

        .translation-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .translation-error {
          margin-top: var(--space-3);
          padding: var(--space-3);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          color: var(--color-error);
          font-size: var(--text-sm);
        }

        .translation-info {
          margin-top: var(--space-3);
          padding: var(--space-3);
          background: var(--color-primary-dim);
          border: 1px solid var(--color-primary);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
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

              <!-- Starting Strategy Section -->
              <div class="form-group">
                <label class="form-label">Starting Strategy</label>
                <div class="strategy-grid">
                  ${startingStrategies.map(strategy => `
                    <div class="strategy-card ${this.selectedStrategyId === strategy.id ? 'selected' : ''}" 
                         data-strategy-id="${strategy.id}" 
                         title="${strategy.description}">
                      <span class="strategy-icon">${strategy.icon}</span>
                      <div class="strategy-name">${strategy.name}</div>
                      <div class="strategy-desc">${strategy.shortDescription}</div>
                    </div>
                  `).join('')}
                </div>

                <!-- Quick Template Selector -->
                <div class="template-row">
                  <span class="template-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <line x1="9" y1="9" x2="15" y2="9"/>
                      <line x1="9" y1="13" x2="15" y2="13"/>
                      <line x1="9" y1="17" x2="12" y2="17"/>
                    </svg>
                    Template:
                  </span>
                  <select class="form-select" id="template-select">
                    <option value="">None (custom)</option>
                    ${templateCategories.map(cat => {
                      const templates = conversationTemplates.filter(t => t.category === cat.id);
                      if (templates.length === 0) return '';
                      return `
                        <optgroup label="${cat.icon} ${cat.name}">
                          ${templates.map(t => `
                            <option value="${t.id}" ${this.selectedTemplateId === t.id ? 'selected' : ''}>
                              ${t.icon} ${t.name}
                            </option>
                          `).join('')}
                        </optgroup>
                      `;
                    }).join('')}
                  </select>
                </div>

                <!-- Opening Statement Toggle -->
                <div class="opening-toggle ${this.showOpeningStatementField ? 'expanded' : ''}" id="opening-toggle">
                  <svg class="opening-toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                  Custom opening statement
                </div>
                <div class="opening-statement-field ${this.showOpeningStatementField ? 'visible' : ''}">
                  <textarea class="form-textarea" id="opening-statement" 
                    placeholder="Set the stage for your discussion. This will be shown to all agents at the start..."
                  >${this.customOpeningStatement}</textarea>
                  <div class="opening-hint">Leave empty to use the strategy's default opening.</div>
                </div>
              </div>

              <div class="section-divider"></div>

              <div class="form-group">
                <label class="form-label">Conversation Mode</label>
                <div class="mode-selector">
                  <div class="mode-option ${this.selectedMode === 'round-robin' ? 'selected' : ''}" data-mode="round-robin">
                    <div class="mode-icon">🔄</div>
                    <div class="mode-name">Round Robin</div>
                  </div>
                  <div class="mode-option ${this.selectedMode === 'moderator' ? 'selected' : ''}" data-mode="moderator">
                    <div class="mode-icon">👨‍⚖️</div>
                    <div class="mode-name">Moderated</div>
                  </div>
                  <div class="mode-option ${this.selectedMode === 'dynamic' ? 'selected' : ''}" data-mode="dynamic">
                    <div class="mode-icon">💬</div>
                    <div class="mode-name">Dynamic</div>
                  </div>
                </div>
              </div>

              <!-- Conversation Depth -->
              <div class="form-group">
                <label class="form-label">Response Depth</label>
                <div class="depth-selector">
                  ${DEPTH_LEVELS.map(level => `
                    <div class="depth-option ${this.selectedDepth === level.id ? 'selected' : ''}" 
                         data-depth="${level.id}" 
                         title="${level.description}">
                      <span class="depth-icon">${level.icon}</span>
                      <div class="depth-name">${level.name}</div>
                      <div class="depth-desc">${level.description}</div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Target Language -->
              <div class="form-group">
                <label class="form-label">Target Language</label>
                <select class="form-select" id="target-language">
                  ${this.enabledLanguages.map(lang => `
                    <option value="${lang.code}" ${this.selectedLanguage === lang.code ? 'selected' : ''}>
                      ${lang.name}${lang.code ? ` (${lang.nativeName})` : ''}
                    </option>
                  `).join('')}
                </select>
                <div class="form-hint" style="margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-text-tertiary);">
                  All agents will respond in the selected language
                </div>
              </div>

              ${this.mcpServers.length > 0 ? `
              <!-- MCP Servers -->
              <div class="form-group">
                <label class="form-label">MCP Tools (Optional)</label>
                <div class="mcp-server-list">
                  ${this.mcpServers.map(server => `
                    <label class="mcp-server-item">
                      <input type="checkbox" 
                        class="mcp-server-checkbox" 
                        data-server-id="${server.id}"
                        ${this.selectedMcpServerIds.has(server.id) ? 'checked' : ''}
                      >
                      <span class="mcp-server-info">
                        <span class="mcp-server-name">${server.name}</span>
                        <span class="mcp-server-tools">${server.tools.length} tools</span>
                      </span>
                    </label>
                  `).join('')}
                </div>
                <div class="form-hint" style="margin-top: var(--space-2); font-size: var(--text-xs); color: var(--color-text-tertiary);">
                  Select MCP servers to provide tools agents can use during the conversation
                </div>
              </div>

              ${this.selectedMcpServerIds.size > 0 ? `
              <div class="form-group">
                <label class="form-label">Tool Approval Mode</label>
                <div class="approval-mode-toggle">
                  <label class="approval-option ${this.mcpToolApprovalMode === 'auto' ? 'selected' : ''}">
                    <input type="radio" name="approval-mode" value="auto" 
                      ${this.mcpToolApprovalMode === 'auto' ? 'checked' : ''}>
                    <span class="approval-icon">⚡</span>
                    <span class="approval-info">
                      <span class="approval-name">Automatic</span>
                      <span class="approval-desc">Agents can use tools freely</span>
                    </span>
                  </label>
                  <label class="approval-option ${this.mcpToolApprovalMode === 'approval' ? 'selected' : ''}">
                    <input type="radio" name="approval-mode" value="approval"
                      ${this.mcpToolApprovalMode === 'approval' ? 'checked' : ''}>
                    <span class="approval-icon">✋</span>
                    <span class="approval-info">
                      <span class="approval-name">With Approval</span>
                      <span class="approval-desc">You approve each tool call</span>
                    </span>
                  </label>
                </div>
              </div>
              ` : ''}
              ` : ''}

              <div class="section-divider"></div>

              <!-- LLM Provider & Model -->
              <div class="form-group">
                <label class="form-label">LLM Provider & Model</label>
                  <div class="inline-select">
                    <select class="form-select" id="${this.elId('provider')}">
                      ${this.providers.map(p => `
                        <option value="${p.id}" ${!p.isActive ? 'disabled' : ''} ${p.id === providerId ? 'selected' : ''}>
                          ${p.name} ${!p.isActive ? '(not configured)' : ''}
                        </option>
                      `).join('')}
                    </select>
                    <select class="form-select" id="${this.elId('model')}" ${!hasModels ? 'disabled' : ''}>
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

              <!-- Agent Selection -->
              <div class="form-group agent-selection-group">
                
                <!-- Step 1: Quick Start -->
                <div class="quick-start-section">
                  <label class="step-label">Step 1: Pick a team</label>
                  <div class="quick-team-buttons">
                    ${QUICK_TEAMS.map(team => `
                      <button type="button" class="quick-team-btn" data-team-id="${team.id}">
                        <span class="team-icon">${team.icon}</span>
                        ${team.name}
                      </button>
                    `).join('')}
                  </div>
                    </div>

                <!-- Divider -->
                <div class="selection-divider">
                  <span>or build your own</span>
                  </div>
                  
                <!-- Step 2: Agent Browser -->
                <div class="agent-browser">
                  <label class="step-label">Step 2: Pick individual agents</label>
                  <div class="agent-search-wrapper">
                    <svg class="agent-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="11" cy="11" r="8"/>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" class="agent-search-input" id="agent-search" 
                           placeholder="Search agents..." 
                           value="${this.agentSearchQuery}">
                    </div>
                    <div class="agent-list">
                    ${this.renderAgentList()}
                  </div>
                </div>

                <!-- Your Team Panel -->
                <div class="selected-team-panel">
                  <div class="team-header">
                    <label class="step-label">Your Team</label>
                    <span class="team-count">${this.selectedPresets.size} agents ${this.selectedPresets.size < 2 ? '(min 2)' : ''}</span>
                            </div>
                  ${this.selectedPresets.size > 0 ? `
                    <div class="team-members">
                      ${Array.from(this.selectedPresets).map(id => {
                        const preset = this.presets.find(p => p.id === id);
                        if (!preset) return '';
                        const initials = preset.name.slice(0, 2).toUpperCase();
                        return `
                          <div class="team-agent" data-preset-id="${id}">
                            <div class="agent-avatar">${initials}</div>
                            <div class="agent-info">
                              <span class="agent-name">${preset.name}</span>
                              <span class="agent-expertise">${preset.expertise.split(',')[0]}</span>
                              </div>
                            <button type="button" class="remove-agent-btn" data-preset-id="${id}" title="Remove">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : `
                    <div class="team-empty">
                      No agents selected yet
                    </div>
                  `}
                  <button type="button" class="add-custom-agent-btn" id="${this.elId('add-custom-agent')}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Custom Agent
                  </button>
                </div>

                  </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="${this.elId('cancel-btn')}">Cancel</button>
              <button type="submit" class="btn btn-primary" ${!canCreate ? 'disabled' : ''}>
                Create Conversation
              </button>
            </div>
          </form>
        </div>
      </div>

      <agent-editor-modal id="agent-editor"></agent-editor-modal>
      <agent-preset-editor-modal id="preset-editor"></agent-preset-editor-modal>
    `;

    this.setupEventHandlers();
    this.hydrateDraftToDom();
  }

  private setupEventHandlers() {
    // Close button
    this.shadowRoot?.getElementById('close-btn')?.addEventListener('click', () => this.close());
    this.shadowRoot?.getElementById(this.elId('cancel-btn'))?.addEventListener('click', () => this.close());

    // Click outside to close
    this.shadowRoot?.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
        this.close();
      }
    });

    // Subject / Goal draft persistence
    const subjectInput = this.shadowRoot?.getElementById('subject') as HTMLInputElement | null;
    const goalInput = this.shadowRoot?.getElementById('goal') as HTMLTextAreaElement | null;
    subjectInput?.addEventListener('input', () => {
      this.draftSubject = subjectInput.value;
    });
    goalInput?.addEventListener('input', () => {
      this.draftGoal = goalInput.value;
    });

    // Mode selector
    this.shadowRoot?.querySelectorAll('.mode-option').forEach(option => {
      option.addEventListener('click', () => {
        const mode = option.getAttribute('data-mode') as ConversationMode;
        if (mode) this.selectedMode = mode;
        this.shadowRoot?.querySelectorAll('.mode-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      });
    });

    // Depth selector
    this.shadowRoot?.querySelectorAll('.depth-option').forEach(option => {
      option.addEventListener('click', () => {
        const depth = option.getAttribute('data-depth') as ConversationDepth;
        if (depth) {
          this.selectedDepth = depth;
          this.shadowRoot?.querySelectorAll('.depth-option').forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
        }
      });
    });

    // Language selector with availability check
    const languageSelect = this.shadowRoot?.getElementById('target-language') as HTMLSelectElement | null;
    languageSelect?.addEventListener('change', async () => {
      const selectedCode = languageSelect.value;
      
      // English (empty code) is always available
      if (!selectedCode) {
        this.selectedLanguage = selectedCode;
        return;
      }
      
      // Check if language prompts are available
      const isAvailable = await languageService.isLanguageAvailable(selectedCode);
      
      if (isAvailable) {
        this.selectedLanguage = selectedCode;
        // Preload the language prompts for faster access later
        await languageService.preloadLanguage(selectedCode);
      } else {
        // Show translation confirmation modal
        const selectedLang = this.enabledLanguages.find(l => l.code === selectedCode);
        if (selectedLang) {
          this.pendingLanguageSelection = { code: selectedCode, name: selectedLang.name };
          this.showTranslationModal = true;
          // Reset the select to previous value until user confirms
          languageSelect.value = this.selectedLanguage;
          this.renderTranslationModal();
        }
      }
    });

    // MCP server checkboxes
    this.shadowRoot?.querySelectorAll('.mcp-server-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const serverId = (e.target as HTMLInputElement).dataset.serverId;
        if (serverId) {
          if ((e.target as HTMLInputElement).checked) {
            this.selectedMcpServerIds.add(serverId);
          } else {
            this.selectedMcpServerIds.delete(serverId);
          }
          // Re-render to show/hide approval mode section
          this.render();
        }
      });
    });

    // MCP approval mode radio buttons
    this.shadowRoot?.querySelectorAll('input[name="approval-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const mode = (e.target as HTMLInputElement).value as ToolApprovalMode;
        this.mcpToolApprovalMode = mode;
        this.shadowRoot?.querySelectorAll('.approval-option').forEach(o => o.classList.remove('selected'));
        (e.target as HTMLInputElement).closest('.approval-option')?.classList.add('selected');
      });
    });

    // Strategy selector
    this.shadowRoot?.querySelectorAll('.strategy-card').forEach(card => {
      card.addEventListener('click', () => {
        const strategyId = card.getAttribute('data-strategy-id') as StartingStrategyId;
        if (strategyId) {
          this.selectedStrategyId = strategyId;
          this.shadowRoot?.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        }
      });
    });

    // Template selector
    const templateSelect = this.shadowRoot?.getElementById('template-select') as HTMLSelectElement | null;
    templateSelect?.addEventListener('change', () => {
      const templateId = templateSelect.value;
      this.selectedTemplateId = templateId || null;
      
      if (templateId) {
        this.applyTemplate(templateId);
      }
    });

    // Opening statement toggle
    const openingToggle = this.shadowRoot?.getElementById('opening-toggle');
    openingToggle?.addEventListener('click', () => {
      this.showOpeningStatementField = !this.showOpeningStatementField;
      openingToggle.classList.toggle('expanded', this.showOpeningStatementField);
      const field = this.shadowRoot?.querySelector('.opening-statement-field');
      field?.classList.toggle('visible', this.showOpeningStatementField);
    });

    // Opening statement input
    const openingInput = this.shadowRoot?.getElementById('opening-statement') as HTMLTextAreaElement | null;
    openingInput?.addEventListener('input', () => {
      this.customOpeningStatement = openingInput.value;
    });

    // Provider/model selection
    const providerSelect = this.shadowRoot?.getElementById(this.elId('provider')) as HTMLSelectElement | null;
    const modelSelect = this.shadowRoot?.getElementById(this.elId('model')) as HTMLSelectElement | null;

    providerSelect?.addEventListener('change', async () => {
      this.captureDraftFromDom();
      this.selectedProviderId = providerSelect.value;
      this.selectedModelId = null;
      
      // Check if selected provider needs model fetch
      const selectedProvider = this.providers.find(p => p.id === this.selectedProviderId);
      if (selectedProvider && selectedProvider.isActive && selectedProvider.autoFetchModels) {
        if (!selectedProvider.models || selectedProvider.models.length === 0) {
          this.renderPreservingDraft();
          await this.fetchAndPersistModels(selectedProvider.id);
        }
      }
      
      this.renderPreservingDraft();
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
      const providerId = this.selectedProviderId || (this.shadowRoot?.getElementById(this.elId('provider')) as HTMLSelectElement)?.value;
      if (providerId) {
        this.renderPreservingDraft();
        await this.fetchAndPersistModels(providerId);
        this.renderPreservingDraft();
      }
    });

    // Quick team buttons
    this.shadowRoot?.querySelectorAll('.quick-team-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const teamId = btn.getAttribute('data-team-id');
        if (teamId) {
          this.applyQuickTeam(teamId);
          this.updateSelectionUI();
        }
      });
    });

    // Add custom agent button
    this.shadowRoot?.getElementById(this.elId('add-custom-agent'))?.addEventListener('click', () => {
      this.openPresetEditor();
    });

    // Listen for preset saved event
    const presetEditor = this.shadowRoot?.getElementById('preset-editor') as AgentPresetEditorModal | null;
    presetEditor?.addEventListener('preset:saved', async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id) {
        // Reload presets to include the new one
        await this.loadData();
        // Auto-select the newly created preset
        this.selectedPresets.add(detail.id);
        this.renderPreservingDraft();
      }
    });

    // Agent search input
    const agentSearch = this.shadowRoot?.getElementById('agent-search') as HTMLInputElement | null;
    agentSearch?.addEventListener('input', () => {
      this.agentSearchQuery = agentSearch.value;
      this.updateAgentList();
    });

    // Agent add buttons + row click + remove buttons are attached in attachAgentListHandlers/updateTeamPanel
    this.attachAgentListHandlers();
    this.updateTeamPanel();

    // Form submission
    this.shadowRoot?.getElementById('new-conv-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createConversation();
    });
  }

  /**
   * Apply a template to the form
   */
  private applyTemplate(templateId: string) {
    const template = getTemplateById(templateId);
    if (!template) return;

    // Persist template-applied values into state (so future renders keep them)
    this.draftSubject = template.subject;
    this.draftGoal = template.goal;
    this.selectedMode = template.mode;
    this.selectedStrategyId = template.strategy;

    // Update form fields
    const subjectInput = this.shadowRoot?.getElementById('subject') as HTMLInputElement | null;
    const goalInput = this.shadowRoot?.getElementById('goal') as HTMLTextAreaElement | null;
    
    if (subjectInput) subjectInput.value = template.subject;
    if (goalInput) goalInput.value = template.goal;

    // Update strategy
    this.shadowRoot?.querySelectorAll('.strategy-card').forEach(card => {
      const strategyId = card.getAttribute('data-strategy-id');
      card.classList.toggle('selected', strategyId === template.strategy);
    });

    // Update mode
    this.shadowRoot?.querySelectorAll('.mode-option').forEach(option => {
      const mode = option.getAttribute('data-mode');
      option.classList.toggle('selected', mode === template.mode);
    });

    // Update opening statement if template has one
    if (template.openingStatement) {
      this.customOpeningStatement = template.openingStatement;
      this.showOpeningStatementField = true;
      const openingToggle = this.shadowRoot?.getElementById('opening-toggle');
      const openingField = this.shadowRoot?.querySelector('.opening-statement-field');
      const openingInput = this.shadowRoot?.getElementById('opening-statement') as HTMLTextAreaElement | null;
      
      openingToggle?.classList.add('expanded');
      openingField?.classList.add('visible');
      if (openingInput) openingInput.value = template.openingStatement;
    }

    // Select recommended presets if any
    if (template.recommendedPresets.length > 0) {
      this.selectedPresets.clear();
      template.recommendedPresets.forEach(presetId => {
        if (this.presets.some(p => p.id === presetId)) {
          this.selectedPresets.add(presetId);
        }
      });

      // Re-render to update the UI
      this.renderPreservingDraft();
    }
  }

  private async createConversation() {
    const rawSubject = (this.shadowRoot?.getElementById('subject') as HTMLInputElement)?.value;
    const rawGoal = (this.shadowRoot?.getElementById('goal') as HTMLTextAreaElement)?.value;
    const modeElement = this.shadowRoot?.querySelector('.mode-option.selected') as HTMLElement;
    const mode = (modeElement?.getAttribute('data-mode') || 'round-robin') as ConversationMode;

    // Validate and sanitize inputs
    const subjectValidation = validateSubject(rawSubject);
    if (!subjectValidation.valid) {
      this.showValidationError('subject', subjectValidation.error || 'Invalid subject');
      return;
    }

    const goalValidation = validateGoal(rawGoal);
    if (!goalValidation.valid) {
      this.showValidationError('goal', goalValidation.error || 'Invalid goal');
        return;
      }

    const subject = sanitizeInput(rawSubject);
    const goal = sanitizeInput(rawGoal);

    // Use selected presets with shared LLM
      const providerId =
        this.selectedProviderId ||
        (this.shadowRoot?.getElementById(this.elId('provider')) as HTMLSelectElement)?.value;
      const modelId =
        this.selectedModelId ||
        (this.shadowRoot?.getElementById(this.elId('model')) as HTMLSelectElement)?.value;

      if (!providerId || !modelId || this.selectedPresets.size < 2) {
        return;
      }

    const agentConfigs = Array.from(this.selectedPresets).map(presetId => ({
        presetId,
        llmProviderId: providerId,
        modelId,
      }));

    try {
      // Build opening statement and ground rules from strategy (in target language if set)
      const targetLang = this.selectedLanguage || undefined;
      const strategy = getStrategyById(this.selectedStrategyId, targetLang);
      const openingStatement = this.customOpeningStatement || 
        (strategy ? buildOpeningStatement(strategy, subject, goal, undefined, targetLang) : undefined);
      const groundRules = strategy ? buildGroundRules(strategy, undefined, targetLang) : undefined;

      const engine = await ConversationEngine.create(
        subject,
        goal,
        mode,
        agentConfigs,
        {
          speedMs: 2000,
          maxContextTokens: 8000,
          includeSecretary: true,
          startingStrategy: this.selectedStrategyId,
          openingStatement,
          groundRules,
          conversationDepth: this.selectedDepth,
          targetLanguage: this.selectedLanguage || undefined,
          mcpServerIds: this.selectedMcpServerIds.size > 0 ? Array.from(this.selectedMcpServerIds) : undefined,
          mcpToolApprovalMode: this.selectedMcpServerIds.size > 0 ? this.mcpToolApprovalMode : undefined,
        }
      );

      this.close();
      eventBus.emit('conversation:selected', engine.getConversation().id);
    } catch (error) {
      console.error('[NewConversationModal] Failed to create conversation:', error);
    }
  }

  /**
   * Render the translation confirmation/progress modal
   */
  private renderTranslationModal(): void {
    // Remove existing modal if any
    const existingModal = this.shadowRoot?.querySelector('.translation-modal-overlay');
    if (existingModal) {
      existingModal.remove();
    }

    if (!this.showTranslationModal || !this.pendingLanguageSelection) return;

    const { name } = this.pendingLanguageSelection;
    const isTranslating = this.translationProgress?.status === 'translating';
    const hasFailed = this.translationProgress?.status === 'failed';
    const hasCompleted = this.translationProgress?.status === 'completed';

    const modalHtml = `
      <div class="translation-modal-overlay">
        <div class="translation-modal">
          <h3>
            🌐 Language Translation Required
          </h3>
          
          ${hasCompleted ? `
            <p style="color: var(--color-success);">
              ✓ ${name} prompts have been translated successfully!
            </p>
          ` : isTranslating ? `
            <p>
              Translating prompts to ${name}...
            </p>
            <div class="translation-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${this.translationProgress?.progress || 0}%"></div>
              </div>
              <div class="progress-text">${this.translationProgress?.currentSection || 'Initializing...'}</div>
            </div>
          ` : `
            <p>
              Prompts for <strong>${name}</strong> are not yet available. 
              Would you like to translate them now using your default LLM?
            </p>
            <div class="translation-info">
              ℹ️ This will use your configured LLM to translate all system prompts 
              to ${name}. The translation will be saved locally for future use.
            </div>
          `}

          ${hasFailed ? `
            <div class="translation-error">
              Translation failed: ${this.translationProgress?.error || 'Unknown error'}
            </div>
          ` : ''}

          <div class="translation-modal-actions">
            ${hasCompleted ? `
              <button type="button" class="translation-btn primary" id="translation-done">
                Done
              </button>
            ` : isTranslating ? `
              <button type="button" class="translation-btn cancel" disabled>
                Translating...
              </button>
            ` : `
              <button type="button" class="translation-btn cancel" id="translation-cancel">
                Cancel
              </button>
              <button type="button" class="translation-btn primary" id="translation-confirm">
                Translate Now
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    // Append to shadow root
    const template = document.createElement('template');
    template.innerHTML = modalHtml;
    this.shadowRoot?.appendChild(template.content.cloneNode(true));

    // Bind events
    this.bindTranslationModalEvents();
  }

  /**
   * Bind events for translation modal buttons
   */
  private bindTranslationModalEvents(): void {
    const cancelBtn = this.shadowRoot?.getElementById('translation-cancel');
    const confirmBtn = this.shadowRoot?.getElementById('translation-confirm');
    const doneBtn = this.shadowRoot?.getElementById('translation-done');
    const overlay = this.shadowRoot?.querySelector('.translation-modal-overlay');

    cancelBtn?.addEventListener('click', () => {
      this.closeTranslationModal();
    });

    confirmBtn?.addEventListener('click', () => {
      this.startTranslation();
    });

    doneBtn?.addEventListener('click', () => {
      this.closeTranslationModal();
    });

    // Close on overlay click (only if not translating)
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay && this.translationProgress?.status !== 'translating') {
        this.closeTranslationModal();
      }
    });
  }

  /**
   * Close translation modal and reset state
   */
  private closeTranslationModal(): void {
    const wasCompleted = this.translationProgress?.status === 'completed';
    
    this.showTranslationModal = false;
    
    // If translation completed, apply the language selection
    if (wasCompleted && this.pendingLanguageSelection) {
      this.selectedLanguage = this.pendingLanguageSelection.code;
      const languageSelect = this.shadowRoot?.getElementById('target-language') as HTMLSelectElement | null;
      if (languageSelect) {
        languageSelect.value = this.selectedLanguage;
      }
    }
    
    this.translationProgress = null;
    this.pendingLanguageSelection = null;
    
    // Remove modal from DOM
    const modal = this.shadowRoot?.querySelector('.translation-modal-overlay');
    modal?.remove();
  }

  /**
   * Start the translation process
   */
  private async startTranslation(): Promise<void> {
    if (!this.pendingLanguageSelection) return;

    const { code, name } = this.pendingLanguageSelection;

    try {
      // Set initial progress
      this.translationProgress = {
        languageCode: code,
        languageName: name,
        progress: 0,
        currentSection: 'Starting translation...',
        status: 'translating',
      };
      this.renderTranslationModal();

      // Start translation with progress callback
      await languageService.translateLanguage(code, name, (progress: TranslationProgress) => {
        this.translationProgress = progress;
        this.renderTranslationModal();
      });

      // Translation complete
      this.translationProgress = {
        languageCode: code,
        languageName: name,
        progress: 100,
        currentSection: 'Complete',
        status: 'completed',
      };
      this.renderTranslationModal();
    } catch (error) {
      console.error('[NewConversationModal] Translation failed:', error);
      this.translationProgress = {
        languageCode: code,
        languageName: name,
        progress: 0,
        currentSection: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
      this.renderTranslationModal();
    }
  }
}

customElements.define('new-conversation-modal', NewConversationModal);
