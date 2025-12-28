// ============================================
// AI Brainstorm - Settings Panel Component
// Version: 2.3.0
// ============================================

import { settingsStorage, providerStorage, presetStorage } from '../storage/storage-manager';
import { presetCategories } from '../agents/presets';
import { llmRouter } from '../llm/llm-router';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { ALL_LANGUAGES } from '../utils/languages';
import type { AppSettings, LLMProvider, ApiFormat, AgentPreset } from '../types';
import './agent-preset-editor-modal';
import type { AgentPresetEditorModal } from './agent-preset-editor-modal';

export class SettingsPanel extends HTMLElement {
  private settings: AppSettings | null = null;
  private providers: LLMProvider[] = [];
  private presets: AgentPreset[] = [];
  private expandedAgentCategories: Set<string> = new Set();

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
    this.presets = await presetStorage.getAll();
  }

  private render() {
    if (!this.shadowRoot || !this.settings) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--color-bg-primary);
          overflow: hidden;
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
          overflow-x: hidden;
          padding: var(--space-6);
          max-width: 640px;
          width: 100%;
          margin: 0 auto;
          min-height: 0;
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
          gap: var(--space-3);
        }

        .provider-header > div:first-child {
          min-width: 0;
          flex: 1;
        }

        .provider-name {
          display: block;
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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

        .add-provider-btn {
          width: 100%;
          padding: var(--space-3);
          background: var(--color-primary-dim);
          border: 1px dashed var(--color-primary);
          border-radius: var(--radius-md);
          color: var(--color-primary);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-bottom: var(--space-4);
        }

        .add-provider-btn:hover {
          background: var(--color-primary);
          color: white;
          border-style: solid;
        }

        .provider-format {
          display: inline-block;
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-left: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-sm);
          white-space: nowrap;
        }

        .provider-actions {
          display: flex;
          gap: var(--space-2);
          align-items: center;
        }

        .delete-provider-btn {
          padding: var(--space-2);
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          color: var(--color-text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .delete-provider-btn:hover {
          background: var(--color-error);
          color: white;
        }

        .models-section {
          margin-top: var(--space-3);
          padding-top: var(--space-3);
          border-top: 1px solid var(--color-border);
        }

        .models-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .models-title {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
        }

        .models-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
        }

        .model-tag {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          max-width: 100%;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .model-tag.custom {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .model-tag .remove-model {
          padding: 0;
          background: none;
          border: none;
          color: inherit;
          cursor: pointer;
          opacity: 0.6;
          font-size: 14px;
          line-height: 1;
        }

        .model-tag .remove-model:hover {
          opacity: 1;
        }

        .add-model-btn {
          padding: var(--space-1) var(--space-2);
          background: transparent;
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .add-model-btn:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-6);
          width: 400px;
          max-width: 90vw;
        }

        .modal h3 {
          margin: 0 0 var(--space-4) 0;
          color: var(--color-text-primary);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          margin-top: var(--space-4);
        }

        .modal-btn {
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .modal-btn.cancel {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
        }

        .modal-btn.cancel:hover {
          background: var(--color-surface-hover);
        }

        .modal-btn.primary {
          background: var(--color-primary);
          border: none;
          color: white;
        }

        .modal-btn.primary:hover {
          opacity: 0.9;
        }

        /* Language selection grid */
        .language-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: var(--space-2);
          max-height: 320px;
          overflow-y: auto;
          padding: var(--space-2);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .language-item {
          display: flex;
          flex-direction: column;
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
          position: relative;
        }

        .language-item:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-primary);
        }

        .language-item.enabled {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .language-item.locked {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .language-item.locked::after {
          content: '(Required)';
          position: absolute;
          top: var(--space-1);
          right: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .language-checkbox {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
        }

        .language-name {
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          font-size: var(--text-sm);
        }

        .language-native {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        /* Agent Presets Section Styles */
        .agents-subsection {
          margin-bottom: var(--space-4);
        }

        .agents-subsection-title {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-2);
        }

        .category-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: var(--space-2);
          margin-bottom: var(--space-4);
        }

        .category-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }

        .category-toggle:hover {
          border-color: var(--color-border-strong);
        }

        .category-toggle.hidden {
          opacity: 0.5;
          background: var(--color-bg-tertiary);
        }

        .category-info {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
        }

        .category-icon {
          font-size: var(--text-base);
        }

        .mini-toggle {
          position: relative;
          width: 32px;
          height: 18px;
          flex-shrink: 0;
        }

        .mini-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .mini-toggle .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: var(--color-border);
          border-radius: var(--radius-full);
          transition: background var(--transition-fast);
        }

        .mini-toggle .toggle-slider::before {
          content: '';
          position: absolute;
          height: 14px;
          width: 14px;
          left: 2px;
          bottom: 2px;
          background: white;
          border-radius: 50%;
          transition: transform var(--transition-fast);
        }

        .mini-toggle input:checked + .toggle-slider {
          background: var(--color-primary);
        }

        .mini-toggle input:checked + .toggle-slider::before {
          transform: translateX(14px);
        }

        .preset-list {
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          max-height: 400px;
          overflow-y: auto;
        }

        .preset-category-section {
          border-bottom: 1px solid var(--color-border);
        }

        .preset-category-section:last-child {
          border-bottom: none;
        }

        .preset-category-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3);
          cursor: pointer;
          transition: background var(--transition-fast);
          user-select: none;
        }

        .preset-category-header:hover {
          background: var(--color-surface-hover);
        }

        .preset-category-header.expanded {
          background: var(--color-surface);
        }

        .preset-category-title {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
        }

        .preset-category-count {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          margin-left: var(--space-2);
        }

        .preset-category-chevron {
          transition: transform 0.2s ease;
          color: var(--color-text-tertiary);
        }

        .preset-category-header.expanded .preset-category-chevron {
          transform: rotate(180deg);
        }

        .preset-category-content {
          display: none;
          padding: var(--space-2);
          padding-top: 0;
        }

        .preset-category-content.expanded {
          display: block;
        }

        .preset-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          margin-bottom: var(--space-2);
          gap: var(--space-2);
        }

        .preset-item:last-child {
          margin-bottom: 0;
        }

        .preset-item.hidden {
          opacity: 0.5;
        }

        .preset-item-info {
          flex: 1;
          min-width: 0;
        }

        .preset-item-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preset-item-description {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preset-item-badge {
          font-size: var(--text-xs);
          padding: 2px 6px;
          background: var(--color-primary-dim);
          color: var(--color-primary);
          border-radius: var(--radius-sm);
          white-space: nowrap;
        }

        .preset-item-badge.custom {
          background: var(--color-success);
          background: rgba(34, 197, 94, 0.1);
          color: var(--color-success);
        }

        .preset-item-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-shrink: 0;
        }

        .preset-action-btn {
          padding: var(--space-1) var(--space-2);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--transition-fast);
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }

        .preset-action-btn:hover {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
          border-color: var(--color-border-strong);
        }

        .preset-action-btn.clone:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .preset-action-btn.edit:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .preset-action-btn.delete:hover {
          border-color: var(--color-error);
          color: var(--color-error);
        }

        .create-preset-btn {
          width: 100%;
          padding: var(--space-3);
          background: var(--color-primary-dim);
          border: 1px dashed var(--color-primary);
          border-radius: var(--radius-md);
          color: var(--color-primary);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-top: var(--space-4);
        }

        .create-preset-btn:hover {
          background: var(--color-primary);
          color: white;
          border-style: solid;
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

          <button class="add-provider-btn" id="add-provider-btn">+ Add Provider</button>

          ${this.providers.map(provider => `
            <div class="provider-card" data-provider-id="${provider.id}">
              <div class="provider-header">
                <div>
                  <span class="provider-name">${provider.name}</span>
                  <span class="provider-format">${this.formatApiFormat(provider.apiFormat)}</span>
                </div>
                <div class="provider-actions">
                  <div class="provider-status">
                    <span class="status-dot ${provider.isActive ? 'connected' : ''}"></span>
                    <span>${provider.isActive ? 'Connected' : 'Not configured'}</span>
                  </div>
                  <button class="delete-provider-btn" data-provider="${provider.id}" title="Delete provider">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">API Key ${provider.apiFormat === 'ollama' ? '(optional)' : ''}</label>
                <input 
                  type="password" 
                  class="form-input api-key-input" 
                  data-provider="${provider.id}"
                  value="${provider.apiKey || ''}"
                  placeholder="${provider.apiFormat === 'ollama' ? 'Not required for Ollama' : 'Enter your API key'}"
                >
                <div class="form-hint">
                  ${this.getApiKeyHint(provider.apiFormat)}
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
              <div class="toggle-group" style="margin-top: var(--space-2);">
                <span class="toggle-label">Auto-fetch models from API</span>
                <label class="toggle-switch">
                  <input type="checkbox" class="auto-fetch-toggle" data-provider="${provider.id}" ${provider.autoFetchModels ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
              
              <!-- Models Section -->
              <div class="models-section">
                <div class="models-header">
                  <span class="models-title">Models</span>
                </div>
                <div class="models-list">
                  ${(provider.models || []).map(model => `
                    <span class="model-tag ${model.isCustom ? 'custom' : ''}" data-model-id="${model.id}">
                      ${model.name}
                      ${model.isCustom ? `<button class="remove-model" data-provider="${provider.id}" data-model="${model.id}">×</button>` : ''}
                    </span>
                  `).join('')}
                  <button class="add-model-btn" data-provider="${provider.id}">+ Add Model</button>
                </div>
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

          <div class="toggle-group">
            <span class="toggle-label">Enable keyboard shortcuts</span>
            <label class="toggle-switch">
              <input type="checkbox" id="keyboard-shortcuts" ${this.settings.showKeyboardShortcuts ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <!-- Agent Presets Section -->
        <div class="section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Agent Presets
          </div>
          <div class="form-hint" style="margin-bottom: var(--space-3);">
            Manage which agent presets appear when creating conversations. Toggle categories or individual presets.
          </div>

          <!-- Category Toggles -->
          <div class="agents-subsection">
            <div class="agents-subsection-title">Categories</div>
            <div class="category-grid">
              ${presetCategories.map(cat => {
                const isHidden = this.settings!.hiddenCategories.includes(cat.id);
                return `
                  <div class="category-toggle ${isHidden ? 'hidden' : ''}" data-category-id="${cat.id}">
                    <div class="category-info">
                      <span class="category-icon">${cat.icon}</span>
                      <span>${cat.name}</span>
                    </div>
                    <label class="mini-toggle">
                      <input type="checkbox" class="category-visibility-toggle" data-category="${cat.id}" ${!isHidden ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Preset List -->
          <div class="agents-subsection">
            <div class="agents-subsection-title">All Presets</div>
            <div class="preset-list">
              ${this.renderPresetsByCategory()}
            </div>
          </div>

          <button class="create-preset-btn" id="create-preset-btn">+ Create Custom Preset</button>
        </div>

        <!-- Conversation Languages Section -->
        <div class="section">
          <div class="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            Conversation Languages
          </div>
          <div class="form-hint" style="margin-bottom: var(--space-3);">
            Select which languages appear in the conversation language selector. English is always available.
          </div>
          <div class="language-grid">
            ${ALL_LANGUAGES.map(lang => {
              const isEnglish = lang.code === '';
              const isEnabled = isEnglish || this.settings!.enabledLanguages.includes(lang.code);
              return `
                <label class="language-item ${isEnabled ? 'enabled' : ''} ${isEnglish ? 'locked' : ''}">
                  <input type="checkbox" 
                         class="language-checkbox" 
                         data-lang-code="${lang.code}"
                         ${isEnabled ? 'checked' : ''}
                         ${isEnglish ? 'disabled' : ''}>
                  <span class="language-name">${lang.name}</span>
                  <span class="language-native">${lang.nativeName}</span>
                </label>
              `;
            }).join('')}
          </div>
        </div>

        <div class="version-info">
          AI Brainstorm v2.0.0
        </div>
      </div>

      <!-- Add Provider Modal -->
      <div class="modal-overlay" id="add-provider-modal" style="display: none;">
        <div class="modal">
          <h3>Add New Provider</h3>
          <div class="form-group">
            <label class="form-label">Provider Name</label>
            <input type="text" class="form-input" id="new-provider-name" placeholder="e.g., My OpenAI Server">
          </div>
          <div class="form-group">
            <label class="form-label">API Format</label>
            <select class="form-select" id="new-provider-format">
              <option value="openai">OpenAI Compatible</option>
              <option value="anthropic">Anthropic</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Base URL</label>
            <input type="text" class="form-input" id="new-provider-url" placeholder="https://api.example.com/v1">
          </div>
          <div class="form-group">
            <label class="form-label">API Key (optional)</label>
            <input type="password" class="form-input" id="new-provider-key" placeholder="Enter API key">
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel" id="cancel-add-provider">Cancel</button>
            <button class="modal-btn primary" id="confirm-add-provider">Add Provider</button>
          </div>
        </div>
      </div>

      <!-- Add Model Modal -->
      <div class="modal-overlay" id="add-model-modal" style="display: none;">
        <div class="modal">
          <h3>Add Custom Model</h3>
          <div class="form-group">
            <label class="form-label">Model ID</label>
            <input type="text" class="form-input" id="new-model-id" placeholder="e.g., gpt-4o or claude-3-sonnet">
          </div>
          <div class="form-group">
            <label class="form-label">Display Name</label>
            <input type="text" class="form-input" id="new-model-name" placeholder="e.g., GPT-4o">
          </div>
          <div class="form-group">
            <label class="form-label">Context Length</label>
            <input type="number" class="form-input" id="new-model-context" value="8192" min="1000" max="2000000">
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel" id="cancel-add-model">Cancel</button>
            <button class="modal-btn primary" id="confirm-add-model">Add Model</button>
          </div>
        </div>
      </div>

      <!-- Agent Preset Editor Modal (Web Component) -->
      <agent-preset-editor-modal id="preset-editor-modal"></agent-preset-editor-modal>
    `;

    this.setupEventHandlers();
  }

  private formatApiFormat(format: ApiFormat): string {
    switch (format) {
      case 'openai': return 'OpenAI Format';
      case 'anthropic': return 'Anthropic Format';
      case 'ollama': return 'Ollama Format';
      default: return format;
    }
  }

  private renderPresetsByCategory(): string {
    // Group presets by category
    const grouped = new Map<string, AgentPreset[]>();
    
    for (const category of presetCategories) {
      grouped.set(category.id, []);
    }
    
    for (const preset of this.presets) {
      const categoryPresets = grouped.get(preset.category);
      if (categoryPresets) {
        categoryPresets.push(preset);
      } else {
        // If preset has unknown category, add to 'custom'
        const customPresets = grouped.get('custom') || [];
        customPresets.push(preset);
        grouped.set('custom', customPresets);
      }
    }

    // Auto-expand first category with presets if none expanded
    if (this.expandedAgentCategories.size === 0) {
      for (const [categoryId, categoryPresets] of grouped) {
        if (categoryPresets.length > 0) {
          this.expandedAgentCategories.add(categoryId);
          break;
        }
      }
    }

    return presetCategories
      .map(category => {
        const categoryPresets = grouped.get(category.id) || [];
        if (categoryPresets.length === 0) return '';
        
        const isExpanded = this.expandedAgentCategories.has(category.id);
        const isCategoryHidden = this.settings!.hiddenCategories.includes(category.id);
        
        return `
          <div class="preset-category-section" data-category="${category.id}">
            <div class="preset-category-header ${isExpanded ? 'expanded' : ''}" data-category="${category.id}">
              <div class="preset-category-title">
                <span>${category.icon}</span>
                <span>${category.name}</span>
                <span class="preset-category-count">${categoryPresets.length}</span>
              </div>
              <svg class="preset-category-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </div>
            <div class="preset-category-content ${isExpanded ? 'expanded' : ''}">
              ${categoryPresets.map(preset => {
                const isHidden = this.settings!.hiddenPresets.includes(preset.id) || isCategoryHidden;
                return `
                  <div class="preset-item ${isHidden ? 'hidden' : ''}" data-preset-id="${preset.id}">
                    <div class="preset-item-info">
                      <div class="preset-item-name">${this.escapeHtml(preset.name)}</div>
                      <div class="preset-item-description">${this.escapeHtml(preset.description)}</div>
                    </div>
                    ${preset.isBuiltIn 
                      ? '<span class="preset-item-badge">Built-in</span>' 
                      : '<span class="preset-item-badge custom">Custom</span>'
                    }
                    <div class="preset-item-actions">
                      <label class="mini-toggle" title="${isHidden ? 'Show preset' : 'Hide preset'}">
                        <input type="checkbox" class="preset-visibility-toggle" data-preset="${preset.id}" ${!isHidden && !isCategoryHidden ? 'checked' : ''} ${isCategoryHidden ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                      </label>
                      ${preset.isBuiltIn ? `
                        <button class="preset-action-btn clone" data-preset="${preset.id}" title="Clone as custom preset">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                          Clone
                        </button>
                      ` : `
                        <button class="preset-action-btn edit" data-preset="${preset.id}" title="Edit preset">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          Edit
                        </button>
                        <button class="preset-action-btn delete" data-preset="${preset.id}" title="Delete preset">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      `}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private getApiKeyHint(format: ApiFormat): string {
    switch (format) {
      case 'openai': return 'Required for most OpenAI-compatible APIs';
      case 'anthropic': return 'Get your API key from console.anthropic.com';
      case 'ollama': return 'Ollama runs locally. Make sure OLLAMA_ORIGINS=* is set.';
      default: return '';
    }
  }

  private currentAddModelProviderId: string | null = null;

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

    // Add Provider button
    this.shadowRoot?.getElementById('add-provider-btn')?.addEventListener('click', () => {
      this.showAddProviderModal();
    });

    // Add Provider modal handlers
    this.shadowRoot?.getElementById('cancel-add-provider')?.addEventListener('click', () => {
      this.hideAddProviderModal();
    });

    this.shadowRoot?.getElementById('confirm-add-provider')?.addEventListener('click', async () => {
      await this.handleAddProvider();
    });

    // Add Model modal handlers
    this.shadowRoot?.getElementById('cancel-add-model')?.addEventListener('click', () => {
      this.hideAddModelModal();
    });

    this.shadowRoot?.getElementById('confirm-add-model')?.addEventListener('click', async () => {
      await this.handleAddModel();
    });

    // Delete provider buttons
    this.shadowRoot?.querySelectorAll('.delete-provider-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const providerId = (e.currentTarget as HTMLButtonElement).dataset.provider;
        if (providerId && confirm('Are you sure you want to delete this provider?')) {
          await llmRouter.deleteProvider(providerId);
          await this.loadData();
          this.render();
        }
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

    // Auto-fetch toggle
    this.shadowRoot?.querySelectorAll('.auto-fetch-toggle').forEach(input => {
      input.addEventListener('change', async (e) => {
        const providerId = (e.target as HTMLInputElement).dataset.provider;
        const autoFetchModels = (e.target as HTMLInputElement).checked;
        if (providerId) {
          await providerStorage.update(providerId, { autoFetchModels });
          await llmRouter.syncProviderModels(providerId);
        }
      });
    });

    // Add model buttons
    this.shadowRoot?.querySelectorAll('.add-model-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const providerId = (e.target as HTMLButtonElement).dataset.provider;
        if (providerId) {
          this.showAddModelModal(providerId);
        }
      });
    });

    // Remove model buttons
    this.shadowRoot?.querySelectorAll('.remove-model').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const button = e.target as HTMLButtonElement;
        const providerId = button.dataset.provider;
        const modelId = button.dataset.model;
        if (providerId && modelId) {
          await providerStorage.removeModel(providerId, modelId);
          await llmRouter.syncProviderModels(providerId);
          await this.loadData();
          this.render();
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

    this.shadowRoot?.getElementById('keyboard-shortcuts')?.addEventListener('change', async (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.settings = await settingsStorage.update({ showKeyboardShortcuts: checked });
      eventBus.emit('settings:updated', this.settings!);
    });

    // Language checkboxes
    this.shadowRoot?.querySelectorAll('.language-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const input = e.target as HTMLInputElement;
        const langCode = input.dataset.langCode;
        if (langCode === undefined) return; // Skip if no code (shouldn't happen)
        
        // Don't allow unchecking English (empty code)
        if (langCode === '' && !input.checked) {
          input.checked = true;
          return;
        }

        const currentEnabled = new Set(this.settings?.enabledLanguages || ['']);
        
        if (input.checked) {
          currentEnabled.add(langCode);
        } else {
          currentEnabled.delete(langCode);
        }

        // Always ensure English is included
        currentEnabled.add('');
        
        this.settings = await settingsStorage.update({ 
          enabledLanguages: Array.from(currentEnabled) 
        });
        
        // Update UI to reflect state
        const labelEl = input.closest('.language-item');
        if (labelEl) {
          labelEl.classList.toggle('enabled', input.checked);
        }
        
        eventBus.emit('settings:updated', this.settings!);
      });
    });

    // Close modals when clicking overlay
    this.shadowRoot?.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.hideAddProviderModal();
          this.hideAddModelModal();
        }
      });
    });

    // === Agent Presets Event Handlers ===

    // Category visibility toggles
    this.shadowRoot?.querySelectorAll('.category-visibility-toggle').forEach(input => {
      input.addEventListener('change', async (e) => {
        const checkbox = e.target as HTMLInputElement;
        const categoryId = checkbox.dataset.category;
        if (!categoryId || !this.settings) return;

        const currentHidden = new Set(this.settings.hiddenCategories);
        
        if (checkbox.checked) {
          currentHidden.delete(categoryId);
        } else {
          currentHidden.add(categoryId);
        }

        this.settings = await settingsStorage.update({
          hiddenCategories: Array.from(currentHidden)
        });

        // Update UI
        const toggleContainer = checkbox.closest('.category-toggle');
        if (toggleContainer) {
          toggleContainer.classList.toggle('hidden', !checkbox.checked);
        }

        // Re-render preset list to update visibility states
        const presetListEl = this.shadowRoot?.querySelector('.preset-list');
        if (presetListEl) {
          presetListEl.innerHTML = this.renderPresetsByCategory();
          this.setupPresetListHandlers();
        }

        eventBus.emit('settings:updated', this.settings!);
      });
    });

    // Preset category expand/collapse
    this.setupPresetListHandlers();

    // Create preset button
    this.shadowRoot?.getElementById('create-preset-btn')?.addEventListener('click', () => {
      this.openPresetEditor('create');
    });

    // Listen for preset editor events
    const presetEditorModal = this.shadowRoot?.getElementById('preset-editor-modal') as AgentPresetEditorModal;
    presetEditorModal?.addEventListener('preset:saved', async () => {
      await this.loadData();
      this.render();
    });
  }

  private setupPresetListHandlers() {
    // Preset category expand/collapse
    this.shadowRoot?.querySelectorAll('.preset-category-header').forEach(header => {
      header.addEventListener('click', () => {
        const categoryId = header.getAttribute('data-category');
        if (!categoryId) return;

        const content = header.nextElementSibling;
        const isExpanded = header.classList.contains('expanded');

        if (isExpanded) {
          this.expandedAgentCategories.delete(categoryId);
          header.classList.remove('expanded');
          content?.classList.remove('expanded');
        } else {
          this.expandedAgentCategories.add(categoryId);
          header.classList.add('expanded');
          content?.classList.add('expanded');
        }
      });
    });

    // Preset visibility toggles
    this.shadowRoot?.querySelectorAll('.preset-visibility-toggle').forEach(input => {
      input.addEventListener('change', async (e) => {
        const checkbox = e.target as HTMLInputElement;
        const presetId = checkbox.dataset.preset;
        if (!presetId || !this.settings) return;

        const currentHidden = new Set(this.settings.hiddenPresets);
        
        if (checkbox.checked) {
          currentHidden.delete(presetId);
        } else {
          currentHidden.add(presetId);
        }

        this.settings = await settingsStorage.update({
          hiddenPresets: Array.from(currentHidden)
        });

        // Update UI
        const presetItem = checkbox.closest('.preset-item');
        if (presetItem) {
          presetItem.classList.toggle('hidden', !checkbox.checked);
        }

        eventBus.emit('settings:updated', this.settings!);
      });
    });

    // Clone preset buttons
    this.shadowRoot?.querySelectorAll('.preset-action-btn.clone').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const presetId = (btn as HTMLButtonElement).dataset.preset;
        if (presetId) {
          this.openPresetEditor('clone', presetId);
        }
      });
    });

    // Edit preset buttons
    this.shadowRoot?.querySelectorAll('.preset-action-btn.edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const presetId = (btn as HTMLButtonElement).dataset.preset;
        if (presetId) {
          this.openPresetEditor('edit', presetId);
        }
      });
    });

    // Delete preset buttons
    this.shadowRoot?.querySelectorAll('.preset-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const presetId = (btn as HTMLButtonElement).dataset.preset;
        if (presetId && confirm('Are you sure you want to delete this custom preset?')) {
          const deleted = await presetStorage.delete(presetId);
          if (deleted) {
            await this.loadData();
            this.render();
          }
        }
      });
    });
  }

  private async openPresetEditor(mode: 'create' | 'edit' | 'clone', presetId?: string) {
    const modal = this.shadowRoot?.getElementById('preset-editor-modal') as AgentPresetEditorModal;
    if (!modal) return;

    let preset: AgentPreset | undefined;
    if (presetId) {
      preset = await presetStorage.getById(presetId);
    }

    modal.configure({ mode, preset });
    modal.setAttribute('open', 'true');
  }

  private showAddProviderModal() {
    const modal = this.shadowRoot?.getElementById('add-provider-modal');
    if (modal) {
      modal.style.display = 'flex';
      // Set default URL based on format
      this.updateDefaultUrl();
    }

    // Listen for format changes
    const formatSelect = this.shadowRoot?.getElementById('new-provider-format') as HTMLSelectElement;
    formatSelect?.addEventListener('change', () => this.updateDefaultUrl());
  }

  private updateDefaultUrl() {
    const formatSelect = this.shadowRoot?.getElementById('new-provider-format') as HTMLSelectElement;
    const urlInput = this.shadowRoot?.getElementById('new-provider-url') as HTMLInputElement;
    
    if (formatSelect && urlInput && !urlInput.value) {
      switch (formatSelect.value) {
        case 'openai':
          urlInput.placeholder = 'https://api.openai.com/v1';
          break;
        case 'anthropic':
          urlInput.placeholder = 'https://api.anthropic.com';
          break;
        case 'ollama':
          urlInput.placeholder = 'http://localhost:11434';
          break;
      }
    }
  }

  private hideAddProviderModal() {
    const modal = this.shadowRoot?.getElementById('add-provider-modal');
    if (modal) {
      modal.style.display = 'none';
      // Clear inputs
      (this.shadowRoot?.getElementById('new-provider-name') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-provider-url') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-provider-key') as HTMLInputElement).value = '';
    }
  }

  private async handleAddProvider() {
    const name = (this.shadowRoot?.getElementById('new-provider-name') as HTMLInputElement).value.trim();
    const apiFormat = (this.shadowRoot?.getElementById('new-provider-format') as HTMLSelectElement).value as ApiFormat;
    const baseUrl = (this.shadowRoot?.getElementById('new-provider-url') as HTMLInputElement).value.trim();
    const apiKey = (this.shadowRoot?.getElementById('new-provider-key') as HTMLInputElement).value.trim();

    if (!name) {
      alert('Please enter a provider name');
      return;
    }

    if (!baseUrl) {
      alert('Please enter a base URL');
      return;
    }

    await llmRouter.createNewProvider(name, apiFormat, baseUrl, apiKey || undefined);
    this.hideAddProviderModal();
    await this.loadData();
    this.render();
  }

  private showAddModelModal(providerId: string) {
    this.currentAddModelProviderId = providerId;
    const modal = this.shadowRoot?.getElementById('add-model-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  private hideAddModelModal() {
    this.currentAddModelProviderId = null;
    const modal = this.shadowRoot?.getElementById('add-model-modal');
    if (modal) {
      modal.style.display = 'none';
      // Clear inputs
      (this.shadowRoot?.getElementById('new-model-id') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-model-name') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-model-context') as HTMLInputElement).value = '8192';
    }
  }

  private async handleAddModel() {
    if (!this.currentAddModelProviderId) return;

    const modelId = (this.shadowRoot?.getElementById('new-model-id') as HTMLInputElement).value.trim();
    const modelName = (this.shadowRoot?.getElementById('new-model-name') as HTMLInputElement).value.trim();
    const contextLength = parseInt((this.shadowRoot?.getElementById('new-model-context') as HTMLInputElement).value);

    if (!modelId) {
      alert('Please enter a model ID');
      return;
    }

    if (!modelName) {
      alert('Please enter a display name');
      return;
    }

    await providerStorage.addModel(this.currentAddModelProviderId, {
      id: modelId,
      name: modelName,
      contextLength: contextLength || 8192,
    });

    await llmRouter.syncProviderModels(this.currentAddModelProviderId);
    this.hideAddModelModal();
    await this.loadData();
    this.render();
  }
}

customElements.define('settings-panel', SettingsPanel);

