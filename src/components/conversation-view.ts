// ============================================
// AI Brainstorm - Conversation View Component
// Version: 2.0.0
// ============================================

import { ConversationEngine } from '../engine/conversation-engine';
import { eventBus } from '../utils/event-bus';
import './message-stream';
import './agent-roster';
import './control-bar';
import './result-draft';
import './secretary-panel';
import './user-input';
import './conversation-settings-modal';

export class ConversationView extends HTMLElement {
  private engine: ConversationEngine | null = null;
  private conversationId: string | null = null;

  static get observedAttributes() {
    return ['conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    await this.loadConversation();
    this.setupEventListeners();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'conversation-id' && oldValue !== newValue) {
      this.conversationId = newValue;
      this.loadConversation();
    }
  }

  disconnectedCallback() {
    // Cleanup
  }

  private async loadConversation() {
    this.conversationId = this.getAttribute('conversation-id');
    if (!this.conversationId) {
      this.renderEmpty();
      return;
    }

    this.engine = await ConversationEngine.load(this.conversationId);
    if (!this.engine) {
      this.renderError('Conversation not found');
      return;
    }

    this.renderConversation();
  }

  private setupEventListeners() {
    // Handle control bar actions
    eventBus.on('conversation:started', (id) => {
      if (id === this.conversationId) {
        this.updateControlBar();
      }
    });

    eventBus.on('conversation:paused', (id) => {
      if (id === this.conversationId) {
        this.updateControlBar();
      }
    });

    eventBus.on('conversation:stopped', (id) => {
      if (id === this.conversationId) {
        this.updateControlBar();
      }
    });

    eventBus.on('conversation:updated', (conv) => {
      if (conv.id === this.conversationId) {
        this.loadConversation();
      }
    });
  }

  private updateControlBar() {
    const controlBar = this.shadowRoot?.querySelector('control-bar') as HTMLElement;
    if (controlBar && this.engine) {
      controlBar.setAttribute('status', this.engine.getStatus());
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--color-bg-primary);
        }

        .conversation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .conv-info {
          flex: 1;
          min-width: 0;
        }

