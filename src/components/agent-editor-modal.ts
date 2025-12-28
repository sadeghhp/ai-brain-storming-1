// ============================================
// AI Brainstorm - Agent Editor Modal
// Version: 1.1.0
// ============================================

import { presetStorage, providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { Agent, AgentPreset, LLMProvider, CreateAgent } from '../types';

export interface AgentEditorConfig {
  mode: 'create' | 'edit';
  agent?: Partial<Agent>;
  presetId?: string;
  conversationId?: string;
  order?: number;
}

export interface AgentEditorResult {
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

export class AgentEditorModal extends HTMLElement {
  private config: AgentEditorConfig = { mode: 'create' };
  private presets: AgentPreset[] = [];
  private providers: LLMProvider[] = [];
  private selectedPresetId: string | null = null;
  private formData: Partial<AgentEditorResult> = {};

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
    if (name === 'open' && newValue === 'true') {
      this.loadData().then(() => this.render());
    }
  }

  configure(config: AgentEditorConfig) {
    this.config = config;
    this.selectedPresetId = config.presetId || null;
    
    // Initialize form data from config
    if (config.agent) {
      this.formData = {
        name: config.agent.name || '',
        role: config.agent.role || '',
        expertise: config.agent.expertise || '',
        thinkingDepth: config.agent.thinkingDepth ?? 3,
        creativityLevel: config.agent.creativityLevel ?? 3,
        notebookUsage: config.agent.notebookUsage ?? 50,
        llmProviderId: config.agent.llmProviderId || '',
        modelId: config.agent.modelId || '',
        presetId: config.agent.presetId,
      };
    } else {
      this.formData = {
        thinkingDepth: 3,
        creativityLevel: 3,
        notebookUsage: 50,
      };
    }

    if (config.presetId) {
      this.loadPresetData(config.presetId);
    }
  }

  private async loadData() {
    this.presets = await presetStorage.getAll();
    this.providers = await providerStorage.getAll();
  }

  private async loadPresetData(presetId: string) {
    const preset = await presetStorage.getById(presetId);
    if (preset) {
      this.formData = {
        ...this.formData,
        name: preset.name,
        role: preset.name,
        expertise: preset.expertise,
        systemPrompt: preset.systemPrompt,
        strengths: preset.strengths,
        thinkingStyle: preset.thinkingStyle,
        thinkingDepth: preset.defaultThinkingDepth,
        creativityLevel: preset.defaultCreativityLevel,
        presetId: preset.id,
      };
      this.selectedPresetId = presetId;
      this.render();
    }
  }

  private close() {
    this.setAttribute('open', 'false');
    this.dispatchEvent(new CustomEvent('agent:cancelled'));
  }

  private getActiveProvider(): LLMProvider | undefined {
    const providerId = this.formData.llmProviderId;
    if (providerId) {
      return this.providers.find(p => p.id === providerId);
    }
    return this.providers.find(p => p.isActive);
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';
    const isEditMode = this.config.mode === 'edit';
    const activeProvider = this.getActiveProvider();

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: var(--z-modal, 500);
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

        .section {
          margin-bottom: var(--space-6);
        }

        .section:last-child {
          margin-bottom: 0;
        }

        .section-title {
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: var(--space-3);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .section-title::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--color-border);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }

        .form-group {
          margin-bottom: var(--space-4);
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
          min-height: 100px;
          resize: vertical;
          line-height: 1.5;
          font-family: var(--font-mono, monospace);
          font-size: var(--text-sm);
        }

        .form-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23606070' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
        }

        .form-hint {
          margin-top: var(--space-1);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .preset-selector {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
          padding: var(--space-3);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          max-height: 140px;
          overflow-y: auto;
        }

        .preset-chip {
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: var(--text-sm);
          transition: all var(--transition-fast);
          color: var(--color-text-secondary);
        }

        .preset-chip:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
        }

        .preset-chip.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .slider-group {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .slider-input {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          background: var(--color-border);
          border-radius: var(--radius-full);
          cursor: pointer;
        }

        .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          background: var(--color-primary);
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.1s ease;
        }

        .slider-input::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        .slider-value {
          min-width: 36px;
          text-align: center;
          font-weight: var(--font-semibold);
          color: var(--color-primary);
          background: var(--color-primary-dim);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
        }

        .llm-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-3);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          flex-shrink: 0;
        }

        .btn {
          padding: var(--space-2) var(--space-5);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          font-size: var(--text-sm);
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

        .collapsible-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          padding: var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-3);
          transition: all var(--transition-fast);
        }

        .collapsible-header:hover {
          background: var(--color-surface-hover);
        }

        .collapsible-header .chevron {
          transition: transform 0.2s ease;
        }

        .collapsible-header.expanded .chevron {
          transform: rotate(180deg);
        }

        .collapsible-content {
          display: none;
          padding: var(--space-4);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
        }

        .collapsible-content.expanded {
          display: block;
        }
      </style>

      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2>${isEditMode ? 'Edit Agent' : 'Create Agent'}</h2>
            <button class="close-btn" id="close-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <form id="agent-form">
            <div class="modal-body">
              <!-- Start from Preset -->
              <div class="section">
                <div class="section-title">Start from Template (Optional)</div>
                <div class="preset-selector">
                  <div class="preset-chip ${!this.selectedPresetId ? 'selected' : ''}" data-preset-id="">
                    Custom Agent
                  </div>
                  ${this.presets.map(p => `
                    <div class="preset-chip ${this.selectedPresetId === p.id ? 'selected' : ''}" data-preset-id="${p.id}">
                      ${p.name}
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Basic Info -->
              <div class="section">
                <div class="section-title">Basic Information</div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Name *</label>
                    <input type="text" class="form-input" id="name" 
                           placeholder="e.g., Senior Architect" 
                           value="${this.formData.name || ''}" required>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Role *</label>
                    <input type="text" class="form-input" id="role" 
                           placeholder="e.g., Technical Lead" 
                           value="${this.formData.role || ''}" required>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Expertise *</label>
                  <input type="text" class="form-input" id="expertise" 
                         placeholder="e.g., System architecture, scalability, microservices" 
                         value="${this.formData.expertise || ''}" required>
                  <div class="form-hint">Comma-separated list of expertise areas</div>
                </div>
              </div>

              <!-- LLM Configuration -->
              <div class="section">
                <div class="section-title">LLM Configuration</div>
                <div class="llm-row">
                  <div class="form-group">
                    <label class="form-label">Provider *</label>
                    <select class="form-select" id="provider">
                      ${this.providers.map(p => `
                        <option value="${p.id}" 
                                ${!p.isActive ? 'disabled' : ''} 
                                ${(this.formData.llmProviderId === p.id || (!this.formData.llmProviderId && p.isActive)) ? 'selected' : ''}>
                          ${p.name} ${!p.isActive ? '(not configured)' : ''}
                        </option>
                      `).join('')}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Model *</label>
                    <select class="form-select" id="model">
                      ${activeProvider?.models.map(m => `
                        <option value="${m.id}" ${this.formData.modelId === m.id ? 'selected' : ''}>
                          ${m.name}
                        </option>
                      `).join('') || '<option value="">Select a provider first</option>'}
                    </select>
                  </div>
                </div>
              </div>

              <!-- Behavior Settings -->
              <div class="section">
                <div class="section-title">Behavior Settings</div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">Thinking Depth</label>
                    <div class="slider-group">
                      <input type="range" class="slider-input" id="thinkingDepth" 
                             min="1" max="5" value="${this.formData.thinkingDepth || 3}">
                      <span class="slider-value" id="thinkingDepthValue">${this.formData.thinkingDepth || 3}</span>
                    </div>
                    <div class="form-hint">1 = Quick responses, 5 = Deep analysis</div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Creativity Level</label>
                    <div class="slider-group">
                      <input type="range" class="slider-input" id="creativityLevel" 
                             min="1" max="5" value="${this.formData.creativityLevel || 3}">
                      <span class="slider-value" id="creativityLevelValue">${this.formData.creativityLevel || 3}</span>
                    </div>
                    <div class="form-hint">1 = Conservative, 5 = Creative</div>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Notebook Usage: <span id="notebookUsageValue">${this.formData.notebookUsage || 50}%</span></label>
                  <div class="slider-group">
                    <input type="range" class="slider-input" id="notebookUsage" 
                           min="0" max="100" value="${this.formData.notebookUsage || 50}">
                  </div>
                  <div class="form-hint">Percentage of context to use for agent's personal notes</div>
                </div>
              </div>

              <!-- Advanced: Personality -->
              <div class="section">
                <div class="collapsible-header" id="personality-toggle">
                  <span>Advanced: Personality & Prompt</span>
                  <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
                <div class="collapsible-content" id="personality-content">
                  <div class="form-group">
                    <label class="form-label">System Prompt</label>
                    <textarea class="form-textarea" id="systemPrompt" 
                              placeholder="Custom instructions for this agent's behavior and personality..."
                              rows="6">${this.formData.systemPrompt || ''}</textarea>
                    <div class="form-hint">Override the default system prompt for this agent</div>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label">Strengths</label>
                      <input type="text" class="form-input" id="strengths" 
                             placeholder="e.g., Problem solving, attention to detail"
                             value="${this.formData.strengths || ''}">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Thinking Style</label>
                      <input type="text" class="form-input" id="thinkingStyle" 
                             placeholder="e.g., Analytical, creative, pragmatic"
                             value="${this.formData.thinkingStyle || ''}">
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">
                ${isEditMode ? 'Save Changes' : 'Add Agent'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.setupEventHandlers();
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

    // Preset selection
    this.shadowRoot?.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const presetId = chip.getAttribute('data-preset-id');
        
        // Update UI
        this.shadowRoot?.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');

        if (presetId) {
          this.loadPresetData(presetId);
        } else {
          this.selectedPresetId = null;
          this.formData = {
            ...this.formData,
            presetId: undefined,
          };
        }
      });
    });

    // Provider change - update model list
    const providerSelect = this.shadowRoot?.getElementById('provider') as HTMLSelectElement;
    providerSelect?.addEventListener('change', () => {
      this.formData.llmProviderId = providerSelect.value;
      this.updateModelSelect();
    });

    // Slider value displays
    const thinkingDepth = this.shadowRoot?.getElementById('thinkingDepth') as HTMLInputElement;
    thinkingDepth?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('thinkingDepthValue');
      if (value) value.textContent = thinkingDepth.value;
    });

    const creativityLevel = this.shadowRoot?.getElementById('creativityLevel') as HTMLInputElement;
    creativityLevel?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('creativityLevelValue');
      if (value) value.textContent = creativityLevel.value;
    });

    const notebookUsage = this.shadowRoot?.getElementById('notebookUsage') as HTMLInputElement;
    notebookUsage?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('notebookUsageValue');
      if (value) value.textContent = `${notebookUsage.value}%`;
    });

    // Collapsible personality section
    const personalityToggle = this.shadowRoot?.getElementById('personality-toggle');
    const personalityContent = this.shadowRoot?.getElementById('personality-content');
    personalityToggle?.addEventListener('click', () => {
      personalityToggle.classList.toggle('expanded');
      personalityContent?.classList.toggle('expanded');
    });

    // Form submission
    this.shadowRoot?.getElementById('agent-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveAgent();
    });
  }

  private updateModelSelect() {
    const modelSelect = this.shadowRoot?.getElementById('model') as HTMLSelectElement;
    if (!modelSelect) return;

    const provider = this.providers.find(p => p.id === this.formData.llmProviderId);
    
    if (provider && provider.models.length > 0) {
      modelSelect.innerHTML = provider.models.map(m => `
        <option value="${m.id}">${m.name}</option>
      `).join('');
      this.formData.modelId = provider.models[0].id;
    } else {
      modelSelect.innerHTML = '<option value="">No models available</option>';
      this.formData.modelId = '';
    }
  }

  private saveAgent() {
    const name = (this.shadowRoot?.getElementById('name') as HTMLInputElement)?.value;
    const role = (this.shadowRoot?.getElementById('role') as HTMLInputElement)?.value;
    const expertise = (this.shadowRoot?.getElementById('expertise') as HTMLInputElement)?.value;
    const providerId = (this.shadowRoot?.getElementById('provider') as HTMLSelectElement)?.value;
    const modelId = (this.shadowRoot?.getElementById('model') as HTMLSelectElement)?.value;
    const thinkingDepth = parseInt((this.shadowRoot?.getElementById('thinkingDepth') as HTMLInputElement)?.value || '3');
    const creativityLevel = parseInt((this.shadowRoot?.getElementById('creativityLevel') as HTMLInputElement)?.value || '3');
    const notebookUsage = parseInt((this.shadowRoot?.getElementById('notebookUsage') as HTMLInputElement)?.value || '50');
    const systemPrompt = (this.shadowRoot?.getElementById('systemPrompt') as HTMLTextAreaElement)?.value;
    const strengths = (this.shadowRoot?.getElementById('strengths') as HTMLInputElement)?.value;
    const thinkingStyle = (this.shadowRoot?.getElementById('thinkingStyle') as HTMLInputElement)?.value;

    if (!name || !role || !expertise || !providerId || !modelId) {
      return;
    }

    const result: AgentEditorResult = {
      name,
      role,
      expertise,
      llmProviderId: providerId,
      modelId,
      thinkingDepth,
      creativityLevel,
      notebookUsage,
      systemPrompt: systemPrompt || '',
      strengths: strengths || '',
      thinkingStyle: thinkingStyle || '',
      presetId: this.selectedPresetId || undefined,
    };

    this.dispatchEvent(new CustomEvent('agent:saved', { 
      detail: { 
        result, 
        mode: this.config.mode,
        agentId: this.config.agent?.id,
        conversationId: this.config.conversationId,
        order: this.config.order,
      } 
    }));
    
    this.close();
  }
}

customElements.define('agent-editor-modal', AgentEditorModal);

