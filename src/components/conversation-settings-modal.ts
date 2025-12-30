// ============================================
// AI Brainstorm - Conversation Settings Modal
// ============================================

import { conversationStorage, agentStorage, providerStorage, settingsStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { ALL_LANGUAGES, getEnabledLanguages, type Language } from '../utils/languages';
import type { Conversation, Agent, LLMProvider, ConversationMode, ExtendedMultiplier, ConversationDepth, AppSettings } from '../types';
import './agent-editor-modal';
import type { AgentEditorModal, AgentEditorResult } from './agent-editor-modal';
import { generateAgentColor } from '../utils/helpers';

// Depth level configuration for UI display
const DEPTH_LEVELS: Array<{ id: ConversationDepth; name: string; icon: string; description: string }> = [
  { id: 'brief', name: 'Brief', icon: '⚡', description: '1-2 sentences' },
  { id: 'concise', name: 'Concise', icon: '📝', description: 'Short paragraphs' },
  { id: 'standard', name: 'Standard', icon: '💬', description: 'Balanced (~150 words)' },
  { id: 'detailed', name: 'Detailed', icon: '📖', description: 'In-depth analysis' },
  { id: 'deep', name: 'Deep', icon: '🔬', description: 'Comprehensive' },
];


export class ConversationSettingsModal extends HTMLElement {
  private readonly uid = `conversation-settings-${Math.random().toString(36).slice(2, 10)}`;
  private conversation: Conversation | null = null;
  private agents: Agent[] = [];
  private providers: LLMProvider[] = [];
  private activeTab: 'general' | 'agents' = 'general';
  // Enabled languages from settings
  private enabledLanguages: Language[] = getEnabledLanguages(['']);
  private settingsUnsubscribe: (() => void) | null = null;

  private elId(suffix: string): string {
    return `${this.uid}-${suffix}`;
  }

  static get observedAttributes() {
    return ['open', 'conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    
    // Listen for settings updates to refresh enabled languages
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }

    this.settingsUnsubscribe = eventBus.on('settings:updated', (settings: AppSettings) => {
      this.enabledLanguages = getEnabledLanguages(settings.enabledLanguages);
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
      // Always re-render on open state changes so the overlay display updates immediately.
      if (newValue === 'true') {
        this.loadData().then(() => this.render());
      } else {
        this.render();
      }
      return;
    }

    if (name === 'conversation-id' && newValue) {
      this.loadData().then(() => this.render());
    }
  }

  private async loadData() {
    const conversationId = this.getAttribute('conversation-id');
    if (!conversationId) return;

    this.conversation = await conversationStorage.getById(conversationId) || null;
    this.agents = await agentStorage.getByConversation(conversationId);
    this.providers = await providerStorage.getAll();
    
    // Load enabled languages from settings
    const settings = await settingsStorage.get();
    this.enabledLanguages = getEnabledLanguages(settings.enabledLanguages);
  }

  private close() {
    this.setAttribute('open', 'false');
  }

  private isEditable(): boolean {
    return this.conversation?.status !== 'running';
  }
  
  /**
   * Get languages available for this conversation.
   * Includes enabled languages plus the conversation's current language (if not in enabled list).
   */
  private getAvailableLanguagesForConversation(conv: Conversation): Language[] {
    const currentLangCode = conv.targetLanguage || '';
    
    // Check if current language is in the enabled list
    const currentInEnabled = this.enabledLanguages.some(l => l.code === currentLangCode);
    
    if (currentInEnabled) {
      return this.enabledLanguages;
    }
    
    // Add the current language to the list so it remains selectable
    const currentLang = ALL_LANGUAGES.find(l => l.code === currentLangCode);
    if (currentLang) {
      return [...this.enabledLanguages, currentLang];
    }
    
    return this.enabledLanguages;
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';
    const editable = this.isEditable();

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
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

        .tab-bar {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          padding: 0 var(--space-6);
        }

        .tab {
          padding: var(--space-3) var(--space-4);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-bottom: -1px;
        }

        .tab:hover {
          color: var(--color-text-primary);
        }

        .tab.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
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

        .form-input:hover:not(:disabled), .form-select:hover:not(:disabled), .form-textarea:hover:not(:disabled) {
          border-color: var(--color-border-strong);
        }

        .form-input:focus, .form-select:focus, .form-textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-dim);
        }

        .form-input:disabled, .form-select:disabled, .form-textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-textarea {
          min-height: 80px;
          resize: vertical;
          line-height: 1.5;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }

        .form-hint {
          margin-top: var(--space-1);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .form-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23606070' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
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

        .mode-option:hover:not(.disabled) {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
        }

        .mode-option.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .mode-option.disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
        }

        .slider-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .slider-value {
          min-width: 60px;
          text-align: center;
          font-weight: var(--font-semibold);
          color: var(--color-primary);
          background: var(--color-primary-dim);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
        }

        /* Agent List */
        .agent-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
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

        .agent-card.secretary {
          border-color: var(--color-secondary);
          background: rgba(168, 85, 247, 0.05);
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
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .secretary-badge {
          font-size: var(--text-xs);
          padding: 1px 6px;
          background: rgba(168, 85, 247, 0.2);
          color: var(--color-secondary);
          border-radius: var(--radius-sm);
          font-weight: var(--font-medium);
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

        .agent-action-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* Drag and Drop for Agent Cards */
        .agent-card.draggable {
          cursor: grab;
          position: relative;
        }

        .agent-card.draggable:active {
          cursor: grabbing;
        }

        .agent-card.dragging {
          opacity: 0.5;
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .agent-card.drag-over {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px var(--color-primary-dim);
        }

        .agent-card.drag-over-top::before {
          content: '';
          position: absolute;
          top: -4px;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--color-primary);
          border-radius: var(--radius-full);
        }

        .agent-card.drag-over-bottom::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 0;
          right: 0;
          height: 3px;
          background: var(--color-primary);
          border-radius: var(--radius-full);
        }

        .drag-handle {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-1);
          color: var(--color-text-tertiary);
          cursor: grab;
          transition: color var(--transition-fast);
          flex-shrink: 0;
        }

        .drag-handle:hover {
          color: var(--color-text-primary);
        }

        .drag-handle:active {
          cursor: grabbing;
        }

        .agent-order-badge {
          position: absolute;
          left: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: var(--font-bold);
          color: var(--color-text-tertiary);
        }

        .add-agent-btn {
          width: 100%;
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

        .add-agent-btn:hover:not(:disabled) {
          border-color: var(--color-primary);
          color: var(--color-primary);
          background: var(--color-primary-dim);
        }

        .add-agent-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .running-warning {
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

        .empty-state {
          text-align: center;
          padding: var(--space-8);
          color: var(--color-text-tertiary);
        }

        /* Danger Zone */
        .danger-zone {
          margin-top: var(--space-8);
          padding: var(--space-4);
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: var(--radius-md);
        }

        .danger-zone-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
          color: var(--color-error);
          font-weight: var(--font-semibold);
          font-size: var(--text-sm);
        }

        .danger-zone-description {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-4);
        }

        .btn-danger {
          background: transparent;
          border: 1px solid var(--color-error);
          color: var(--color-error);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .btn-danger:hover:not(:disabled) {
          background: var(--color-error);
          color: white;
        }

        .btn-danger:disabled {
          opacity: 0.4;
          cursor: not-allowed;
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

        .depth-live-note {
          font-size: var(--text-xs);
          color: var(--color-success);
          margin-top: var(--space-1);
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }
      </style>

      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Conversation Settings</h2>
            <button class="close-btn" id="close-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="tab-bar">
            <button class="tab ${this.activeTab === 'general' ? 'active' : ''}" data-tab="general">
              General
            </button>
            <button class="tab ${this.activeTab === 'agents' ? 'active' : ''}" data-tab="agents">
              Agents (${this.agents.length})
            </button>
          </div>

          <div class="modal-body">
            ${!editable ? `
              <div class="running-warning">
                ⚠️ Settings cannot be changed while the conversation is running. Pause or stop the conversation first.
              </div>
            ` : ''}

            ${this.conversation ? this.renderTabContent() : `
              <div class="empty-state">No conversation selected</div>
            `}
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="${this.elId('cancel-btn')}">Close</button>
            <button type="button" class="btn btn-primary" id="save-btn" ${!editable ? 'disabled' : ''}>
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <agent-editor-modal id="agent-editor"></agent-editor-modal>
    `;

    this.setupEventHandlers();
  }

  private renderTabContent(): string {
    if (this.activeTab === 'general') {
      return this.renderGeneralTab();
    } else {
      return this.renderAgentsTab();
    }
  }

  private renderGeneralTab(): string {
    const conv = this.conversation!;
    const editable = this.isEditable();

    return `
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input type="text" class="form-input" id="subject" value="${conv.subject}" ${!editable ? 'disabled' : ''}>
      </div>

      <div class="form-group">
        <label class="form-label">Goal</label>
        <textarea class="form-textarea" id="goal" ${!editable ? 'disabled' : ''}>${conv.goal}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Conversation Mode</label>
        <div class="mode-selector">
          <div class="mode-option ${conv.mode === 'round-robin' ? 'selected' : ''} ${!editable ? 'disabled' : ''}" data-mode="round-robin">
            <div class="mode-icon">🔄</div>
            <div class="mode-name">Round Robin</div>
          </div>
          <div class="mode-option ${conv.mode === 'moderator' ? 'selected' : ''} ${!editable ? 'disabled' : ''}" data-mode="moderator">
            <div class="mode-icon">👨‍⚖️</div>
            <div class="mode-name">Moderated</div>
          </div>
          <div class="mode-option ${conv.mode === 'dynamic' ? 'selected' : ''} ${!editable ? 'disabled' : ''}" data-mode="dynamic">
            <div class="mode-icon">💬</div>
            <div class="mode-name">Dynamic</div>
          </div>
        </div>
      </div>

      <!-- Response Depth - Can be changed while running -->
      <div class="form-group">
        <label class="form-label">Response Depth</label>
        <div class="depth-selector">
          ${DEPTH_LEVELS.map(level => `
            <div class="depth-option ${(conv.conversationDepth ?? 'standard') === level.id ? 'selected' : ''}" 
                 data-depth="${level.id}" 
                 title="${level.description}">
              <span class="depth-icon">${level.icon}</span>
              <div class="depth-name">${level.name}</div>
              <div class="depth-desc">${level.description}</div>
            </div>
          `).join('')}
        </div>
        <div class="depth-live-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Can be changed while conversation is running
        </div>
      </div>

      <!-- Target Language -->
      <div class="form-group">
        <label class="form-label">Target Language</label>
        <select class="form-select" id="target-language" ${!editable ? 'disabled' : ''}>
          ${this.getAvailableLanguagesForConversation(conv).map(lang => `
            <option value="${lang.code}" ${(conv.targetLanguage || '') === lang.code ? 'selected' : ''}>
              ${lang.name}${lang.code ? ` (${lang.nativeName})` : ''}
            </option>
          `).join('')}
        </select>
        <div class="form-hint">All agents will respond in the selected language</div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Speed: <span id="speedValue">${conv.speedMs}ms</span></label>
          <div class="slider-group">
            <input type="range" class="slider-input" id="speed" 
                   min="500" max="10000" step="500" value="${conv.speedMs}"
                   ${!editable ? 'disabled' : ''}>
          </div>
          <div class="form-hint">Delay between agent turns</div>
        </div>

        <div class="form-group">
          <label class="form-label">Max Rounds: <span id="maxRoundsValue">${conv.maxRounds || 'Unlimited'}</span></label>
          <div class="slider-group">
            <input type="range" class="slider-input" id="maxRounds" 
                   min="0" max="50" value="${conv.maxRounds || 0}"
                   ${!editable ? 'disabled' : ''}>
          </div>
          <div class="form-hint">0 = unlimited rounds</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Context Tokens: <span id="contextValue">${conv.maxContextTokens}</span></label>
        <div class="slider-group">
          <input type="range" class="slider-input" id="maxContext" 
                 min="2000" max="32000" step="1000" value="${conv.maxContextTokens}"
                 ${!editable ? 'disabled' : ''}>
        </div>
        <div class="form-hint">Maximum context window for each agent</div>
      </div>

      <!-- Word Limit Settings -->
      <div class="form-group">
        <label class="form-label">Word Limit: <span id="wordLimitValue">${conv.defaultWordLimit ?? 150} words</span></label>
        <div class="slider-group">
          <input type="range" class="slider-input" id="wordLimit" 
                 min="50" max="500" step="10" value="${conv.defaultWordLimit ?? 150}"
                 ${!editable ? 'disabled' : ''}>
        </div>
        <div class="form-hint">Default word limit for agent responses</div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Extended Speaking Chance: <span id="extendedChanceValue">${conv.extendedSpeakingChance ?? 20}%</span></label>
          <div class="slider-group">
            <input type="range" class="slider-input" id="extendedChance" 
                   min="0" max="50" step="5" value="${conv.extendedSpeakingChance ?? 20}"
                   ${!editable ? 'disabled' : ''}>
          </div>
          <div class="form-hint">Chance per turn for extended response</div>
        </div>

        <div class="form-group">
          <label class="form-label">Extended Multiplier</label>
          <div class="mode-selector multiplier-selector">
            <div class="mode-option ${(conv.extendedMultiplier ?? 3) === 3 ? 'selected' : ''} ${!editable ? 'disabled' : ''}" data-multiplier="3">
              <div class="mode-name">3x</div>
            </div>
            <div class="mode-option ${conv.extendedMultiplier === 5 ? 'selected' : ''} ${!editable ? 'disabled' : ''}" data-multiplier="5">
              <div class="mode-name">5x</div>
            </div>
          </div>
          <div class="form-hint">Multiplier when extended speaking</div>
        </div>
      </div>

      <div class="danger-zone">
        <div class="danger-zone-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Danger Zone
        </div>
        <p class="danger-zone-description">
          Permanently delete this conversation and all its data including messages, agents, and drafts. This action cannot be undone.
        </p>
        <button type="button" class="btn-danger" id="delete-conv-btn" ${!editable ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete Conversation
        </button>
      </div>
    `;
  }

  private renderAgentsTab(): string {
    const editable = this.isEditable();
    const regularAgents = this.agents.filter(a => !a.isSecretary);
    const secretary = this.agents.find(a => a.isSecretary);

    return `
      <div class="agent-list" id="sortable-agent-list">
        ${regularAgents.map((agent, index) => this.renderAgentCard(agent, index)).join('')}
        ${secretary ? this.renderAgentCard(secretary, regularAgents.length) : ''}
      </div>

      <button type="button" class="add-agent-btn" id="add-agent-btn" ${!editable ? 'disabled' : ''}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add Agent
      </button>
    `;
  }

  private renderAgentCard(agent: Agent, index: number): string {
    const provider = this.providers.find(p => p.id === agent.llmProviderId);
    const model = provider?.models.find(m => m.id === agent.modelId);
    const initials = agent.name.slice(0, 2).toUpperCase();
    const editable = this.isEditable();
    const canDrag = editable && !agent.isSecretary;

    return `
      <div class="agent-card ${agent.isSecretary ? 'secretary' : ''} ${canDrag ? 'draggable' : ''}" 
           data-agent-id="${agent.id}" 
           data-index="${index}"
           ${canDrag ? 'draggable="true"' : ''}>
        ${canDrag ? `<div class="agent-order-badge">${index + 1}</div>` : ''}
        ${canDrag ? `
          <div class="drag-handle" title="Drag to reorder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="8" y1="6" x2="16" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="8" y1="18" x2="16" y2="18"/>
            </svg>
          </div>
        ` : ''}
        <div class="agent-avatar" style="background: ${agent.color}20; color: ${agent.color};">
          ${initials}
        </div>
        <div class="agent-info">
          <div class="agent-name">
            ${agent.name}
            ${agent.isSecretary ? '<span class="secretary-badge">Secretary</span>' : ''}
          </div>
          <div class="agent-meta">
            <span>${agent.role}</span>
            <span class="agent-model-badge">${model?.name || agent.modelId}</span>
          </div>
        </div>
        <div class="agent-actions">
          <button type="button" class="agent-action-btn edit" data-agent-id="${agent.id}" 
                  title="Edit" ${!editable ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          ${!agent.isSecretary ? `
            <button type="button" class="agent-action-btn delete" data-agent-id="${agent.id}" 
                    title="Remove" ${!editable ? 'disabled' : ''}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
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

    // Tab switching
    this.shadowRoot?.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.getAttribute('data-tab') as 'general' | 'agents';
        this.render();
      });
    });

    // Mode selector
    if (this.isEditable()) {
      this.shadowRoot?.querySelectorAll('.mode-option:not(.disabled)').forEach(option => {
        option.addEventListener('click', () => {
          this.shadowRoot?.querySelectorAll('.mode-option').forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
        });
      });
    }

    // Depth selector - ALWAYS interactive (can be changed while running)
    this.shadowRoot?.querySelectorAll('.depth-option').forEach(option => {
      option.addEventListener('click', async () => {
        const depth = option.getAttribute('data-depth') as ConversationDepth;
        if (depth && this.conversation) {
          // Update UI immediately
          this.shadowRoot?.querySelectorAll('.depth-option').forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
          
          // Save to storage immediately for real-time effect
          await conversationStorage.update(this.conversation.id, { conversationDepth: depth });
          
          // Reload conversation data and emit update event
          this.conversation = await conversationStorage.getById(this.conversation.id) || null;
          if (this.conversation) {
            eventBus.emit('conversation:updated', this.conversation);
          }
        }
      });
    });

    // Slider value displays
    const speedSlider = this.shadowRoot?.getElementById('speed') as HTMLInputElement;
    speedSlider?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('speedValue');
      if (value) value.textContent = `${speedSlider.value}ms`;
    });

    const maxRoundsSlider = this.shadowRoot?.getElementById('maxRounds') as HTMLInputElement;
    maxRoundsSlider?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('maxRoundsValue');
      if (value) value.textContent = maxRoundsSlider.value === '0' ? 'Unlimited' : maxRoundsSlider.value;
    });

    const contextSlider = this.shadowRoot?.getElementById('maxContext') as HTMLInputElement;
    contextSlider?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('contextValue');
      if (value) value.textContent = contextSlider.value;
    });

    // Word limit sliders
    const wordLimitSlider = this.shadowRoot?.getElementById('wordLimit') as HTMLInputElement;
    wordLimitSlider?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('wordLimitValue');
      if (value) value.textContent = `${wordLimitSlider.value} words`;
    });

    const extendedChanceSlider = this.shadowRoot?.getElementById('extendedChance') as HTMLInputElement;
    extendedChanceSlider?.addEventListener('input', () => {
      const value = this.shadowRoot?.getElementById('extendedChanceValue');
      if (value) value.textContent = `${extendedChanceSlider.value}%`;
    });

    // Extended multiplier selector
    if (this.isEditable()) {
      this.shadowRoot?.querySelectorAll('.multiplier-selector .mode-option:not(.disabled)').forEach(option => {
        option.addEventListener('click', () => {
          this.shadowRoot?.querySelectorAll('.multiplier-selector .mode-option').forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
        });
      });
    }

    // Agent actions
    this.shadowRoot?.querySelectorAll('.agent-action-btn.edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const agentId = btn.getAttribute('data-agent-id');
        if (agentId) {
          this.openAgentEditor(agentId);
        }
      });
    });

    this.shadowRoot?.querySelectorAll('.agent-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const agentId = btn.getAttribute('data-agent-id');
        if (agentId && confirm('Are you sure you want to remove this agent?')) {
          await agentStorage.delete(agentId);
          await this.loadData();
          this.render();
        }
      });
    });

    // Add agent
    this.shadowRoot?.getElementById('add-agent-btn')?.addEventListener('click', () => {
      this.openAgentEditor(null);
    });

    // Agent editor events
    const agentEditor = this.shadowRoot?.getElementById('agent-editor') as AgentEditorModal;
    agentEditor?.addEventListener('agent:saved', async (e: Event) => {
      const { result, mode, agentId } = (e as CustomEvent).detail as {
        result: AgentEditorResult;
        mode: string;
        agentId?: string;
      };

      if (mode === 'edit' && agentId) {
        // Update existing agent
        await agentStorage.update(agentId, {
          name: result.name,
          role: result.role,
          expertise: result.expertise,
          llmProviderId: result.llmProviderId,
          modelId: result.modelId,
          thinkingDepth: result.thinkingDepth,
          creativityLevel: result.creativityLevel,
          notebookUsage: result.notebookUsage,
          wordLimit: result.wordLimit,
        });
      } else if (this.conversation) {
        // Create new agent
        await agentStorage.create({
          conversationId: this.conversation.id,
          name: result.name,
          role: result.role,
          expertise: result.expertise,
          presetId: result.presetId,
          llmProviderId: result.llmProviderId,
          modelId: result.modelId,
          thinkingDepth: result.thinkingDepth,
          creativityLevel: result.creativityLevel,
          notebookUsage: result.notebookUsage,
          isSecretary: false,
          color: generateAgentColor(this.agents.length),
          order: this.agents.filter(a => !a.isSecretary).length,
        });
      }

      await this.loadData();
      this.render();
    });

    // Save button
    this.shadowRoot?.getElementById('save-btn')?.addEventListener('click', async () => {
      await this.saveSettings();
    });

    // Delete conversation button
    this.shadowRoot?.getElementById('delete-conv-btn')?.addEventListener('click', async () => {
      await this.deleteConversation();
    });

    // Drag and drop for agent reordering
    this.setupDragAndDrop();
  }

  /**
   * Set up drag and drop for agent reordering in the Agents tab
   */
  private setupDragAndDrop() {
    const agentList = this.shadowRoot?.getElementById('sortable-agent-list');
    if (!agentList) return;

    let draggedElement: HTMLElement | null = null;
    let draggedIndex: number = -1;

    const cards = agentList.querySelectorAll('.agent-card.draggable');
    
    cards.forEach((card) => {
      const cardEl = card as HTMLElement;

      // Drag start
      cardEl.addEventListener('dragstart', (e) => {
        draggedElement = cardEl;
        draggedIndex = parseInt(cardEl.getAttribute('data-index') || '-1');
        cardEl.classList.add('dragging');
        
        // Set drag data
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', draggedIndex.toString());
        }
      });

      // Drag end
      cardEl.addEventListener('dragend', () => {
        cardEl.classList.remove('dragging');
        draggedElement = null;
        draggedIndex = -1;
        
        // Remove all drag-over classes
        cards.forEach(c => {
          c.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
      });

      // Drag over
      cardEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedElement || draggedElement === cardEl) return;
        
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }

        // Determine if we're in the top or bottom half
        const rect = cardEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isTopHalf = (e as DragEvent).clientY < midY;

        cardEl.classList.add('drag-over');
        cardEl.classList.toggle('drag-over-top', isTopHalf);
        cardEl.classList.toggle('drag-over-bottom', !isTopHalf);
      });

      // Drag leave
      cardEl.addEventListener('dragleave', () => {
        cardEl.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
      });

      // Drop
      cardEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!draggedElement || draggedElement === cardEl) return;

        const targetIndex = parseInt(cardEl.getAttribute('data-index') || '-1');
        if (draggedIndex < 0 || targetIndex < 0) return;

        // Determine insert position based on drop location
        const rect = cardEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isTopHalf = (e as DragEvent).clientY < midY;
        
        // Get non-secretary agents for reordering
        const regularAgents = this.agents.filter(a => !a.isSecretary);
        
        // Reorder the agents array
        const [movedAgent] = regularAgents.splice(draggedIndex, 1);
        
        // After removal, adjust targetIndex if dragged was before target
        const adjustedTarget = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
        // Insert before (top half) or after (bottom half) the adjusted target
        const newIndex = isTopHalf ? adjustedTarget : adjustedTarget + 1;
        
        regularAgents.splice(newIndex, 0, movedAgent);
        
        // Persist the new order to storage
        await Promise.all(
          regularAgents.map((agent, idx) => 
            agentStorage.update(agent.id, { order: idx })
          )
        );
        
        // Reload data and re-render
        await this.loadData();
        this.render();
        
        // Emit update event
        if (this.conversation) {
          eventBus.emit('conversation:updated', this.conversation);
        }
      });
    });
  }

  private async deleteConversation() {
    if (!this.conversation) return;

    const confirmed = confirm(
      `Are you sure you want to permanently delete "${this.conversation.subject}"?\n\nThis will delete all messages, agents, and drafts. This action cannot be undone.`
    );

    if (!confirmed) return;

    const conversationId = this.conversation.id;
    await conversationStorage.delete(conversationId);
    eventBus.emit('conversation:deleted', conversationId);
    this.close();
  }

  private openAgentEditor(agentId: string | null) {
    const agentEditor = this.shadowRoot?.getElementById('agent-editor') as AgentEditorModal;
    if (!agentEditor) return;

    const defaultProvider = this.providers.find(p => p.isActive);

    if (agentId) {
      const agent = this.agents.find(a => a.id === agentId);
      if (agent) {
        agentEditor.configure({
          mode: 'edit',
          agent: agent,
          conversationId: this.conversation?.id,
        });
      }
    } else {
      agentEditor.configure({
        mode: 'create',
        agent: {
          llmProviderId: defaultProvider?.id || '',
          modelId: defaultProvider?.models[0]?.id || '',
        },
        conversationId: this.conversation?.id,
        order: this.agents.filter(a => !a.isSecretary).length,
      });
    }

    agentEditor.setAttribute('open', 'true');
  }

  private async saveSettings() {
    if (!this.conversation || !this.isEditable()) return;

    const subject = (this.shadowRoot?.getElementById('subject') as HTMLInputElement)?.value;
    const goal = (this.shadowRoot?.getElementById('goal') as HTMLTextAreaElement)?.value;
    const modeElement = this.shadowRoot?.querySelector('.mode-option.selected:not(.multiplier-selector .mode-option)') as HTMLElement;
    const mode = modeElement?.getAttribute('data-mode') as ConversationMode;
    const speedMs = parseInt((this.shadowRoot?.getElementById('speed') as HTMLInputElement)?.value || '2000');
    const maxRounds = parseInt((this.shadowRoot?.getElementById('maxRounds') as HTMLInputElement)?.value || '0');
    const maxContextTokens = parseInt((this.shadowRoot?.getElementById('maxContext') as HTMLInputElement)?.value || '8000');
    
    // Word limit settings
    const defaultWordLimit = parseInt((this.shadowRoot?.getElementById('wordLimit') as HTMLInputElement)?.value || '150');
    const extendedSpeakingChance = parseInt((this.shadowRoot?.getElementById('extendedChance') as HTMLInputElement)?.value || '20');
    const multiplierElement = this.shadowRoot?.querySelector('.multiplier-selector .mode-option.selected') as HTMLElement;
    const extendedMultiplier = parseInt(multiplierElement?.getAttribute('data-multiplier') || '3') as ExtendedMultiplier;
    
    // Get selected depth (may have been updated in real-time already, but include for completeness)
    const depthElement = this.shadowRoot?.querySelector('.depth-option.selected') as HTMLElement;
    const conversationDepth = (depthElement?.getAttribute('data-depth') || 'standard') as ConversationDepth;
    
    // Get target language (empty string means English/default, which should clear any previous setting)
    const targetLanguageSelect = this.shadowRoot?.getElementById('target-language') as HTMLSelectElement | null;
    // Empty string = English (default), non-empty = specific language
    // We pass the value directly - empty string will be stored and handled by language service
    const targetLanguage = targetLanguageSelect?.value || undefined;

    await conversationStorage.update(this.conversation.id, {
      subject,
      goal,
      mode,
      speedMs,
      maxRounds: maxRounds > 0 ? maxRounds : undefined,
      maxContextTokens,
      defaultWordLimit,
      extendedSpeakingChance,
      extendedMultiplier,
      conversationDepth,
      targetLanguage,
    });

    eventBus.emit('conversation:updated', await conversationStorage.getById(this.conversation.id) as Conversation);
    this.close();
  }
}

customElements.define('conversation-settings-modal', ConversationSettingsModal);

