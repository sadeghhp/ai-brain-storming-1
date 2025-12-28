// ============================================
// AI Brainstorm - Agent Preset Editor Modal
// Version: 1.1.0
// ============================================

import { presetStorage } from '../storage/storage-manager';
import { presetCategories } from '../agents/presets';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { AgentPreset, CreateAgentPreset } from '../types';

export interface PresetEditorConfig {
  mode: 'create' | 'edit' | 'clone';
  preset?: AgentPreset;
}

export interface PresetEditorResult {
  name: string;
  category: string;
  description: string;
  expertise: string;
  systemPrompt: string;
  strengths: string;
  thinkingStyle: string;
  defaultThinkingDepth: number;
  defaultCreativityLevel: number;
}

export class AgentPresetEditorModal extends HTMLElement {
  private readonly uid = `preset-editor-${Math.random().toString(36).slice(2, 10)}`;
  private config: PresetEditorConfig = { mode: 'create' };
  private formData: Partial<PresetEditorResult> = {};

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

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string, _newValue: string) {
    if (name !== 'open') return;
    this.render();
  }

  configure(config: PresetEditorConfig) {
    this.config = config;
    
    // Initialize form data
    if (config.preset) {
      this.formData = {
        name: config.mode === 'clone' ? `${config.preset.name} (Copy)` : config.preset.name,
        category: config.preset.category,
        description: config.preset.description,
        expertise: config.preset.expertise,
        systemPrompt: config.preset.systemPrompt,
        strengths: config.preset.strengths,
        thinkingStyle: config.preset.thinkingStyle,
        defaultThinkingDepth: config.preset.defaultThinkingDepth,
        defaultCreativityLevel: config.preset.defaultCreativityLevel,
      };
    } else {
      this.formData = {
        name: '',
        category: 'custom',
        description: '',
        expertise: '',
        systemPrompt: '',
        strengths: '',
        thinkingStyle: '',
        defaultThinkingDepth: 3,
        defaultCreativityLevel: 3,
      };
    }
  }

  private close() {
    this.setAttribute('open', 'false');
    this.dispatchEvent(new CustomEvent('preset:cancelled'));
  }

  private async handleSave() {
    // Validate required fields
    const name = (this.shadowRoot?.getElementById('preset-name') as HTMLInputElement)?.value.trim();
    const category = (this.shadowRoot?.getElementById('preset-category') as HTMLSelectElement)?.value;
    const description = (this.shadowRoot?.getElementById('preset-description') as HTMLTextAreaElement)?.value.trim();
    const expertise = (this.shadowRoot?.getElementById('preset-expertise') as HTMLTextAreaElement)?.value.trim();
    const systemPrompt = (this.shadowRoot?.getElementById('preset-system-prompt') as HTMLTextAreaElement)?.value.trim();
    const strengths = (this.shadowRoot?.getElementById('preset-strengths') as HTMLInputElement)?.value.trim();
    const thinkingStyle = (this.shadowRoot?.getElementById('preset-thinking-style') as HTMLInputElement)?.value.trim();
    const thinkingDepth = parseInt((this.shadowRoot?.getElementById('thinking-depth') as HTMLInputElement)?.value || '3');
    const creativityLevel = parseInt((this.shadowRoot?.getElementById('creativity-level') as HTMLInputElement)?.value || '3');

    if (!name) {
      alert('Please enter a preset name');
      return;
    }
    if (!description) {
      alert('Please enter a description');
      return;
    }
    if (!expertise) {
      alert('Please enter expertise areas');
      return;
    }
    if (!systemPrompt) {
      alert('Please enter a system prompt');
      return;
    }

    const presetData: CreateAgentPreset = {
      name,
      category,
      description,
      expertise,
      systemPrompt,
      strengths: strengths || `${name} specialist`,
      thinkingStyle: thinkingStyle || 'Analytical',
      defaultThinkingDepth: thinkingDepth,
      defaultCreativityLevel: creativityLevel,
    };

    try {
      let savedPreset: AgentPreset | undefined;
      
      if (this.config.mode === 'edit' && this.config.preset) {
        // Update existing preset
        savedPreset = await presetStorage.update(this.config.preset.id, presetData);
      } else {
        // Create new preset (or clone)
        savedPreset = await presetStorage.create(presetData);
      }

      if (savedPreset) {
        this.dispatchEvent(new CustomEvent('preset:saved', {
          detail: savedPreset,
          bubbles: true,
        }));
        this.close();
      }
    } catch (error) {
      console.error('Failed to save preset:', error);
      alert('Failed to save preset. Please try again.');
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';
    const isEditMode = this.config.mode === 'edit';
    const title = this.config.mode === 'clone' 
      ? 'Clone Preset as Custom' 
      : isEditMode 
        ? 'Edit Custom Preset' 
        : 'Create Custom Preset';

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
          max-height: 90svh;
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
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .modal-header h2 svg {
          color: var(--color-primary);
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
          -webkit-overflow-scrolling: touch;
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

        .required-marker {
          color: var(--color-error);
          margin-left: 2px;
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
        }

        .form-textarea.large {
          min-height: 150px;
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

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          flex-shrink: 0;
          padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
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
        }

        .btn-primary:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="modal-overlay" id="overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2z"/>
                <path d="M12 8v8M8 12h8"/>
              </svg>
              ${title}
            </h2>
            <button class="close-btn" id="close-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- Basic Info -->
            <div class="section">
              <div class="section-title">Basic Information</div>
              
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">
                    Preset Name<span class="required-marker">*</span>
                  </label>
                  <input 
                    type="text" 
                    class="form-input" 
                    id="preset-name"
                    value="${this.escapeHtml(this.formData.name || '')}"
                    placeholder="e.g., Marketing Strategist"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">Category</label>
                  <select class="form-select" id="preset-category">
                    ${presetCategories.map(cat => `
                      <option value="${cat.id}" ${this.formData.category === cat.id ? 'selected' : ''}>
                        ${cat.icon} ${cat.name}
                      </option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">
                  Description<span class="required-marker">*</span>
                </label>
                <textarea 
                  class="form-textarea" 
                  id="preset-description"
                  placeholder="Brief description of this agent's role and purpose..."
                >${this.escapeHtml(this.formData.description || '')}</textarea>
                <div class="form-hint">What does this agent do? This is shown when selecting presets.</div>
              </div>
            </div>

            <!-- Expertise & Capabilities -->
            <div class="section">
              <div class="section-title">Expertise & Capabilities</div>
              
              <div class="form-group">
                <label class="form-label">
                  Areas of Expertise<span class="required-marker">*</span>
                </label>
                <textarea 
                  class="form-textarea" 
                  id="preset-expertise"
                  placeholder="Comma-separated list of expertise areas..."
                >${this.escapeHtml(this.formData.expertise || '')}</textarea>
                <div class="form-hint">e.g., Market analysis, Brand positioning, Consumer behavior, Competitive strategy</div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Key Strengths</label>
                  <input 
                    type="text" 
                    class="form-input" 
                    id="preset-strengths"
                    value="${this.escapeHtml(this.formData.strengths || '')}"
                    placeholder="What is this agent best at?"
                  >
                </div>
                <div class="form-group">
                  <label class="form-label">Thinking Style</label>
                  <input 
                    type="text" 
                    class="form-input" 
                    id="preset-thinking-style"
                    value="${this.escapeHtml(this.formData.thinkingStyle || '')}"
                    placeholder="e.g., Analytical, Creative, Strategic"
                  >
                </div>
              </div>
            </div>

            <!-- System Prompt -->
            <div class="section">
              <div class="section-title">System Prompt</div>
              
              <div class="form-group">
                <label class="form-label">
                  System Prompt<span class="required-marker">*</span>
                </label>
                <textarea 
                  class="form-textarea large" 
                  id="preset-system-prompt"
                  placeholder="Detailed instructions for the AI agent..."
                >${this.escapeHtml(this.formData.systemPrompt || '')}</textarea>
                <div class="form-hint">
                  This defines the agent's personality, approach, and expertise. Be specific about their role, 
                  strengths, and how they should contribute to discussions.
                </div>
              </div>
            </div>

            <!-- Default Parameters -->
            <div class="section">
              <div class="section-title">Default Parameters</div>
              
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Default Thinking Depth</label>
                  <div class="slider-group">
                    <input 
                      type="range" 
                      class="slider-input" 
                      id="thinking-depth"
                      min="1" 
                      max="5" 
                      value="${this.formData.defaultThinkingDepth || 3}"
                    >
                    <span class="slider-value" id="thinking-depth-value">${this.formData.defaultThinkingDepth || 3}</span>
                  </div>
                  <div class="form-hint">1=Quick responses, 5=Deep analysis</div>
                </div>

                <div class="form-group">
                  <label class="form-label">Default Creativity Level</label>
                  <div class="slider-group">
                    <input 
                      type="range" 
                      class="slider-input" 
                      id="creativity-level"
                      min="1" 
                      max="5" 
                      value="${this.formData.defaultCreativityLevel || 3}"
                    >
                    <span class="slider-value" id="creativity-level-value">${this.formData.defaultCreativityLevel || 3}</span>
                  </div>
                  <div class="form-hint">1=Conservative, 5=Highly creative</div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" id="${this.elId('cancel-btn')}">Cancel</button>
            <button class="btn btn-primary" id="save-btn">
              ${this.config.mode === 'edit' ? 'Save Changes' : 'Create Preset'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.setupEventHandlers();
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private setupEventHandlers() {
    // Close button
    this.shadowRoot?.getElementById('close-btn')?.addEventListener('click', () => this.close());
    
    // Cancel button
    this.shadowRoot?.getElementById(this.elId('cancel-btn'))?.addEventListener('click', () => this.close());
    
    // Save button
    this.shadowRoot?.getElementById('save-btn')?.addEventListener('click', () => this.handleSave());
    
    // Overlay click to close
    this.shadowRoot?.getElementById('overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    // Slider value updates
    const thinkingDepthSlider = this.shadowRoot?.getElementById('thinking-depth') as HTMLInputElement;
    const creativitySlider = this.shadowRoot?.getElementById('creativity-level') as HTMLInputElement;
    const thinkingDepthValue = this.shadowRoot?.getElementById('thinking-depth-value');
    const creativityValue = this.shadowRoot?.getElementById('creativity-level-value');

    thinkingDepthSlider?.addEventListener('input', () => {
      if (thinkingDepthValue) thinkingDepthValue.textContent = thinkingDepthSlider.value;
    });

    creativitySlider?.addEventListener('input', () => {
      if (creativityValue) creativityValue.textContent = creativitySlider.value;
    });

    // Keyboard shortcuts
    this.shadowRoot?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.close();
      }
    });
  }
}

customElements.define('agent-preset-editor-modal', AgentPresetEditorModal);

