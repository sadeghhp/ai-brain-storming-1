// ============================================
// AI Brainstorm - New Conversation Modal
// Version: 1.0.0
// ============================================

import { ConversationEngine } from '../engine/conversation-engine';
import { presetStorage, providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { AgentPreset, LLMProvider, ConversationMode } from '../types';

export class NewConversationModal extends HTMLElement {
  private presets: AgentPreset[] = [];
  private providers: LLMProvider[] = [];
  private selectedPresets: Set<string> = new Set();

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
    
    // Providers are loaded for display in the form
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
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';

    this.shadowRoot.innerHTML = `
      <style>
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          z-index: var(--z-modal, 400);
          display: ${isOpen ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
        }

        .modal-content {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          width: 100%;
          max-width: 640px;
          max-height: 90vh;
          overflow-y: auto;
          animation: scaleIn 0.2s ease;
        }

        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          border-bottom: 1px solid var(--color-border);
        }

        .modal-header h2 {
          margin: 0;
          font-size: var(--text-xl);
          color: var(--color-text-primary);
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--color-text-tertiary);
          cursor: pointer;
          padding: var(--space-1);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }

        .close-btn:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .modal-body {
          padding: var(--space-6);
        }

        .form-group {
          margin-bottom: var(--space-5);
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
          transition: border-color var(--transition-fast);
        }

        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-dim);
        }

        .form-textarea {
          min-height: 80px;
          resize: vertical;
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
        }

        .mode-option.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .mode-option .mode-icon {
          font-size: var(--text-xl);
          margin-bottom: var(--space-1);
        }

        .mode-option .mode-name {
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
        }

        .preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: var(--space-2);
          max-height: 200px;
          overflow-y: auto;
          padding: var(--space-1);
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
        }

        .preset-chip:hover {
          background: var(--color-surface-hover);
        }

        .preset-chip.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .provider-warning {
          padding: var(--space-3);
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: var(--radius-md);
          color: var(--color-warning);
          font-size: var(--text-sm);
          margin-bottom: var(--space-4);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border);
        }

        .btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .btn-secondary {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-primary);
        }

        .btn-secondary:hover {
          background: var(--color-surface-hover);
        }

        .btn-primary {
          background: var(--color-primary);
          border: 1px solid var(--color-primary);
          color: var(--color-bg-primary);
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .inline-select {
          display: flex;
          gap: var(--space-2);
        }

        .inline-select .form-select {
          flex: 1;
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

          <form id="new-conv-form">
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

              <div class="form-group">
                <label class="form-label">LLM Provider & Model</label>
                <div class="inline-select">
                  <select class="form-select" id="provider">
                    ${this.providers.map(p => `
                      <option value="${p.id}" ${!p.isActive ? 'disabled' : ''}>
                        ${p.name} ${!p.isActive ? '(not configured)' : ''}
                      </option>
                    `).join('')}
                  </select>
                  <select class="form-select" id="model">
                    <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="google/gemini-pro-1.5">Gemini Pro 1.5</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Select Agents (${this.selectedPresets.size} selected)</label>
                <div class="preset-grid">
                  ${this.presets.map(p => `
                    <div class="preset-chip ${this.selectedPresets.has(p.id) ? 'selected' : ''}" data-preset-id="${p.id}">
                      ${p.name}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary" ${this.selectedPresets.size < 2 ? 'disabled' : ''}>
                Create Conversation
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

    // Mode selector
    this.shadowRoot?.querySelectorAll('.mode-option').forEach(option => {
      option.addEventListener('click', () => {
        this.shadowRoot?.querySelectorAll('.mode-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      });
    });

    // Preset selection
    this.shadowRoot?.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const presetId = chip.getAttribute('data-preset-id');
        if (!presetId) return;

        if (this.selectedPresets.has(presetId)) {
          this.selectedPresets.delete(presetId);
          chip.classList.remove('selected');
        } else {
          this.selectedPresets.add(presetId);
          chip.classList.add('selected');
        }

        // Update label and button state
        this.updateSelectionState();
      });
    });

    // Form submission
    this.shadowRoot?.getElementById('new-conv-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createConversation();
    });
  }

  private updateSelectionState() {
    const label = this.shadowRoot?.querySelector('.form-label:last-of-type') as HTMLElement;
    if (label) {
      label.textContent = `Select Agents (${this.selectedPresets.size} selected)`;
    }

    const submitBtn = this.shadowRoot?.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
      submitBtn.disabled = this.selectedPresets.size < 2;
    }
  }

  private async createConversation() {
    const subject = (this.shadowRoot?.getElementById('subject') as HTMLInputElement)?.value;
    const goal = (this.shadowRoot?.getElementById('goal') as HTMLTextAreaElement)?.value;
    const providerId = (this.shadowRoot?.getElementById('provider') as HTMLSelectElement)?.value;
    const modelId = (this.shadowRoot?.getElementById('model') as HTMLSelectElement)?.value;
    const modeElement = this.shadowRoot?.querySelector('.mode-option.selected') as HTMLElement;
    const mode = (modeElement?.getAttribute('data-mode') || 'round-robin') as ConversationMode;

    if (!subject || !goal || !providerId || !modelId || this.selectedPresets.size < 2) {
      return;
    }

    try {
      const agentConfigs = Array.from(this.selectedPresets).map(presetId => ({
        presetId,
        llmProviderId: providerId,
        modelId,
      }));

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