        .conv-subject {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          margin-bottom: var(--space-1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-goal {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-meta {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
        }

        .main-content {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .message-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .result-panel {
          width: var(--result-panel-width, 360px);
          border-left: 1px solid var(--color-border);
          flex-shrink: 0;
        }

        .control-area {
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .empty-state, .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: var(--space-8);
          text-align: center;
        }

        .empty-icon, .error-icon {
          width: 64px;
          height: 64px;
          margin-bottom: var(--space-4);
          opacity: 0.5;
        }

        .error-icon {
          color: var(--color-error);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: var(--space-1) var(--space-3);
          background: var(--color-surface);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          text-transform: uppercase;
        }

        .status-idle { color: var(--color-text-tertiary); }
        .status-running { 
          background: rgba(34, 197, 94, 0.15); 
          color: var(--color-success); 
        }
        .status-paused { 
          background: rgba(245, 158, 11, 0.15); 
          color: var(--color-warning); 
        }
        .status-completed { 
          background: var(--color-primary-dim); 
          color: var(--color-primary); 
        }
      </style>

      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p style="color: var(--color-text-tertiary);">Loading conversation...</p>
      </div>
    `;
  }

  private renderConversation() {
    if (!this.shadowRoot || !this.engine) return;

    const conversation = this.engine.getConversation();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--color-bg-primary);
        }

        .conversation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .conv-info {
          flex: 1;
          min-width: 0;
        }

        .conv-subject {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          margin-bottom: var(--space-1);
        }

        .conv-goal {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }

        .conv-meta {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          padding: var(--space-1) var(--space-3);
          background: var(--color-surface);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          text-transform: uppercase;
        }

        .status-idle { color: var(--color-text-tertiary); }
        .status-running { 
          background: rgba(34, 197, 94, 0.15); 
          color: var(--color-success); 
        }
        .status-paused { 
          background: rgba(245, 158, 11, 0.15); 
          color: var(--color-warning); 
        }
        .status-completed { 
          background: var(--color-primary-dim); 
          color: var(--color-primary); 
        }

        .main-content {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .message-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .result-panel {
          width: var(--result-panel-width, 400px);
          border-left: 1px solid var(--color-border);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
        }

        .panel-tabs {
          display: flex;
          background: var(--color-bg-tertiary);
          border-bottom: 1px solid var(--color-border);
        }

        .panel-tab {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
        }

        .panel-tab:hover {
          color: var(--color-text-primary);
          background: var(--color-surface);
        }

        .panel-tab.active {
          color: var(--color-secondary);
          border-bottom-color: var(--color-secondary);
        }

        .panel-tab svg {
          width: 14px;
          height: 14px;
        }

        .panel-container {
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .panel-content {
          display: none;
          height: 100%;
        }

        .panel-content.active {
          display: block;
        }

        .control-area {
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .round-indicator {
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
        }

        .settings-btn {
          padding: var(--space-2);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .settings-btn:hover {
          background: var(--color-surface);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
        }

        .settings-btn svg {
          width: 18px;
          height: 18px;
        }
      </style>

      <header class="conversation-header">
        <div class="conv-info">
          <div class="conv-subject">${conversation.subject}</div>
          <div class="conv-goal">${conversation.goal}</div>
        </div>
        <div class="conv-meta">
          <span class="round-indicator">Round ${conversation.currentRound}</span>
          <span class="status-badge status-${conversation.status}">${conversation.status}</span>
          <button class="settings-btn" id="settings-btn" title="Conversation Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <conversation-settings-modal id="conv-settings-modal" conversation-id="${conversation.id}"></conversation-settings-modal>

      <agent-roster conversation-id="${conversation.id}"></agent-roster>

      <div class="main-content">
        <div class="message-area">
          <message-stream conversation-id="${conversation.id}"></message-stream>
          <user-input conversation-id="${conversation.id}"></user-input>
        </div>
        <aside class="result-panel">
          <div class="panel-tabs">
            <button class="panel-tab active" data-panel="secretary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <path d="M20 8v6M23 11h-6"/>
              </svg>
              Secretary
            </button>
            <button class="panel-tab" data-panel="draft">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Draft
            </button>
          </div>
          <div class="panel-container">
            <div class="panel-content active" id="secretary-panel-content">
              <secretary-panel conversation-id="${conversation.id}"></secretary-panel>
            </div>
            <div class="panel-content" id="draft-panel-content">
              <result-draft conversation-id="${conversation.id}"></result-draft>
            </div>
          </div>
        </aside>
      </div>

      <div class="control-area">
        <control-bar 
          conversation-id="${conversation.id}" 
          status="${conversation.status}"
        ></control-bar>
      </div>
    `;

    // Set up control bar callbacks
    const controlBar = this.shadowRoot.querySelector('control-bar');
    if (controlBar) {
      controlBar.addEventListener('start', () => this.engine?.start());
      controlBar.addEventListener('pause', () => this.engine?.pause());
      controlBar.addEventListener('resume', () => this.engine?.resume());
      controlBar.addEventListener('stop', () => this.engine?.stop());
      controlBar.addEventListener('reset', () => this.engine?.reset());
    }

    // Set up settings button
    const settingsBtn = this.shadowRoot.getElementById('settings-btn');
    settingsBtn?.addEventListener('click', () => {
      const settingsModal = this.shadowRoot?.getElementById('conv-settings-modal') as HTMLElement;
      settingsModal?.setAttribute('open', 'true');
    });

    // Set up panel tab switching
    this.shadowRoot.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const panelName = target.dataset.panel;
        if (!panelName) return;

        // Update active tab
        this.shadowRoot?.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        target.classList.add('active');

        // Update active panel content
        this.shadowRoot?.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
        const panelContent = this.shadowRoot?.getElementById(`${panelName}-panel-content`);
        panelContent?.classList.add('active');
      });
    });
  }

  private renderEmpty() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: var(--space-8);
          text-align: center;
        }
        .empty-icon {
          width: 64px;
          height: 64px;
          margin-bottom: var(--space-4);
          opacity: 0.3;
        }
      </style>
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p style="color: var(--color-text-tertiary);">Select a conversation to get started</p>
      </div>
    `;
  }

  private renderError(message: string) {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: var(--space-8);
          text-align: center;
        }
        .error-icon {
          width: 64px;
          height: 64px;
          margin-bottom: var(--space-4);
          color: var(--color-error);
        }
      </style>
      <div class="error-state">
        <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p style="color: var(--color-error);">${message}</p>
      </div>
    `;
  }
}

customElements.define('conversation-view', ConversationView);

