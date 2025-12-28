// ============================================
// AI Brainstorm - Conversation Settings Modal
// Version: 1.1.0
// ============================================

import { conversationStorage, agentStorage, providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { Conversation, Agent, LLMProvider, ConversationMode } from '../types';
import './agent-editor-modal';
import type { AgentEditorModal, AgentEditorResult } from './agent-editor-modal';
import { generateAgentColor } from '../utils/helpers';

export class ConversationSettingsModal extends HTMLElement {
  private conversation: Conversation | null = null;
  private agents: Agent[] = [];
  private providers: LLMProvider[] = [];
  private activeTab: 'general' | 'agents' = 'general';

  static get observedAttributes() {
    return ['open', 'conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
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
  }

  private close() {
    this.setAttribute('open', 'false');
  }

  private isEditable(): boolean {
    return this.conversation?.status !== 'running';
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
            <button type="button" class="btn btn-secondary" id="cancel-btn">Close</button>
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
      <div class="agent-list">
        ${regularAgents.map((agent) => this.renderAgentCard(agent)).join('')}
        ${secretary ? this.renderAgentCard(secretary) : ''}
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

  private renderAgentCard(agent: Agent): string {
    const provider = this.providers.find(p => p.id === agent.llmProviderId);
    const model = provider?.models.find(m => m.id === agent.modelId);
    const initials = agent.name.slice(0, 2).toUpperCase();
    const editable = this.isEditable();

    return `
      <div class="agent-card ${agent.isSecretary ? 'secretary' : ''}" data-agent-id="${agent.id}">
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
    this.shadowRoot?.getElementById('cancel-btn')?.addEventListener('click', () => this.close());

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
    const modeElement = this.shadowRoot?.querySelector('.mode-option.selected') as HTMLElement;
    const mode = modeElement?.getAttribute('data-mode') as ConversationMode;
    const speedMs = parseInt((this.shadowRoot?.getElementById('speed') as HTMLInputElement)?.value || '2000');
    const maxRounds = parseInt((this.shadowRoot?.getElementById('maxRounds') as HTMLInputElement)?.value || '0');
    const maxContextTokens = parseInt((this.shadowRoot?.getElementById('maxContext') as HTMLInputElement)?.value || '8000');

    await conversationStorage.update(this.conversation.id, {
      subject,
      goal,
      mode,
      speedMs,
      maxRounds: maxRounds > 0 ? maxRounds : undefined,
      maxContextTokens,
    });

    eventBus.emit('conversation:updated', await conversationStorage.getById(this.conversation.id) as Conversation);
    this.close();
  }
}

customElements.define('conversation-settings-modal', ConversationSettingsModal);

