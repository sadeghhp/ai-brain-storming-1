// ============================================
// AI Brainstorm - App Shell Component
// Version: 1.0.0
// ============================================

import { initializeDatabase } from '../storage/db';
import { llmRouter } from '../llm/llm-router';
import { initializePresets } from '../agents/presets';
import { settingsStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import './nav-sidebar';
import './conversation-view';
import './settings-panel';
import './new-conversation-modal';
import './conversation-settings-modal';

/**
 * App Shell - Main application container
 */
export class AppShell extends HTMLElement {
  private currentView: 'conversation' | 'settings' = 'conversation';
  private currentConversationId: string | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    await this.initialize();
  }

  private async initialize() {
    try {
      // Initialize database
      await initializeDatabase();
      
      // Initialize LLM router
      await llmRouter.initialize();
      
      // Initialize presets
      await initializePresets();
      
      // Load settings
      const settings = await settingsStorage.get();
      document.documentElement.setAttribute('data-theme', settings.theme);

      this.setupEventListeners();
      this.renderContent();
      
      console.log('[AppShell] Initialized successfully');
    } catch (error) {
      console.error('[AppShell] Initialization failed:', error);
      this.renderError(error);
    }
  }

  private setupEventListeners() {
    // Navigation events
    eventBus.on('conversation:selected', (id: string) => {
      this.currentConversationId = id;
      this.currentView = 'conversation';
      this.renderContent();
    });

    eventBus.on('settings:open', () => {
      this.currentView = 'settings';
      this.renderContent();
    });

    eventBus.on('settings:close', () => {
      this.currentView = 'conversation';
      this.renderContent();
    });

    eventBus.on('conversation:created', () => {
      this.renderContent();
    });

    // Theme changes
    eventBus.on('settings:updated', async () => {
      const settings = await settingsStorage.get();
      document.documentElement.setAttribute('data-theme', settings.theme);
    });
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          width: 100%;
          height: 100vh;
          overflow: hidden;
        }

        .app-container {
          display: flex;
          width: 100%;
          height: 100%;
        }

        .sidebar {
          width: var(--sidebar-width, 280px);
          height: 100%;
          flex-shrink: 0;
          border-right: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .main-content {
          flex: 1;
          height: 100%;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .loading-screen,
        .error-screen {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          padding: var(--space-8);
          text-align: center;
        }

        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 3px solid var(--color-border);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: var(--space-4);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-icon {
          width: 64px;
          height: 64px;
          color: var(--color-error);
          margin-bottom: var(--space-4);
        }

        .retry-btn {
          margin-top: var(--space-4);
          padding: var(--space-2) var(--space-4);
          background: var(--color-primary);
          color: var(--color-bg-primary);
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-weight: var(--font-medium);
        }

        .retry-btn:hover {
          opacity: 0.9;
        }
      </style>

      <div class="app-container">
        <aside class="sidebar">
          <nav-sidebar></nav-sidebar>
        </aside>
        <main class="main-content" id="main-content">
          <div class="loading-screen">
            <div class="loading-spinner"></div>
            <p>Initializing AI Brainstorm...</p>
          </div>
        </main>
      </div>
      <new-conversation-modal></new-conversation-modal>
    `;
  }

  private renderContent() {
    const mainContent = this.shadowRoot?.getElementById('main-content');
    if (!mainContent) return;

    if (this.currentView === 'settings') {
      mainContent.innerHTML = `<settings-panel></settings-panel>`;
    } else if (this.currentConversationId) {
      mainContent.innerHTML = `<conversation-view conversation-id="${this.currentConversationId}"></conversation-view>`;
    } else {
      mainContent.innerHTML = `
        <div class="loading-screen">
          <svg width="80" height="80" viewBox="0 0 64 64" fill="none" style="margin-bottom: var(--space-6);">
            <circle cx="32" cy="32" r="28" stroke="var(--color-primary)" stroke-width="2" fill="none" opacity="0.3"/>
            <circle cx="20" cy="28" r="4" fill="var(--color-primary)"/>
            <circle cx="44" cy="28" r="4" fill="var(--color-secondary)"/>
            <circle cx="32" cy="44" r="4" fill="var(--color-primary)"/>
            <line x1="20" y1="28" x2="44" y2="28" stroke="var(--color-border-strong)" stroke-width="1.5"/>
            <line x1="20" y1="28" x2="32" y2="44" stroke="var(--color-border-strong)" stroke-width="1.5"/>
            <line x1="44" y1="28" x2="32" y2="44" stroke="var(--color-border-strong)" stroke-width="1.5"/>
          </svg>
          <h2 style="margin-bottom: var(--space-2); color: var(--color-text-primary);">Welcome to AI Brainstorm</h2>
          <p style="color: var(--color-text-secondary); margin-bottom: var(--space-6);">
            Create a new conversation to get started
          </p>
          <button class="retry-btn" id="new-conv-btn">
            + New Conversation
          </button>
        </div>
      `;

      const newConvBtn = mainContent.querySelector('#new-conv-btn');
      newConvBtn?.addEventListener('click', () => {
        const modal = this.shadowRoot?.querySelector('new-conversation-modal') as HTMLElement;
        modal?.setAttribute('open', 'true');
      });
    }
  }

  private renderError(error: unknown) {
    const mainContent = this.shadowRoot?.getElementById('main-content');
    if (!mainContent) return;

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';

    mainContent.innerHTML = `
      <div class="error-screen">
        <svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h2 style="color: var(--color-error); margin-bottom: var(--space-2);">Initialization Failed</h2>
        <p style="color: var(--color-text-secondary);">${message}</p>
        <button class="retry-btn" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

customElements.define('app-shell', AppShell);

