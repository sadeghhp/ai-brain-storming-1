// ============================================
// AI Brainstorm - Conversation View Component
// ============================================

import { ConversationEngine } from '../engine/conversation-engine';
import { eventBus } from '../utils/event-bus';
import { downloadConversation } from '../utils/export';
import { isLockedByOtherTab } from '../utils/conversation-lock';
import './message-stream';
import './agent-roster';
import './control-bar';
import './result-draft';
import './secretary-panel';
import './user-input';
import './conversation-settings-modal';
import './turn-queue';
import './round-progress';

export class ConversationView extends HTMLElement {
  private engine: ConversationEngine | null = null;
  private conversationId: string | null = null;
  private isLocked: boolean = false;
  private lockCheckInterval: number | null = null;
  private onExportDocumentClick: ((e: MouseEvent) => void) | null = null;
  private onExportDocumentKeydown: ((e: KeyboardEvent) => void) | null = null;
  private eventUnsubscribers: (() => void)[] = [];

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
    // Cleanup document-level listeners to prevent leaks across re-renders / navigation
    if (this.onExportDocumentClick) {
      document.removeEventListener('click', this.onExportDocumentClick);
      this.onExportDocumentClick = null;
    }
    if (this.onExportDocumentKeydown) {
      document.removeEventListener('keydown', this.onExportDocumentKeydown);
      this.onExportDocumentKeydown = null;
    }
    // Cleanup lock polling interval
    if (this.lockCheckInterval) {
      clearInterval(this.lockCheckInterval);
      this.lockCheckInterval = null;
    }
    // Cleanup event bus subscriptions to prevent memory leaks
    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];
  }

  private async loadConversation() {
    // Clear any existing lock check interval
    if (this.lockCheckInterval) {
      clearInterval(this.lockCheckInterval);
      this.lockCheckInterval = null;
    }

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

    // Check if this conversation is locked by another tab
    this.isLocked = await isLockedByOtherTab(this.conversationId);
    
    // Set up periodic lock check if locked (to detect when lock is released)
    if (this.isLocked) {
      this.startLockPolling();
    }

    this.renderConversation();
  }

  /**
   * Start polling for lock status changes
   * When the other tab releases the lock, we refresh to enable controls
   */
  private startLockPolling(): void {
    if (this.lockCheckInterval) return;
    
    this.lockCheckInterval = window.setInterval(async () => {
      if (!this.conversationId) return;
      
      const stillLocked = await isLockedByOtherTab(this.conversationId);
      if (!stillLocked && this.isLocked) {
        // Lock was released, refresh the view
        console.log('[ConversationView] Lock released, refreshing view');
        this.isLocked = false;
        if (this.lockCheckInterval) {
          clearInterval(this.lockCheckInterval);
          this.lockCheckInterval = null;
        }
        // Reload to get fresh state and enable controls
        this.loadConversation();
      }
    }, 2000); // Check every 2 seconds
  }

  private setupEventListeners() {
    // Clear any existing subscriptions before setting up new ones
    for (const unsubscribe of this.eventUnsubscribers) {
      unsubscribe();
    }
    this.eventUnsubscribers = [];

    // Handle control bar actions
    this.eventUnsubscribers.push(
      eventBus.on('conversation:started', (id) => {
        if (id === this.conversationId) {
          this.updateControlBar();
        }
      })
    );

    this.eventUnsubscribers.push(
      eventBus.on('conversation:paused', (id) => {
        if (id === this.conversationId) {
          this.updateControlBar();
        }
      })
    );

    this.eventUnsubscribers.push(
      eventBus.on('conversation:resumed', (id) => {
        if (id === this.conversationId) {
          this.updateControlBar();
        }
      })
    );

    this.eventUnsubscribers.push(
      eventBus.on('conversation:stopped', (id) => {
        if (id === this.conversationId) {
          this.updateControlBar();
        }
      })
    );

    this.eventUnsubscribers.push(
      eventBus.on('conversation:reset', (id) => {
        if (id === this.conversationId) {
          this.updateControlBar();
        }
      })
    );

    this.eventUnsubscribers.push(
      eventBus.on('conversation:updated', (conv) => {
        if (conv.id === this.conversationId) {
          this.loadConversation();
        }
      })
    );
  }

  private updateControlBar() {
    const controlBar = this.shadowRoot?.querySelector('control-bar') as HTMLElement;
    if (controlBar && this.engine) {
      const status = this.engine.getStatus();
      controlBar.setAttribute('status', status);
      // Update locked state
      if (this.isLocked) {
        controlBar.setAttribute('locked', 'true');
      } else {
        controlBar.removeAttribute('locked');
      }
      // Update host data attribute for conditional styling
      this.setAttribute('data-status', status);
    }
  }

  private async emitInitialTurnQueueState(conversationId: string): Promise<void> {
    if (!this.engine) return;
    const state = await this.engine.getTurnQueueState();
    if (!state) return;

    // Guard against races when switching conversations quickly
    if (state.conversationId !== conversationId) return;
    eventBus.emit('turn:order-updated', state);
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

    // If we previously registered document listeners (from a prior render), remove them first.
    if (this.onExportDocumentClick) {
      document.removeEventListener('click', this.onExportDocumentClick);
      this.onExportDocumentClick = null;
    }
    if (this.onExportDocumentKeydown) {
      document.removeEventListener('keydown', this.onExportDocumentKeydown);
      this.onExportDocumentKeydown = null;
    }

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
          gap: var(--space-3);
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

        .header-btn {
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

        .header-btn:hover {
          background: var(--color-surface);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
        }

        .header-btn svg {
          width: 18px;
          height: 18px;
        }

        /* Finish button - prominent styling */
        .finish-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid var(--color-success);
          border-radius: var(--radius-md);
          color: var(--color-success);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .finish-btn:hover:not(:disabled) {
          background: rgba(34, 197, 94, 0.2);
        }

        .finish-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .finish-btn svg {
          width: 16px;
          height: 16px;
        }

        /* Hide finish button when not running or paused */
        :host(:not([data-status="running"]):not([data-status="paused"])) .finish-btn {
          display: none;
        }

        /* Export dropdown */
        .export-wrapper {
          position: relative;
        }

        .export-dropdown {
          position: absolute;
          top: calc(100% + var(--space-2));
          right: 0;
          min-width: 160px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          z-index: 100;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-8px);
          transition: all var(--transition-fast);
        }

        .export-dropdown.open {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }

        .export-dropdown-header {
          padding: var(--space-2) var(--space-3);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid var(--color-border);
        }

        .export-option {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: 100%;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          text-align: left;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .export-option:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .export-option:first-of-type {
          border-radius: var(--radius-md) var(--radius-md) 0 0;
        }

        .export-option:last-child {
          border-radius: 0 0 var(--radius-md) var(--radius-md);
        }

        .export-option svg {
          width: 16px;
          height: 16px;
          opacity: 0.7;
        }

        .export-option .ext {
          margin-left: auto;
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          font-family: var(--font-mono);
        }

        /* Turn queue visibility based on status */
        turn-queue {
          display: none;
        }

        :host([data-status="running"]) turn-queue,
        :host([data-status="finishing"]) turn-queue {
          display: block;
        }

        /* Status badge for finishing state */
        .status-finishing {
          background: rgba(34, 197, 94, 0.15);
          color: var(--color-success);
        }

        /* Locked banner - shown when conversation is running in another tab */
        .locked-banner {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-6);
          background: rgba(245, 158, 11, 0.1);
          border-bottom: 1px solid rgba(245, 158, 11, 0.3);
          color: var(--color-warning);
          font-size: var(--text-sm);
        }

        .locked-banner svg {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        .locked-banner-text {
          flex: 1;
        }

        .locked-banner-hint {
          color: var(--color-text-tertiary);
          font-size: var(--text-xs);
        }
      </style>

      <header class="conversation-header">
        <div class="conv-info">
          <div class="conv-subject">${conversation.subject}</div>
          <div class="conv-goal">${conversation.goal}</div>
        </div>
        <div class="conv-meta">
          <round-progress conversation-id="${conversation.id}"></round-progress>
          <span class="status-badge status-${conversation.status}">${conversation.status}</span>
          <button class="finish-btn" id="finish-header-btn" title="Finish Discussion" ${this.isLocked ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
            Finish
          </button>
          <div class="export-wrapper">
            <button class="header-btn" id="export-btn" title="Export Conversation" aria-haspopup="menu" aria-expanded="false" aria-controls="export-dropdown">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <div class="export-dropdown" id="export-dropdown" role="menu" aria-label="Export conversation">
              <div class="export-dropdown-header">Export as</div>
              <button class="export-option" data-format="text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Plain Text
                <span class="ext">.txt</span>
              </button>
              <button class="export-option" data-format="markdown">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M9 15l2-2 2 2"/>
                  <path d="M9 11h6"/>
                </svg>
                Markdown
                <span class="ext">.md</span>
              </button>
              <button class="export-option" data-format="json">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <path d="M8 13h2"/>
                  <path d="M8 17h2"/>
                  <path d="M14 13h2"/>
                  <path d="M14 17h2"/>
                </svg>
                JSON Data
                <span class="ext">.json</span>
              </button>
            </div>
          </div>
          <button class="header-btn" id="settings-btn" title="Conversation Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </header>

      <conversation-settings-modal id="conv-settings-modal" conversation-id="${conversation.id}"></conversation-settings-modal>

      <turn-queue conversation-id="${conversation.id}"></turn-queue>

      ${this.isLocked ? `
      <div class="locked-banner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <div class="locked-banner-text">
          This conversation is running in another tab
          <div class="locked-banner-hint">Controls are disabled. Close the other tab or wait for it to finish.</div>
        </div>
      </div>
      ` : ''}

      <agent-roster conversation-id="${conversation.id}"></agent-roster>

      <div class="main-content">
        <div class="message-area">
          <message-stream conversation-id="${conversation.id}" target-language="${conversation.targetLanguage || ''}"></message-stream>
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
          ${this.isLocked ? 'locked="true"' : ''}
        ></control-bar>
      </div>
    `;

    // Ensure host status-dependent styles are correct immediately on render
    this.setAttribute('data-status', conversation.status);
    void this.emitInitialTurnQueueState(conversation.id);

    // Set up control bar callbacks
    const controlBar = this.shadowRoot.querySelector('control-bar');
    if (controlBar) {
      controlBar.addEventListener('start', () => this.engine?.start());
      controlBar.addEventListener('pause', () => this.engine?.pause());
      controlBar.addEventListener('resume', () => this.engine?.resume());
      controlBar.addEventListener('stop', () => this.engine?.stop());
      controlBar.addEventListener('finish', () => this.engine?.finish());
      controlBar.addEventListener('reset', () => this.engine?.reset());
      controlBar.addEventListener('speed-change', (e: Event) => {
        const { speedMs } = (e as CustomEvent).detail || {};
        if (typeof speedMs === 'number') {
          void this.engine?.setSpeedMs(speedMs);
        }
      });
    }

    // Set up settings button
    const settingsBtn = this.shadowRoot.getElementById('settings-btn');
    settingsBtn?.addEventListener('click', () => {
      const settingsModal = this.shadowRoot?.getElementById('conv-settings-modal') as HTMLElement;
      settingsModal?.setAttribute('open', 'true');
    });

    // Set up header finish button (calls the same finish as control bar)
    const finishHeaderBtn = this.shadowRoot.getElementById('finish-header-btn');
    finishHeaderBtn?.addEventListener('click', () => this.engine?.finish());

    // Set up export button and dropdown
    const exportBtn = this.shadowRoot.getElementById('export-btn');
    const exportDropdown = this.shadowRoot.getElementById('export-dropdown');
    
    exportBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDropdown?.classList.toggle('open');
      const isOpen = exportDropdown?.classList.contains('open') ?? false;
      exportBtn.setAttribute('aria-expanded', String(isOpen));
    });

    // Handle export format selection
    this.shadowRoot.querySelectorAll('.export-option').forEach(option => {
      option.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const format = target.dataset.format as 'text' | 'markdown' | 'json';
        
        if (format && this.conversationId) {
          try {
            await downloadConversation(this.conversationId, format);
          } catch (error) {
            console.error('Export failed:', error);
            eventBus.emit('error', { message: 'Failed to export conversation' });
          }
        }
        
        exportDropdown?.classList.remove('open');
        exportBtn?.setAttribute('aria-expanded', 'false');
      });
    });

    // Close dropdown when clicking outside
    this.onExportDocumentClick = (e: MouseEvent) => {
      if (!exportBtn?.contains(e.target as Node) && !exportDropdown?.contains(e.target as Node)) {
        exportDropdown?.classList.remove('open');
        exportBtn?.setAttribute('aria-expanded', 'false');
      }
    };
    
    document.addEventListener('click', this.onExportDocumentClick);
    
    // Close dropdown on Escape key
    this.onExportDocumentKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exportDropdown?.classList.remove('open');
        exportBtn?.setAttribute('aria-expanded', 'false');
      }
    };
    
    document.addEventListener('keydown', this.onExportDocumentKeydown);

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

