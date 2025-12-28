// ============================================
// AI Brainstorm - Settings Panel Component
// Version: 1.0.0
// ============================================

import { settingsStorage, providerStorage } from '../storage/storage-manager';
import { llmRouter } from '../llm/llm-router';
import { eventBus } from '../utils/event-bus';
import type { AppSettings, LLMProvider } from '../types';

export class SettingsPanel extends HTMLElement {
  private settings: AppSettings | null = null;
  private providers: LLMProvider[] = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    await this.loadData();
    this.render();
  }

  private async loadData() {
    this.settings = await settingsStorage.get();
    this.providers = await providerStorage.getAll();
  }

  private render() {
    if (!this.shadowRoot || !this.settings) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--color-bg-primary);
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4) var(--space-6);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .settings-header h2 {
          margin: 0;
          font-size: var(--text-xl);
          color: var(--color-text-primary);
        }

        .close-btn {
          padding: var(--space-2);
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          color: var(--color-text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .close-btn:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .settings-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-6);
          max-width: 640px;
        }

        .section {
          margin-bottom: var(--space-8);
        }

        .section-title {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          margin-bottom: var(--space-4);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .section-title svg {
          color: var(--color-primary);
        }

        .form-group {
          margin-bottom: var(--space-4);
        }

        .form-label {
          display: block;
          margin-bottom: var(--space-2);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
        }

        .form-input, .form-select {
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

        .form-input:focus, .form-select:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-dim);
        }

        .form-hint {
          margin-top: var(--space-1);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .provider-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          margin-bottom: var(--space-3);
        }

        .provider-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
        }

        .provider-name {
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
        }

        .provider-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-error);
        }

        .status-dot.connected {
          background: var(--color-success);
        }

        .test-btn {
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface-hover);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .test-btn:hover {
          background: var(--color-bg-tertiary);
          color: var(--color-text-primary);
        }

        .test-btn.testing {
          opacity: 0.7;
          cursor: wait;
        }

        .toggle-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-2);
        }

        .toggle-label {
          color: var(--color-text-primary);
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: var(--color-border);
          border-radius: var(--radius-full);
          transition: background var(--transition-fast);
        }

        .toggle-slider::before {
          content: '';
          position: absolute;
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background: white;
          border-radius: 50%;
          transition: transform var(--transition-fast);
        }

        .toggle-switch input:checked + .toggle-slider {
          background: var(--color-primary);
        }

        .toggle-switch input:checked + .toggle-slider::before {
          transform: translateX(20px);
        }

        .theme-selector {
          display: flex;
          gap: var(--space-2);
        }

        .theme-option {
          flex: 1;
          padding: var(--space-3);
          background: var(--color-surface);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: center;
          transition: all var(--transition-fast);
        }

        .theme-option:hover {
          background: var(--color-surface-hover);
        }

        .theme-option.selected {
          border-color: var(--color-primary);
          background: var(--color-primary-dim);
        }

        .theme-preview {
          width: 100%;
          height: 40px;
          border-radius: var(--radius-sm);
          margin-bottom: var(--space-2);
        }

        .theme-preview.dark {
          background: linear-gradient(135deg, #0a0a0f, #1a1a2e);
        }

        .theme-preview.light {
          background: linear-gradient(135deg, #f5f5f8, #eaeaef);
        }

        .version-info {
          text-align: center;
          padding: var(--space-4);
          color: var(--color-text-tertiary);
          font-size: var(--text-xs);
        }
      </style>

      <div class="settings-header">
        <h2>Settings</h2>
        <button class="close-btn" id="close-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="settings-content">
        <!-- Theme Section -->
        <div class="section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
            Theme
          </div>
          <div class="theme-selector">
            <div class="theme-option ${this.settings.theme === 'dark' ? 'selected' : ''}" data-theme="dark">
              <div class="theme-preview dark"></div>
              <span>Dark</span>
            </div>
            <div class="theme-option ${this.settings.theme === 'light' ? 'selected' : ''}" data-theme="light">
              <div class="theme-preview light"></div>
              <span>Light</span>
            </div>
          </div>
        </div>

        <!-- LLM Providers Section -->
        <div class="section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            LLM Providers
          </div>

          ${this.providers.map(provider => `
            <div class="provider-card" data-provider-id="${provider.id}">
              <div class="provider-header">
                <span class="provider-name">${provider.name}</span>
                <div class="provider-status">
                  <span class="status-dot ${provider.isActive ? 'connected' : ''}"></span>
                  <span>${provider.isActive ? 'Connected' : 'Not configured'}</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">API Key ${provider.type === 'ollama' ? '(optional)' : ''}</label>
                <input 
                  type="password" 
                  class="form-input api-key-input" 
                  data-provider="${provider.id}"
                  value="${provider.apiKey || ''}"
                  placeholder="${provider.type === 'ollama' ? 'Not required for Ollama' : 'Enter your API key'}"
                >
                <div class="form-hint">
                  ${provider.type === 'openrouter' 
                    ? 'Get your API key from openrouter.ai' 
                    : 'Ollama runs locally. Make sure OLLAMA_ORIGINS=* is set.'}
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Base URL</label>
                <input 
                  type="text" 
                  class="form-input base-url-input" 
                  data-provider="${provider.id}"
                  value="${provider.baseUrl}"
                >
              </div>
              <button class="test-btn" data-provider="${provider.id}">Test Connection</button>
            </div>
          `).join('')}
        </div>

        <!-- Defaults Section -->
        <div class="section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Defaults
          </div>

          <div class="form-group">
            <label class="form-label">Default Speed (ms between turns)</label>
            <input type="number" class="form-input" id="default-speed" value="${this.settings.defaultSpeedMs}" min="0" max="10000" step="500">
          </div>

          <div class="form-group">
            <label class="form-label">Default Max Context Tokens</label>
            <input type="number" class="form-input" id="default-tokens" value="${this.settings.defaultMaxContextTokens}" min="1000" max="128000" step="1000">
          </div>

          <div class="toggle-group">
            <span class="toggle-label">Plain Text Only (no markdown)</span>
            <label class="toggle-switch">
              <input type="checkbox" id="plain-text-only" ${this.settings.defaultPlainTextOnly ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="toggle-group">
            <span class="toggle-label">Auto-scroll messages</span>
            <label class="toggle-switch">
              <input type="checkbox" id="auto-scroll" ${this.settings.autoScrollMessages ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="version-info">
          AI Brainstorm v1.0.0
        </div>
      </div>
    `;

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Close button
    this.shadowRoot?.getElementById('close-btn')?.addEventListener('click', () => {
      eventBus.emit('settings:close', undefined);
    });

    // Theme selection
    this.shadowRoot?.querySelectorAll('.theme-option').forEach(option => {
      option.addEventListener('click', async () => {
        const theme = option.getAttribute('data-theme') as 'dark' | 'light';
        this.settings = await settingsStorage.update({ theme });
        document.documentElement.setAttribute('data-theme', theme);

        this.shadowRoot?.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        
        eventBus.emit('settings:updated', this.settings!);
      });
    });

    // API key updates
    this.shadowRoot?.querySelectorAll('.api-key-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const providerId = (e.target as HTMLInputElement).dataset.provider;
        const apiKey = (e.target as HTMLInputElement).value;
        if (providerId) {
          await providerStorage.update(providerId, { apiKey });
          await llmRouter.updateProvider(providerId, { apiKey });
        }
      });
    });

    // Base URL updates
    this.shadowRoot?.querySelectorAll('.base-url-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const providerId = (e.target as HTMLInputElement).dataset.provider;
        const baseUrl = (e.target as HTMLInputElement).value;
        if (providerId) {
          await providerStorage.update(providerId, { baseUrl });
          await llmRouter.updateProvider(providerId, { baseUrl });
        }
      });
    });

    // Test connection buttons
    this.shadowRoot?.querySelectorAll('.test-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const button = e.target as HTMLButtonElement;
        const providerId = button.dataset.provider;
        if (!providerId) return;

        button.classList.add('testing');
        button.textContent = 'Testing...';

        const success = await llmRouter.testProvider(providerId);

        button.classList.remove('testing');
        button.textContent = success ? '✓ Connected' : '✗ Failed';

        // Update status dot
        const card = button.closest('.provider-card');
        const statusDot = card?.querySelector('.status-dot');
        const statusText = card?.querySelector('.provider-status span:last-child');
        if (statusDot && statusText) {
          statusDot.classList.toggle('connected', success);
          statusText.textContent = success ? 'Connected' : 'Not configured';
        }

        // Reset button text after delay
        setTimeout(() => {
          button.textContent = 'Test Connection';
        }, 2000);
      });
    });

    // Default settings updates
    this.shadowRoot?.getElementById('default-speed')?.addEventListener('change', async (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.settings = await settingsStorage.update({ defaultSpeedMs: value });
    });

    this.shadowRoot?.getElementById('default-tokens')?.addEventListener('change', async (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.settings = await settingsStorage.update({ defaultMaxContextTokens: value });
    });

    this.shadowRoot?.getElementById('plain-text-only')?.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.settings = await settingsStorage.update({ defaultPlainTextOnly: checked });
    });

    this.shadowRoot?.getElementById('auto-scroll')?.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.settings = await settingsStorage.update({ autoScrollMessages: checked });
    });
  }
}

customElements.define('settings-panel', SettingsPanel);

