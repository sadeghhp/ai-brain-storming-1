// ============================================
// AI Brainstorm - Navigation Sidebar Component
// Version: 1.0.0
// ============================================

import { conversationStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { formatRelativeTime, truncate } from '../utils/helpers';
import type { Conversation } from '../types';

export class NavSidebar extends HTMLElement {
  private conversations: Conversation[] = [];
  private selectedId: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    await this.loadConversations();
    this.setupEventListeners();
  }

  private async loadConversations() {
    this.conversations = await conversationStorage.getAll();
    this.renderConversationList();
  }

  private setupEventListeners() {
    // Refresh on conversation changes
    eventBus.on('conversation:created', () => this.loadConversations());
    eventBus.on('conversation:deleted', () => this.loadConversations());
    eventBus.on('conversation:updated', () => this.loadConversations());
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--color-bg-secondary);
        }

        .sidebar-header {
          padding: var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .logo-icon {
          width: 32px;
          height: 32px;
        }

        .logo-text {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .new-conv-btn {
          width: 100%;
          margin-top: var(--space-4);
          padding: var(--space-3);
          background: var(--color-primary);
          color: var(--color-bg-primary);
          border: none;
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          transition: all var(--transition-fast);
        }

        .new-conv-btn:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .conversation-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2);
        }

        .conversation-item {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          cursor: pointer;
          margin-bottom: var(--space-1);
          transition: background var(--transition-fast);
          border: 1px solid transparent;
        }

        .conversation-item:hover {
          background: var(--color-surface-hover);
        }

        .conversation-item.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .conv-subject {
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          margin-bottom: var(--space-1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .conv-status {
          display: inline-flex;
          align-items: center;
          padding: 2px 6px;
          border-radius: var(--radius-full);
          font-size: 10px;
          font-weight: var(--font-medium);
          text-transform: uppercase;
        }

        .status-idle { background: var(--color-surface); color: var(--color-text-tertiary); }
        .status-running { background: rgba(34, 197, 94, 0.15); color: var(--color-success); }
        .status-paused { background: rgba(245, 158, 11, 0.15); color: var(--color-warning); }
        .status-completed { background: var(--color-primary-dim); color: var(--color-primary); }

        .sidebar-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--color-border);
        }

        .settings-btn {
          width: 100%;
          padding: var(--space-2);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          transition: all var(--transition-fast);
        }

        .settings-btn:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .empty-state {
          padding: var(--space-8);
          text-align: center;
          color: var(--color-text-tertiary);
        }

        .empty-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto var(--space-3);
          opacity: 0.5;
        }
      </style>

      <div class="sidebar-header">
        <div class="logo">
          <svg class="logo-icon" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="var(--color-primary)" stroke-width="2" fill="none"/>
            <circle cx="20" cy="28" r="4" fill="var(--color-primary)"/>
            <circle cx="44" cy="28" r="4" fill="var(--color-secondary)"/>
            <circle cx="32" cy="44" r="4" fill="var(--color-primary)"/>
            <line x1="20" y1="28" x2="44" y2="28" stroke="var(--color-border-strong)" stroke-width="1.5"/>
            <line x1="20" y1="28" x2="32" y2="44" stroke="var(--color-border-strong)" stroke-width="1.5"/>
            <line x1="44" y1="28" x2="32" y2="44" stroke="var(--color-border-strong)" stroke-width="1.5"/>
          </svg>
          <span class="logo-text">AI Brainstorm</span>
        </div>
        <button class="new-conv-btn" id="new-conv-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Conversation
        </button>
      </div>

      <div class="conversation-list" id="conversation-list">
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No conversations yet</p>
        </div>
      </div>

      <div class="sidebar-footer">
        <button class="settings-btn" id="settings-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Settings
        </button>
      </div>
    `;

    // Event listeners
    this.shadowRoot.getElementById('new-conv-btn')?.addEventListener('click', () => {
      const modal = document.querySelector('app-shell')?.shadowRoot?.querySelector('new-conversation-modal') as HTMLElement;
      modal?.setAttribute('open', 'true');
    });

    this.shadowRoot.getElementById('settings-btn')?.addEventListener('click', () => {
      eventBus.emit('settings:open', undefined);
    });
  }

  private renderConversationList() {
    const list = this.shadowRoot?.getElementById('conversation-list');
    if (!list) return;

    if (this.conversations.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No conversations yet</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.conversations.map(conv => `
      <div class="conversation-item ${conv.id === this.selectedId ? 'selected' : ''}" data-id="${conv.id}">
        <div class="conv-subject">${truncate(conv.subject, 40)}</div>
        <div class="conv-meta">
          <span class="conv-status status-${conv.status}">${conv.status}</span>
          <span>${formatRelativeTime(conv.updatedAt)}</span>
        </div>
      </div>
    `).join('');

    // Add click handlers
    list.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        if (id) {
          this.selectedId = id;
          this.renderConversationList();
          eventBus.emit('conversation:selected', id);
        }
      });
    });
  }
}

customElements.define('nav-sidebar', NavSidebar);

