// ============================================
// AI Brainstorm - Settings Panel Component
// ============================================

import { settingsStorage, providerStorage, presetStorage, mcpServerStorage } from '../storage/storage-manager';
import { presetCategories } from '../agents/presets';
import { llmRouter } from '../llm/llm-router';
import { mcpRouter } from '../mcp';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { ALL_LANGUAGES } from '../utils/languages';
import { downloadPresets, importPresets, downloadSelectedPresets, downloadMCPServers, importMCPServers, normalizeMCPServerImport } from '../utils/export';
import { readFileContent } from '../utils/helpers';
import type { AppSettings, LLMProvider, ApiFormat, AgentPreset, MCPServer, MCPTransport, MCPImportConflictStrategy } from '../types';
import './agent-preset-editor-modal';
import type { AgentPresetEditorModal } from './agent-preset-editor-modal';

type SettingsTab = 'general' | 'providers' | 'mcp' | 'presets' | 'languages';

export class SettingsPanel extends HTMLElement {
  private settings: AppSettings | null = null;
  private providers: LLMProvider[] = [];
  private presets: AgentPreset[] = [];
  private mcpServers: MCPServer[] = [];
  private expandedAgentCategories: Set<string> = new Set();
  private activeTab: SettingsTab = 'general';
  private selectedPresetIds: Set<string> = new Set();
  private selectedProviderId: string | null = null;
  private selectedMcpServerId: string | null = null;
  private connectingServerId: string | null = null;
  private languageFilter: string = '';

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
    this.mcpServers = await mcpServerStorage.getAll();
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

        .tab-bar {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          padding: 0 var(--space-6);
          flex-shrink: 0;
        }

        .tab {
          display: flex;
          align-items: center;
          gap: var(--space-2);
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

        .tab svg {
          width: 16px;
          height: 16px;
          opacity: 0.7;
        }

        .tab.active svg {
          opacity: 1;
        }

        .tab-content-header {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          margin-bottom: var(--space-4);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--color-border);
        }

        .settings-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: var(--space-6);
          width: 100%;
          min-height: 0;
        }

        /* Full-width section layout */
        .section {
          margin-bottom: var(--space-6);
          padding-bottom: var(--space-6);
          border-bottom: 1px solid var(--color-border);
        }

        .section:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }

        .section-title {
          font-size: var(--text-base);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          margin-bottom: var(--space-4);
          display: flex;
          align-items: center;
          gap: var(--space-2);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .section-title svg {
          color: var(--color-primary);
          width: 18px;
          height: 18px;
        }

        /* Split View for Providers */
        .split-view {
          display: flex;
          gap: var(--space-4);
          height: 100%;
          min-height: 400px;
        }

        .split-sidebar {
          width: 240px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .split-sidebar-header {
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
          font-weight: var(--font-semibold);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .split-sidebar-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-2);
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-bottom: var(--space-1);
        }

        .sidebar-item:hover {
          background: var(--color-bg-tertiary);
        }

        .sidebar-item.active {
          background: var(--color-primary-dim);
        }

        .sidebar-item-icon {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-error);
          flex-shrink: 0;
        }

        .sidebar-item-icon.connected {
          background: var(--color-success);
        }

        .sidebar-item-name {
          flex: 1;
          min-width: 0;
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-item-format {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .split-sidebar-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--color-border);
        }

        .split-details {
          flex: 1;
          min-width: 0;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-5);
          overflow-y: auto;
        }

        .split-details-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-tertiary);
          text-align: center;
        }

        .split-details-empty svg {
          width: 48px;
          height: 48px;
          margin-bottom: var(--space-3);
          opacity: 0.5;
        }

        .details-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-5);
          padding-bottom: var(--space-4);
          border-bottom: 1px solid var(--color-border);
        }

        .details-title {
          font-size: var(--text-xl);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
        }

        .details-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-full);
          font-size: var(--text-sm);
        }

        .details-actions {
          display: flex;
          gap: var(--space-3);
          margin-top: var(--space-5);
          padding-top: var(--space-4);
          border-top: 1px solid var(--color-border);
        }

        /* 2-column toggle grid */
        .toggle-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-3);
        }

        @media (max-width: 600px) {
          .toggle-grid {
            grid-template-columns: 1fr;
          }
        }

        .toggle-grid .toggle-group {
          margin-bottom: 0;
        }

        /* Inline form row */
        .inline-form-row {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .inline-form-group {
          flex: 1;
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .inline-form-group .form-label {
          margin-bottom: 0;
          white-space: nowrap;
          min-width: 120px;
        }

        .inline-form-group .form-input {
          width: auto;
          flex: 1;
          max-width: 150px;
        }

        .inline-form-group .form-hint {
          margin-top: 0;
          margin-left: var(--space-2);
        }

        /* Theme cards - larger */
        .theme-cards {
          display: flex;
          gap: var(--space-4);
          justify-content: center;
          margin-bottom: var(--space-2);
        }

        .theme-card {
          width: 160px;
          padding: var(--space-4);
          background: var(--color-surface);
          border: 2px solid var(--color-border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          text-align: center;
          transition: all var(--transition-fast);
        }

        .theme-card:hover {
          border-color: var(--color-border-strong);
          transform: translateY(-2px);
        }

        .theme-card.selected {
          border-color: var(--color-primary);
          background: var(--color-primary-dim);
        }

        .theme-card-preview {
          width: 100%;
          height: 80px;
          border-radius: var(--radius-md);
          margin-bottom: var(--space-3);
          position: relative;
          overflow: hidden;
        }

        .theme-card-preview.dark {
          background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #2d1b4e 100%);
        }

        .theme-card-preview.light {
          background: linear-gradient(135deg, #ffffff 0%, #f0f0f5 50%, #e8e8f0 100%);
        }

        .theme-card-preview::after {
          content: '';
          position: absolute;
          bottom: 8px;
          left: 8px;
          right: 8px;
          height: 8px;
          background: currentColor;
          opacity: 0.2;
          border-radius: 4px;
        }

        .theme-card-label {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
        }

        /* Language filter */
        .language-filter {
          margin-bottom: var(--space-4);
        }

        .language-filter-input {
          width: 100%;
          padding: var(--space-3);
          padding-left: var(--space-10);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-primary);
          font-size: var(--text-sm);
        }

        .language-filter-wrapper {
          position: relative;
        }

        .language-filter-wrapper svg {
          position: absolute;
          left: var(--space-3);
          top: 50%;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          color: var(--color-text-tertiary);
        }

        /* Improved language grid */
        .language-grid-improved {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: var(--space-3);
        }

        .language-card {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .language-card:hover {
          border-color: var(--color-primary);
          background: var(--color-surface-hover);
        }

        .language-card.enabled {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .language-card.locked {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .language-card-checkbox {
          width: 18px;
          height: 18px;
          accent-color: var(--color-primary);
        }

        .language-card-info {
          flex: 1;
        }

        .language-card-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
        }

        .language-card-native {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .language-card-badge {
          font-size: var(--text-xs);
          padding: 2px 8px;
          background: var(--color-bg-tertiary);
          border-radius: var(--radius-full);
          color: var(--color-text-tertiary);
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
          box-shadow: 0 0 4px var(--color-success);
        }

        .status-dot.connecting {
          background: var(--color-warning);
          box-shadow: 0 0 4px var(--color-warning);
          animation: status-pulse 1.5s infinite;
        }

        @keyframes status-pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
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

        /* MCP Tools List */
        .mcp-tools-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          max-height: 400px;
          overflow-y: auto;
          padding: var(--space-2);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .mcp-tool-item {
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: border-color 0.15s ease;
        }

        .mcp-tool-item:hover {
          border-color: var(--color-accent);
        }

        .mcp-tool-item[data-expanded="true"] {
          border-color: var(--color-accent);
          background: var(--color-surface);
        }

        .mcp-tool-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }

        .mcp-tool-name {
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          font-family: var(--font-mono, monospace);
        }

        .mcp-tool-toggle {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          transition: transform 0.15s ease;
        }

        .mcp-tool-item[data-expanded="true"] .mcp-tool-toggle {
          transform: rotate(90deg);
        }

        .mcp-tool-description {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-top: var(--space-1);
          line-height: 1.4;
        }

        .mcp-tool-params {
          display: none;
          margin-top: var(--space-3);
          padding-top: var(--space-3);
          border-top: 1px solid var(--color-border);
        }

        .mcp-tool-item[data-expanded="true"] .mcp-tool-params {
          display: block;
        }

        .mcp-tool-params-title {
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .mcp-param-item {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
          padding: var(--space-2);
          background: var(--color-bg-primary);
          border-radius: var(--radius-sm);
          margin-bottom: var(--space-1);
        }

        .mcp-param-name {
          font-family: var(--font-mono, monospace);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-accent);
          min-width: 100px;
        }

        .mcp-param-type {
          font-family: var(--font-mono, monospace);
          font-size: var(--text-xs);
          color: var(--color-warning);
          background: rgba(245, 158, 11, 0.1);
          padding: 1px 6px;
          border-radius: var(--radius-sm);
        }

        .mcp-param-required {
          font-size: 10px;
          font-weight: var(--font-medium);
          color: var(--color-error);
          background: rgba(239, 68, 68, 0.1);
          padding: 1px 6px;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
        }

        .mcp-param-optional {
          font-size: 10px;
          font-weight: var(--font-medium);
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          padding: 1px 6px;
          border-radius: var(--radius-sm);
        }

        .mcp-param-desc {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          flex: 1;
        }

        .mcp-no-params {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          font-style: italic;
        }

        .btn-small {
          padding: var(--space-1) var(--space-2);
          font-size: var(--text-xs);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .btn-small:hover {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
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
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
        }

        .category-grid .category-toggle {
          flex: 0 0 auto;
          min-width: 140px;
          max-width: 200px;
        }

        .category-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
          box-sizing: border-box;
          min-width: 0; /* critical for grid/flex overflow */
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
          flex: 1;
          min-width: 0; /* allow text to wrap instead of pushing the toggle */
        }

        .category-icon {
          font-size: var(--text-base);
          width: 18px;
          text-align: center;
          flex-shrink: 0;
        }

        .category-name {
          min-width: 0;
          /* Wrap on spaces/punctuation; only break long unbroken tokens if needed */
          overflow-wrap: break-word;
          word-break: normal;
          hyphens: auto;
          line-height: 1.2;
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

        .preset-actions-row {
          display: flex;
          gap: var(--space-3);
          margin-top: var(--space-3);
        }

        .preset-actions-row .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .preset-actions-row .action-btn:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
        }

        .preset-actions-row .action-btn svg {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .preset-actions-row .action-btn.export:hover {
          border-color: var(--color-success);
          color: var(--color-success);
        }

        .preset-actions-row .action-btn.import:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .import-file-input {
          display: none;
        }

        .import-result {
          margin-top: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          display: none;
        }

        .import-result.success {
          display: block;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid var(--color-success);
          color: var(--color-success);
        }

        .import-result.error {
          display: block;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid var(--color-error);
          color: var(--color-error);
        }

        /* Preset selection styles */
        .preset-item.selected {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
        }

        .preset-select-checkbox {
          width: 16px;
          height: 16px;
          accent-color: var(--color-primary);
          cursor: pointer;
          flex-shrink: 0;
        }

        .preset-action-btn.export-single {
          padding: var(--space-1);
        }

        .preset-action-btn.export-single:hover {
          border-color: var(--color-success);
          color: var(--color-success);
        }

        /* Batch controls */
        .batch-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          margin-bottom: var(--space-3);
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .batch-controls-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .select-all-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text-secondary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .select-all-btn:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .selection-count {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .export-selected-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--color-success);
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid var(--color-success);
          border-radius: var(--radius-md);
          color: var(--color-success);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .export-selected-btn:hover {
          background: var(--color-success);
          color: white;
        }

        .export-selected-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .export-selected-btn:disabled:hover {
          background: rgba(34, 197, 94, 0.1);
          color: var(--color-success);
        }

        .export-selected-btn svg {
          width: 14px;
          height: 14px;
        }

        .selection-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          background: var(--color-success);
          border-radius: var(--radius-full);
          color: white;
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
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

      <div class="tab-bar">
        <button class="tab ${this.activeTab === 'general' ? 'active' : ''}" data-tab="general">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          General
        </button>
        <button class="tab ${this.activeTab === 'providers' ? 'active' : ''}" data-tab="providers">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
            <line x1="6" y1="6" x2="6.01" y2="6"/>
            <line x1="6" y1="18" x2="6.01" y2="18"/>
          </svg>
          Providers
        </button>
        <button class="tab ${this.activeTab === 'mcp' ? 'active' : ''}" data-tab="mcp">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          MCP Servers
        </button>
        <button class="tab ${this.activeTab === 'presets' ? 'active' : ''}" data-tab="presets">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Agent Presets
        </button>
        <button class="tab ${this.activeTab === 'languages' ? 'active' : ''}" data-tab="languages">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Languages
        </button>
      </div>

      <div class="settings-content">
        ${this.renderActiveTabContent()}
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

      <!-- Add MCP Server Modal -->
      <div class="modal-overlay" id="add-mcp-server-modal" style="display: none;">
        <div class="modal">
          <h3>Add MCP Server</h3>
          <div class="form-group">
            <label class="form-label">Server Name</label>
            <input type="text" class="form-input" id="new-mcp-name" placeholder="e.g., My MCP Server">
          </div>
          <div class="form-group">
            <label class="form-label">Transport Type</label>
            <select class="form-select" id="new-mcp-transport">
              <option value="streamable-http">Streamable HTTP (Recommended)</option>
              <option value="http">HTTP/SSE</option>
              <option value="stdio">Stdio (Local Process)</option>
            </select>
          </div>
          <div class="form-group" id="mcp-endpoint-group">
            <label class="form-label">Endpoint URL</label>
            <input type="text" class="form-input" id="new-mcp-endpoint" placeholder="http://localhost:3000/mcp">
            <div class="form-hint">The HTTP endpoint for the MCP server</div>
          </div>
          <div class="form-group" id="mcp-auth-token-group">
            <label class="form-label">Auth Token (Optional)</label>
            <input type="password" class="form-input" id="new-mcp-auth-token" placeholder="Bearer token for authentication">
            <div class="form-hint">Authorization token sent with HTTP requests (or use Headers below)</div>
          </div>
          <div class="form-group" id="mcp-headers-group">
            <label class="form-label">Custom Headers (Optional)</label>
            <textarea class="form-input" id="new-mcp-headers" rows="3" placeholder='{"Authorization": "Bearer token", "X-Custom": "value"}'></textarea>
            <div class="form-hint">JSON object of custom headers to send with requests</div>
          </div>
          <div class="form-group" id="mcp-proxy-group">
            <label class="checkbox-label">
              <input type="checkbox" id="new-mcp-use-proxy" checked>
              <span>Use Dev Proxy (bypass CORS)</span>
            </label>
            <div class="form-hint">Routes requests through localhost to avoid CORS issues during development</div>
          </div>
          <div class="form-group" id="mcp-command-group" style="display: none;">
            <label class="form-label">Command</label>
            <input type="text" class="form-input" id="new-mcp-command" placeholder="npx -y @mcp/server">
            <div class="form-hint">The command to start the MCP server</div>
          </div>
          <div class="form-group" id="mcp-args-group" style="display: none;">
            <label class="form-label">Arguments (comma-separated)</label>
            <input type="text" class="form-input" id="new-mcp-args" placeholder="--port, 3000">
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel" id="cancel-add-mcp">Cancel</button>
            <button class="modal-btn primary" id="confirm-add-mcp">Add Server</button>
          </div>
        </div>
      </div>

      <!-- MCP Import Conflict Modal -->
      <div class="modal-overlay" id="mcp-import-conflict-modal" style="display: none;">
        <div class="modal">
          <h3>Import MCP Servers</h3>
          <div id="mcp-import-conflict-message" style="margin-bottom: var(--space-4); color: var(--color-text-secondary);">
            <!-- Dynamic content will be inserted here -->
          </div>
          <div class="form-group">
            <label class="form-label">Handle Name Conflicts</label>
            <div style="display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2);">
              <label class="radio-option" style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
                <input type="radio" name="mcp-conflict-strategy" value="skip" checked style="accent-color: var(--color-accent);">
                <span><strong>Skip</strong> - Don't import servers with duplicate names</span>
              </label>
              <label class="radio-option" style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
                <input type="radio" name="mcp-conflict-strategy" value="rename" style="accent-color: var(--color-accent);">
                <span><strong>Rename</strong> - Add number suffix to duplicate names</span>
              </label>
              <label class="radio-option" style="display: flex; align-items: center; gap: var(--space-2); cursor: pointer;">
                <input type="radio" name="mcp-conflict-strategy" value="replace" style="accent-color: var(--color-accent);">
                <span><strong>Replace</strong> - Overwrite existing servers with same name</span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel" id="cancel-mcp-import">Cancel</button>
            <button class="modal-btn primary" id="confirm-mcp-import">Import</button>
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
                const isSelected = this.selectedPresetIds.has(preset.id);
                return `
                  <div class="preset-item ${isHidden ? 'hidden' : ''} ${isSelected ? 'selected' : ''}" data-preset-id="${preset.id}">
                    ${!preset.isBuiltIn ? `
                      <input type="checkbox" class="preset-select-checkbox" data-preset="${preset.id}" ${isSelected ? 'checked' : ''} title="Select for export">
                    ` : ''}
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
                        <button class="preset-action-btn export-single" data-preset="${preset.id}" title="Export this preset">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </button>
                        <button class="preset-action-btn edit" data-preset="${preset.id}" title="Edit preset">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
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

  private getCustomPresetsCount(): number {
    return this.presets.filter(p => !p.isBuiltIn).length;
  }

  private getCustomPresetIds(): string[] {
    return this.presets.filter(p => !p.isBuiltIn).map(p => p.id);
  }

  private getApiKeyHint(format: ApiFormat): string {
    switch (format) {
      case 'openai': return 'Required for most OpenAI-compatible APIs';
      case 'anthropic': return 'Get your API key from console.anthropic.com';
      case 'ollama': return 'Ollama runs locally. Make sure OLLAMA_ORIGINS=* is set.';
      default: return '';
    }
  }

  private renderGeneralTab(): string {
    if (!this.settings) return '';
    return `
      <!-- Theme Section - Prominent at top -->
      <div class="section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
        <div class="theme-cards">
          <div class="theme-card ${this.settings.theme === 'dark' ? 'selected' : ''}" data-theme="dark">
            <div class="theme-card-preview dark"></div>
            <div class="theme-card-label">Dark Mode</div>
          </div>
          <div class="theme-card ${this.settings.theme === 'light' ? 'selected' : ''}" data-theme="light">
            <div class="theme-card-preview light"></div>
            <div class="theme-card-label">Light Mode</div>
          </div>
        </div>
      </div>

      <!-- Behavior Section - 2-column toggles -->
      <div class="section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Behavior
        </div>
        <div class="toggle-grid">
          <div class="toggle-group">
            <span class="toggle-label">Plain text only</span>
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
            <span class="toggle-label">Keyboard shortcuts</span>
            <label class="toggle-switch">
              <input type="checkbox" id="keyboard-shortcuts" ${this.settings.showKeyboardShortcuts ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- Conversation Defaults Section - Inline inputs -->
      <div class="section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          Conversation Defaults
        </div>
        <div class="inline-form-row">
          <div class="inline-form-group">
            <label class="form-label">Turn Delay</label>
            <input type="number" class="form-input" id="default-speed" value="${this.settings.defaultSpeedMs}" min="0" max="10000" step="500">
            <span class="form-hint">ms</span>
          </div>
          <div class="inline-form-group">
            <label class="form-label">Max Tokens</label>
            <input type="number" class="form-input" id="default-tokens" value="${this.settings.defaultMaxContextTokens}" min="1000" max="128000" step="1000">
          </div>
        </div>
      </div>

      <div class="version-info">
        AI Brainstorm v3.0.0
      </div>
    `;
  }

  private renderProvidersTab(): string {
    // Auto-select first provider if none selected
    if (!this.selectedProviderId && this.providers.length > 0) {
      this.selectedProviderId = this.providers[0].id;
    }
    
    const selectedProvider = this.providers.find(p => p.id === this.selectedProviderId);
    
    return `
      <div class="split-view">
        <!-- Sidebar with provider list -->
        <div class="split-sidebar">
          <div class="split-sidebar-header">Providers</div>
          <div class="split-sidebar-list">
            ${this.providers.map(provider => `
              <div class="sidebar-item ${provider.id === this.selectedProviderId ? 'active' : ''}" 
                   data-provider-id="${provider.id}">
                <span class="sidebar-item-icon ${provider.isActive ? 'connected' : ''}"></span>
                <span class="sidebar-item-name">${provider.name}</span>
                <span class="sidebar-item-format">${provider.apiFormat}</span>
              </div>
            `).join('')}
          </div>
          <div class="split-sidebar-footer">
            <button class="add-provider-btn" id="add-provider-btn" style="margin-bottom: 0;">+ Add Provider</button>
          </div>
        </div>

        <!-- Details panel -->
        <div class="split-details">
          ${selectedProvider ? this.renderProviderDetails(selectedProvider) : `
            <div class="split-details-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/>
                <line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
              <p>Select a provider or add a new one</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  private renderProviderDetails(provider: LLMProvider): string {
    return `
      <div class="details-header">
        <div>
          <div class="details-title">${provider.name}</div>
          <div style="font-size: var(--text-sm); color: var(--color-text-tertiary); margin-top: var(--space-1);">
            ${this.formatApiFormat(provider.apiFormat)}
          </div>
        </div>
        <div class="details-status">
          <span class="status-dot ${provider.isActive ? 'connected' : ''}"></span>
          <span>${provider.isActive ? 'Connected' : 'Not configured'}</span>
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
        <div class="form-hint">${this.getApiKeyHint(provider.apiFormat)}</div>
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

      <div class="toggle-group" style="margin-top: var(--space-3);">
        <span class="toggle-label">Auto-fetch models from API</span>
        <label class="toggle-switch">
          <input type="checkbox" class="auto-fetch-toggle" data-provider="${provider.id}" ${provider.autoFetchModels ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Models Section -->
      <div class="models-section" style="margin-top: var(--space-4);">
        <div class="models-header">
          <span class="models-title">Available Models</span>
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

      <div class="details-actions">
        <button class="test-btn" data-provider="${provider.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: var(--space-2);">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Test Connection
        </button>
        <button class="delete-provider-btn" data-provider="${provider.id}" style="margin-left: auto;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: var(--space-2);">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete Provider
        </button>
      </div>
    `;
  }

  private renderMCPTab(): string {
    // Auto-select first server if none selected
    if (!this.selectedMcpServerId && this.mcpServers.length > 0) {
      this.selectedMcpServerId = this.mcpServers[0].id;
    }
    
    const selectedServer = this.mcpServers.find(s => s.id === this.selectedMcpServerId);
    
    return `
      <div class="split-view">
        <!-- Sidebar with MCP server list -->
        <div class="split-sidebar">
          <div class="split-sidebar-header">MCP Servers</div>
          <div class="split-sidebar-list">
            ${this.mcpServers.map(server => `
              <div class="sidebar-item ${server.id === this.selectedMcpServerId ? 'active' : ''}" 
                   data-mcp-server-id="${server.id}">
                <span class="sidebar-item-icon ${server.isActive ? 'connected' : ''}"></span>
                <span class="sidebar-item-name">${server.name}</span>
                <span class="sidebar-item-format">${server.transport}</span>
              </div>
            `).join('')}
          </div>
          <div class="split-sidebar-footer">
            <button class="add-provider-btn" id="add-mcp-server-btn" style="margin-bottom: var(--space-2);">+ Add MCP Server</button>
            <div class="mcp-export-import-buttons" style="display: flex; gap: var(--space-2);">
              <button class="secondary-btn" id="export-mcp-servers-btn" style="flex: 1; font-size: var(--text-sm); padding: var(--space-1) var(--space-2);" ${this.mcpServers.length === 0 ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Export
              </button>
              <button class="secondary-btn" id="import-mcp-servers-btn" style="flex: 1; font-size: var(--text-sm); padding: var(--space-1) var(--space-2);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Import
              </button>
            </div>
            <input
              type="file"
              id="import-mcp-file-input"
              accept=".json"
              style="position: fixed; left: -9999px; top: 0; width: 1px; height: 1px; opacity: 0;"
            >
          </div>
        </div>

        <!-- Details panel -->
        <div class="split-details">
          ${selectedServer ? this.renderMCPServerDetails(selectedServer) : `
            <div class="split-details-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
              <p>Select an MCP server or add a new one</p>
              <p style="font-size: var(--text-sm); color: var(--color-text-tertiary); margin-top: var(--space-2);">
                MCP (Model Context Protocol) servers provide tools that agents can use during conversations.
              </p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  private renderMCPServerDetails(server: MCPServer): string {
    const isConnected = mcpRouter.isConnected(server.id);
    const isConnecting = this.connectingServerId === server.id;
    
    const transportLabel = server.transport === 'streamable-http' 
      ? 'Streamable HTTP Transport' 
      : server.transport === 'http' 
        ? 'HTTP/SSE Transport' 
        : 'Stdio Transport';
    
    return `
      <div class="details-header">
        <div>
          <div class="details-title">${server.name}</div>
          <div style="font-size: var(--text-sm); color: var(--color-text-tertiary); margin-top: var(--space-1);">
            ${transportLabel}
          </div>
        </div>
        <div class="details-status">
          <span class="status-dot ${isConnected ? 'connected' : (isConnecting ? 'connecting' : '')}"></span>
          <span>${isConnected ? 'Connected' : (isConnecting ? 'Connecting...' : (server.lastError ? 'Error' : 'Disconnected'))}</span>
        </div>
      </div>

      ${server.transport === 'http' || server.transport === 'streamable-http' ? `
        <div class="form-group">
          <label class="form-label">Endpoint URL</label>
          <input 
            type="text" 
            class="form-input mcp-endpoint-input" 
            data-mcp-server="${server.id}"
            value="${server.endpoint || ''}"
            placeholder="http://localhost:3000/mcp"
          >
          <div class="form-hint">The HTTP endpoint for the MCP server</div>
        </div>
        <div class="form-group">
          <label class="form-label">Auth Token (Optional)</label>
          <input 
            type="password" 
            class="form-input mcp-auth-token-input" 
            data-mcp-server="${server.id}"
            value="${server.authToken || ''}"
            placeholder="Bearer token for authentication"
          >
          <div class="form-hint">Authorization token (or use custom headers below)</div>
        </div>
        <div class="form-group">
          <label class="form-label">Custom Headers (Optional)</label>
          <textarea 
            class="form-input mcp-headers-input" 
            data-mcp-server="${server.id}"
            rows="3"
            placeholder='{"Authorization": "Bearer token", "X-Custom": "value"}'
          >${server.headers ? JSON.stringify(server.headers, null, 2) : ''}</textarea>
          <div class="form-hint">JSON object of custom headers to send with requests</div>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input 
              type="checkbox" 
              class="mcp-proxy-input" 
              data-mcp-server="${server.id}"
              ${server.useDevProxy ? 'checked' : ''}
            >
            <span>Use Dev Proxy (bypass CORS)</span>
          </label>
          <div class="form-hint">Routes requests through localhost to avoid CORS issues during development</div>
        </div>
      ` : `
        <div class="form-group">
          <label class="form-label">Command</label>
          <input 
            type="text" 
            class="form-input mcp-command-input" 
            data-mcp-server="${server.id}"
            value="${server.command || ''}"
            placeholder="npx -y @mcp/server"
          >
          <div class="form-hint">The command to start the MCP server process</div>
        </div>
        <div class="form-group">
          <label class="form-label">Arguments (comma-separated)</label>
          <input 
            type="text" 
            class="form-input mcp-args-input" 
            data-mcp-server="${server.id}"
            value="${(server.args || []).join(', ')}"
            placeholder="--port, 3000"
          >
        </div>
      `}

      ${server.lastError ? `
        <div class="form-group">
          <div class="error-message" style="padding: var(--space-3); background: rgba(239, 68, 68, 0.1); border-radius: var(--radius-md); color: var(--color-error); font-size: var(--text-sm);">
            <strong>Last Error:</strong> ${server.lastError}
          </div>
        </div>
      ` : ''}

      <!-- Tools Section -->
      <div class="models-section" style="margin-top: var(--space-4);">
        <div class="models-header">
          <span class="models-title">Available Tools (${server.tools.length})</span>
          ${isConnected ? `
            <button class="btn-small refresh-tools-btn" data-mcp-server="${server.id}">
              Refresh
            </button>
          ` : ''}
        </div>
        ${server.tools.length > 0 ? `
          <div class="mcp-tools-list">
            ${server.tools.map((tool: { name: string; description: string; inputSchema?: Record<string, unknown> }) => {
              // Parse inputSchema to extract parameters
              const schema = tool.inputSchema || {};
              const properties = (schema.properties || {}) as Record<string, { type?: string; description?: string }>;
              const required = (schema.required || []) as string[];
              const paramNames = Object.keys(properties);
              
              return `
              <div class="mcp-tool-item" data-expanded="false" data-tool-name="${tool.name}">
                <div class="mcp-tool-header">
                  <span class="mcp-tool-name">${tool.name}</span>
                  <span class="mcp-tool-toggle">▶</span>
                </div>
                <div class="mcp-tool-description">${tool.description || 'No description'}</div>
                <div class="mcp-tool-params">
                  <div class="mcp-tool-params-title">Parameters</div>
                  ${paramNames.length > 0 ? paramNames.map(paramName => {
                    const param = properties[paramName] || {};
                    const isRequired = required.includes(paramName);
                    const paramType = param.type || 'any';
                    const paramDesc = param.description || '';
                    return `
                    <div class="mcp-param-item">
                      <span class="mcp-param-name">${paramName}</span>
                      <span class="mcp-param-type">${paramType}</span>
                      ${isRequired 
                        ? '<span class="mcp-param-required">required</span>' 
                        : '<span class="mcp-param-optional">optional</span>'}
                      ${paramDesc ? `<span class="mcp-param-desc">${paramDesc}</span>` : ''}
                    </div>`;
                  }).join('') : '<div class="mcp-no-params">No parameters required</div>'}
                </div>
              </div>`;
            }).join('')}
          </div>
        ` : `
          <div style="padding: var(--space-4); text-align: center; color: var(--color-text-tertiary); font-size: var(--text-sm);">
            ${isConnected ? 'No tools available from this server' : 'Connect to discover available tools'}
          </div>
        `}
      </div>

      <div class="details-actions">
        ${isConnected ? `
          <button class="test-btn disconnect-mcp-btn" data-mcp-server="${server.id}" style="background: var(--color-warning);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: var(--space-2);">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Disconnect
          </button>
        ` : `
          ${isConnecting ? `
            <button class="test-btn stop-connect-mcp-btn" data-mcp-server="${server.id}" style="background: var(--color-warning);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: var(--space-2);">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Stop
            </button>
          ` : `
            <button class="test-btn connect-mcp-btn" data-mcp-server="${server.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: var(--space-2);">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Connect
            </button>
          `}
        `}
        <button class="delete-provider-btn delete-mcp-btn" data-mcp-server="${server.id}" style="margin-left: auto;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: var(--space-2);">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
      </div>
    `;
  }

  private renderPresetsTab(): string {
    if (!this.settings) return '';
    return `
      <!-- Category Toggles Section -->
      <div class="section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Categories
        </div>
        <div class="form-hint" style="margin-bottom: var(--space-3);">
          Toggle category visibility in the agent selection menu
        </div>
        <div class="category-grid">
          ${presetCategories.map(cat => {
            const isHidden = this.settings!.hiddenCategories.includes(cat.id);
            return `
              <div class="category-toggle ${isHidden ? 'hidden' : ''}" data-category-id="${cat.id}">
                <div class="category-info">
                  <span class="category-icon">${cat.icon}</span>
                  <span class="category-name">${cat.name}</span>
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

      <!-- All Presets Section -->
      <div class="section">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          All Presets
        </div>

        <!-- Batch Controls for Custom Presets -->
      ${this.getCustomPresetsCount() > 0 ? `
        <div class="batch-controls">
          <div class="batch-controls-left">
            <button class="select-all-btn" id="select-all-presets-btn">
              ${this.selectedPresetIds.size === this.getCustomPresetsCount() ? 'Deselect All' : 'Select All Custom'}
            </button>
            <span class="selection-count">${this.selectedPresetIds.size} of ${this.getCustomPresetsCount()} selected</span>
          </div>
          <button class="export-selected-btn" id="export-selected-btn" ${this.selectedPresetIds.size === 0 ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export Selected
            ${this.selectedPresetIds.size > 0 ? `<span class="selection-badge">${this.selectedPresetIds.size}</span>` : ''}
          </button>
        </div>
      ` : ''}

        <div class="preset-list">
          ${this.renderPresetsByCategory()}
        </div>
      </div>

      <!-- Actions Section -->
      <div class="section" style="border-bottom: none;">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Actions
        </div>

        <button class="create-preset-btn" id="create-preset-btn">+ Create Custom Preset</button>

        <div class="preset-actions-row">
          <button class="action-btn export" id="export-presets-btn" title="Export custom presets to JSON file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export All
          </button>
          <button class="action-btn import" id="import-presets-btn" title="Import presets from JSON file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import
          </button>
        </div>
        <input type="file" accept=".json" class="import-file-input" id="import-file-input">
        <div class="import-result" id="import-result"></div>
      </div>
    `;
  }

  private renderLanguagesTab(): string {
    if (!this.settings) return '';
    
    // Filter languages based on search
    const filteredLanguages = this.languageFilter 
      ? ALL_LANGUAGES.filter(lang => 
          lang.name.toLowerCase().includes(this.languageFilter.toLowerCase()) ||
          lang.nativeName.toLowerCase().includes(this.languageFilter.toLowerCase()) ||
          lang.code.toLowerCase().includes(this.languageFilter.toLowerCase())
        )
      : ALL_LANGUAGES;
    
    const enabledCount = this.settings.enabledLanguages.length;
    
    return `
      <div class="section" style="border-bottom: none;">
        <div class="section-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          Available Languages
          <span style="font-size: var(--text-xs); color: var(--color-text-tertiary); font-weight: normal; margin-left: var(--space-2);">
            ${enabledCount} enabled
          </span>
        </div>
        
        <div class="form-hint" style="margin-bottom: var(--space-4);">
          Select which languages appear in the conversation language selector. English is always available.
        </div>

        <!-- Search Filter -->
        <div class="language-filter">
          <div class="language-filter-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input 
              type="text" 
              class="language-filter-input" 
              id="language-filter"
              placeholder="Search languages..."
              value="${this.languageFilter}"
            >
          </div>
        </div>

        <!-- Language Grid -->
        <div class="language-grid-improved">
          ${filteredLanguages.map(lang => {
            const isEnglish = lang.code === '';
            const isEnabled = isEnglish || this.settings!.enabledLanguages.includes(lang.code);
            return `
              <label class="language-card ${isEnabled ? 'enabled' : ''} ${isEnglish ? 'locked' : ''}">
                <input type="checkbox" 
                       class="language-card-checkbox language-checkbox" 
                       data-lang-code="${lang.code}"
                       ${isEnabled ? 'checked' : ''}
                       ${isEnglish ? 'disabled' : ''}>
                <div class="language-card-info">
                  <div class="language-card-name">${lang.name}</div>
                  <div class="language-card-native">${lang.nativeName}</div>
                </div>
                ${isEnglish ? '<span class="language-card-badge">Required</span>' : ''}
              </label>
            `;
          }).join('')}
        </div>
        
        ${filteredLanguages.length === 0 ? `
          <div style="text-align: center; padding: var(--space-6); color: var(--color-text-tertiary);">
            No languages match your search
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderActiveTabContent(): string {
    switch (this.activeTab) {
      case 'general': return this.renderGeneralTab();
      case 'providers': return this.renderProvidersTab();
      case 'mcp': return this.renderMCPTab();
      case 'presets': return this.renderPresetsTab();
      case 'languages': return this.renderLanguagesTab();
      default: return this.renderGeneralTab();
    }
  }

  private currentAddModelProviderId: string | null = null;

  private setupEventHandlers() {
    // Close button
    this.shadowRoot?.getElementById('close-btn')?.addEventListener('click', () => {
      eventBus.emit('settings:close', undefined);
    });

    // Tab navigation
    this.shadowRoot?.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab') as SettingsTab;
        if (tabName && tabName !== this.activeTab) {
          this.activeTab = tabName;
          this.render();
        }
      });
    });

    // Theme selection (supports both old and new card styles)
    this.shadowRoot?.querySelectorAll('.theme-option, .theme-card').forEach(option => {
      option.addEventListener('click', async () => {
        const theme = option.getAttribute('data-theme') as 'dark' | 'light';
        this.settings = await settingsStorage.update({ theme });
        document.documentElement.setAttribute('data-theme', theme);

        this.shadowRoot?.querySelectorAll('.theme-option, .theme-card').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        
        eventBus.emit('settings:updated', this.settings!);
      });
    });

    // Provider sidebar item selection
    this.shadowRoot?.querySelectorAll('.sidebar-item[data-provider-id]').forEach(item => {
      item.addEventListener('click', () => {
        const providerId = item.getAttribute('data-provider-id');
        if (providerId && providerId !== this.selectedProviderId) {
          this.selectedProviderId = providerId;
          this.render();
        }
      });
    });

    // MCP server sidebar item selection
    this.shadowRoot?.querySelectorAll('.sidebar-item[data-mcp-server-id]').forEach(item => {
      item.addEventListener('click', () => {
        const serverId = item.getAttribute('data-mcp-server-id');
        if (serverId && serverId !== this.selectedMcpServerId) {
          this.selectedMcpServerId = serverId;
          this.render();
        }
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

    // Add MCP Server button
    this.shadowRoot?.getElementById('add-mcp-server-btn')?.addEventListener('click', () => {
      this.showAddMCPServerModal();
    });

    // Export MCP Servers button
    this.shadowRoot?.getElementById('export-mcp-servers-btn')?.addEventListener('click', async () => {
      await this.handleExportMCPServers();
    });

    // Import MCP Servers button
    this.shadowRoot?.getElementById('import-mcp-servers-btn')?.addEventListener('click', () => {
      const input = this.shadowRoot?.getElementById('import-mcp-file-input') as HTMLInputElement | null;
      if (!input) return;
      // Some browsers won't open the file picker if the input is `display:none`.
      // Prefer showPicker() where available, otherwise fall back to click().
      const anyInput = input as any;
      if (typeof anyInput.showPicker === 'function') {
        anyInput.showPicker();
      } else {
        input.click();
      }
    });

    // Import MCP file input change
    this.shadowRoot?.getElementById('import-mcp-file-input')?.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) {
        await this.handleImportMCPFile(file);
        input.value = ''; // Reset for next import
      }
    });

    // Import conflict modal handlers
    this.shadowRoot?.getElementById('cancel-mcp-import')?.addEventListener('click', () => {
      this.hideMCPImportConflictModal();
    });

    this.shadowRoot?.getElementById('confirm-mcp-import')?.addEventListener('click', async () => {
      await this.handleConfirmMCPImport();
    });

    // Add MCP Server modal handlers
    this.shadowRoot?.getElementById('cancel-add-mcp')?.addEventListener('click', () => {
      this.hideAddMCPServerModal();
    });

    this.shadowRoot?.getElementById('confirm-add-mcp')?.addEventListener('click', async () => {
      await this.handleAddMCPServer();
    });

    // MCP transport type change (show/hide relevant fields)
    this.shadowRoot?.getElementById('new-mcp-transport')?.addEventListener('change', () => {
      this.updateMCPTransportFields();
    });

    // Connect MCP server buttons
    this.shadowRoot?.querySelectorAll('.connect-mcp-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const serverId = (e.currentTarget as HTMLButtonElement).dataset.mcpServer;
        if (serverId) {
          await this.handleConnectMCPServer(serverId);
        }
      });
    });

    // Stop connecting MCP server buttons
    this.shadowRoot?.querySelectorAll('.stop-connect-mcp-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serverId = (e.currentTarget as HTMLButtonElement).dataset.mcpServer;
        if (serverId) {
          this.handleStopConnectMCPServer(serverId);
        }
      });
    });

    // Disconnect MCP server buttons
    this.shadowRoot?.querySelectorAll('.disconnect-mcp-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const serverId = (e.currentTarget as HTMLButtonElement).dataset.mcpServer;
        if (serverId) {
          await this.handleDisconnectMCPServer(serverId);
        }
      });
    });

    // Delete MCP server buttons
    this.shadowRoot?.querySelectorAll('.delete-mcp-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const serverId = (e.currentTarget as HTMLButtonElement).dataset.mcpServer;
        if (serverId && confirm('Are you sure you want to delete this MCP server?')) {
          await this.handleDeleteMCPServer(serverId);
        }
      });
    });

    // Refresh tools buttons
    this.shadowRoot?.querySelectorAll('.refresh-tools-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const serverId = (e.currentTarget as HTMLButtonElement).dataset.mcpServer;
        if (serverId) {
          await this.handleRefreshMCPTools(serverId);
        }
      });
    });

    // MCP tool item expand/collapse toggle
    this.shadowRoot?.querySelectorAll('.mcp-tool-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const toolItem = e.currentTarget as HTMLElement;
        const isExpanded = toolItem.dataset.expanded === 'true';
        toolItem.dataset.expanded = isExpanded ? 'false' : 'true';
      });
    });

    // MCP endpoint updates
    this.shadowRoot?.querySelectorAll('.mcp-endpoint-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const serverId = (e.target as HTMLInputElement).dataset.mcpServer;
        const endpoint = (e.target as HTMLInputElement).value;
        if (serverId) {
          await mcpServerStorage.update(serverId, { endpoint });
        }
      });
    });

    // MCP auth token updates
    this.shadowRoot?.querySelectorAll('.mcp-auth-token-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const serverId = (e.target as HTMLInputElement).dataset.mcpServer;
        const authToken = (e.target as HTMLInputElement).value.trim() || undefined;
        if (serverId) {
          await mcpServerStorage.update(serverId, { authToken });
        }
      });
    });

    // MCP headers updates
    this.shadowRoot?.querySelectorAll('.mcp-headers-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const serverId = (e.target as HTMLTextAreaElement).dataset.mcpServer;
        const headersStr = (e.target as HTMLTextAreaElement).value.trim();
        if (serverId) {
          let headers: Record<string, string> | undefined;
          if (headersStr) {
            try {
              headers = JSON.parse(headersStr);
              if (typeof headers !== 'object' || Array.isArray(headers)) {
                alert('Headers must be a JSON object');
                return;
              }
            } catch {
              alert('Invalid JSON format for headers');
              return;
            }
          }
          await mcpServerStorage.update(serverId, { headers });
        }
      });
    });

    // MCP proxy checkbox updates
    this.shadowRoot?.querySelectorAll('.mcp-proxy-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const serverId = (e.target as HTMLInputElement).dataset.mcpServer;
        const useDevProxy = (e.target as HTMLInputElement).checked;
        console.log('[Settings] Proxy checkbox changed:', { serverId, useDevProxy });
        if (serverId) {
          await mcpServerStorage.update(serverId, { useDevProxy });
          console.log('[Settings] Saved useDevProxy to storage');
        }
      });
    });

    // MCP command updates
    this.shadowRoot?.querySelectorAll('.mcp-command-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const serverId = (e.target as HTMLInputElement).dataset.mcpServer;
        const command = (e.target as HTMLInputElement).value;
        if (serverId) {
          await mcpServerStorage.update(serverId, { command });
        }
      });
    });

    // MCP args updates
    this.shadowRoot?.querySelectorAll('.mcp-args-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const serverId = (e.target as HTMLInputElement).dataset.mcpServer;
        const argsString = (e.target as HTMLInputElement).value;
        const args = argsString.split(',').map(a => a.trim()).filter(a => a);
        if (serverId) {
          await mcpServerStorage.update(serverId, { args });
        }
      });
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

    // Language handlers (includes filter and checkboxes)
    this.setupLanguageHandlers();
    
    // Modals and preset handlers
    this.setupModalAndPresetHandlers();
  }

  private setupLanguageHandlers() {
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
        const labelEl = input.closest('.language-item, .language-card');
        if (labelEl) {
          labelEl.classList.toggle('enabled', input.checked);
        }
        
        eventBus.emit('settings:updated', this.settings!);
      });
    });

    // Language filter (re-attach after render)
    this.shadowRoot?.getElementById('language-filter')?.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      this.languageFilter = input.value;
      // Re-render only the languages content
      const content = this.shadowRoot?.querySelector('.settings-content');
      if (content && this.activeTab === 'languages') {
        content.innerHTML = this.renderLanguagesTab();
        this.setupLanguageHandlers();
      }
    });
  }

  private setupModalAndPresetHandlers() {
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

    // Select All / Deselect All button
    this.shadowRoot?.getElementById('select-all-presets-btn')?.addEventListener('click', () => {
      const customPresetIds = this.getCustomPresetIds();
      const allSelected = this.selectedPresetIds.size === customPresetIds.length;
      
      if (allSelected) {
        // Deselect all
        this.selectedPresetIds.clear();
      } else {
        // Select all custom presets
        customPresetIds.forEach(id => this.selectedPresetIds.add(id));
      }

      // Update all checkboxes
      this.shadowRoot?.querySelectorAll('.preset-select-checkbox').forEach(checkbox => {
        const input = checkbox as HTMLInputElement;
        const presetId = input.dataset.preset;
        if (presetId) {
          input.checked = this.selectedPresetIds.has(presetId);
          const presetItem = input.closest('.preset-item');
          if (presetItem) {
            presetItem.classList.toggle('selected', input.checked);
          }
        }
      });

      this.updateBatchControls();
    });

    // Export Selected button
    this.shadowRoot?.getElementById('export-selected-btn')?.addEventListener('click', async () => {
      if (this.selectedPresetIds.size === 0) return;
      
      try {
        await downloadSelectedPresets(Array.from(this.selectedPresetIds));
      } catch (error) {
        console.error('Failed to export selected presets:', error);
        alert('Failed to export presets. Please try again.');
      }
    });

    // Export presets button
    this.shadowRoot?.getElementById('export-presets-btn')?.addEventListener('click', async () => {
      try {
        await downloadPresets();
      } catch (error) {
        console.error('Failed to export presets:', error);
        alert('Failed to export presets. Please try again.');
      }
    });

    // Import presets button - trigger file input
    this.shadowRoot?.getElementById('import-presets-btn')?.addEventListener('click', () => {
      const fileInput = this.shadowRoot?.getElementById('import-file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = ''; // Reset to allow re-selecting same file
        fileInput.click();
      }
    });

    // Import file input change handler
    this.shadowRoot?.getElementById('import-file-input')?.addEventListener('change', async (e) => {
      const fileInput = e.target as HTMLInputElement;
      const file = fileInput.files?.[0];
      if (!file) return;

      const resultDiv = this.shadowRoot?.getElementById('import-result');
      
      try {
        const content = await readFileContent(file);
        const importedCount = await importPresets(content);
        
        // Show success message
        if (resultDiv) {
          resultDiv.className = 'import-result success';
          resultDiv.textContent = `Successfully imported ${importedCount} preset${importedCount !== 1 ? 's' : ''}.`;
          
          // Hide after 5 seconds
          setTimeout(() => {
            resultDiv.className = 'import-result';
          }, 5000);
        }
        
        // Refresh the preset list
        await this.loadData();
        this.render();
      } catch (error) {
        console.error('Failed to import presets:', error);
        
        // Show error message
        if (resultDiv) {
          resultDiv.className = 'import-result error';
          resultDiv.textContent = error instanceof Error ? error.message : 'Failed to import presets. Please check the file format.';
          
          // Hide after 5 seconds
          setTimeout(() => {
            resultDiv.className = 'import-result';
          }, 5000);
        }
      }
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
            // Remove from selection if selected
            this.selectedPresetIds.delete(presetId);
            await this.loadData();
            this.render();
          }
        }
      });
    });

    // Selection checkboxes for custom presets
    this.shadowRoot?.querySelectorAll('.preset-select-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const input = e.target as HTMLInputElement;
        const presetId = input.dataset.preset;
        if (!presetId) return;

        if (input.checked) {
          this.selectedPresetIds.add(presetId);
        } else {
          this.selectedPresetIds.delete(presetId);
        }

        // Update UI without full re-render
        const presetItem = input.closest('.preset-item');
        if (presetItem) {
          presetItem.classList.toggle('selected', input.checked);
        }

        // Update batch controls
        this.updateBatchControls();
      });
    });

    // Single preset export buttons
    this.shadowRoot?.querySelectorAll('.preset-action-btn.export-single').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const presetId = (btn as HTMLButtonElement).dataset.preset;
        if (presetId) {
          try {
            await downloadSelectedPresets([presetId]);
          } catch (error) {
            console.error('Failed to export preset:', error);
            alert('Failed to export preset. Please try again.');
          }
        }
      });
    });
  }

  private updateBatchControls() {
    const selectAllBtn = this.shadowRoot?.getElementById('select-all-presets-btn');
    const exportSelectedBtn = this.shadowRoot?.getElementById('export-selected-btn');
    const selectionCount = this.shadowRoot?.querySelector('.selection-count');
    const customCount = this.getCustomPresetsCount();

    if (selectAllBtn) {
      selectAllBtn.textContent = this.selectedPresetIds.size === customCount ? 'Deselect All' : 'Select All Custom';
    }

    if (selectionCount) {
      selectionCount.textContent = `${this.selectedPresetIds.size} of ${customCount} selected`;
    }

    if (exportSelectedBtn) {
      (exportSelectedBtn as HTMLButtonElement).disabled = this.selectedPresetIds.size === 0;
      
      // Update badge
      const badge = exportSelectedBtn.querySelector('.selection-badge');
      if (this.selectedPresetIds.size > 0) {
        if (badge) {
          badge.textContent = String(this.selectedPresetIds.size);
        } else {
          exportSelectedBtn.insertAdjacentHTML('beforeend', `<span class="selection-badge">${this.selectedPresetIds.size}</span>`);
        }
      } else if (badge) {
        badge.remove();
      }
    }
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

  // ============================================
  // MCP Server Modal Methods
  // ============================================

  private showAddMCPServerModal() {
    const modal = this.shadowRoot?.getElementById('add-mcp-server-modal');
    if (modal) {
      modal.style.display = 'flex';
      this.updateMCPTransportFields();
    }
  }

  private hideAddMCPServerModal() {
    const modal = this.shadowRoot?.getElementById('add-mcp-server-modal');
    if (modal) {
      modal.style.display = 'none';
      // Clear inputs
      (this.shadowRoot?.getElementById('new-mcp-name') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-mcp-transport') as HTMLSelectElement).value = 'streamable-http';
      (this.shadowRoot?.getElementById('new-mcp-endpoint') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-mcp-auth-token') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-mcp-headers') as HTMLTextAreaElement).value = '';
      (this.shadowRoot?.getElementById('new-mcp-use-proxy') as HTMLInputElement).checked = true; // Default to true for dev
      (this.shadowRoot?.getElementById('new-mcp-command') as HTMLInputElement).value = '';
      (this.shadowRoot?.getElementById('new-mcp-args') as HTMLInputElement).value = '';
      // Reset field visibility
      this.updateMCPTransportFields();
    }
  }

  private updateMCPTransportFields() {
    const transportSelect = this.shadowRoot?.getElementById('new-mcp-transport') as HTMLSelectElement;
    const endpointGroup = this.shadowRoot?.getElementById('mcp-endpoint-group');
    const authTokenGroup = this.shadowRoot?.getElementById('mcp-auth-token-group');
    const headersGroup = this.shadowRoot?.getElementById('mcp-headers-group');
    const proxyGroup = this.shadowRoot?.getElementById('mcp-proxy-group');
    const commandGroup = this.shadowRoot?.getElementById('mcp-command-group');
    const argsGroup = this.shadowRoot?.getElementById('mcp-args-group');
    
    if (transportSelect && endpointGroup && authTokenGroup && headersGroup && proxyGroup && commandGroup && argsGroup) {
      const isHttpTransport = transportSelect.value === 'http' || transportSelect.value === 'streamable-http';
      if (isHttpTransport) {
        endpointGroup.style.display = 'block';
        authTokenGroup.style.display = 'block';
        headersGroup.style.display = 'block';
        proxyGroup.style.display = 'block';
        commandGroup.style.display = 'none';
        argsGroup.style.display = 'none';
      } else {
        endpointGroup.style.display = 'none';
        authTokenGroup.style.display = 'none';
        headersGroup.style.display = 'none';
        proxyGroup.style.display = 'none';
        commandGroup.style.display = 'block';
        argsGroup.style.display = 'block';
      }
    }
  }

  private async handleAddMCPServer() {
    const name = (this.shadowRoot?.getElementById('new-mcp-name') as HTMLInputElement).value.trim();
    const transport = (this.shadowRoot?.getElementById('new-mcp-transport') as HTMLSelectElement).value as MCPTransport;
    
    if (!name) {
      alert('Please enter a server name');
      return;
    }

    // Check if name already exists
    if (await mcpServerStorage.nameExists(name)) {
      alert('An MCP server with this name already exists');
      return;
    }

    const isHttpTransport = transport === 'http' || transport === 'streamable-http';
    
    if (isHttpTransport) {
      const endpoint = (this.shadowRoot?.getElementById('new-mcp-endpoint') as HTMLInputElement).value.trim();
      const authToken = (this.shadowRoot?.getElementById('new-mcp-auth-token') as HTMLInputElement).value.trim() || undefined;
      const headersStr = (this.shadowRoot?.getElementById('new-mcp-headers') as HTMLTextAreaElement).value.trim();
      const useDevProxy = (this.shadowRoot?.getElementById('new-mcp-use-proxy') as HTMLInputElement).checked;
      
      if (!endpoint) {
        alert('Please enter an endpoint URL');
        return;
      }

      // Parse headers JSON if provided
      let headers: Record<string, string> | undefined;
      if (headersStr) {
        try {
          headers = JSON.parse(headersStr);
          if (typeof headers !== 'object' || Array.isArray(headers)) {
            throw new Error('Headers must be a JSON object');
          }
        } catch (e) {
          alert('Invalid headers JSON format. Please provide a valid JSON object.');
          return;
        }
      }

      await mcpServerStorage.create({ name, transport, endpoint, authToken, headers, useDevProxy });
    } else {
      const command = (this.shadowRoot?.getElementById('new-mcp-command') as HTMLInputElement).value.trim();
      const argsString = (this.shadowRoot?.getElementById('new-mcp-args') as HTMLInputElement).value.trim();
      const args = argsString ? argsString.split(',').map(a => a.trim()).filter(a => a) : [];
      
      if (!command) {
        alert('Please enter a command');
        return;
      }
      await mcpServerStorage.create({ name, transport, command, args });
    }

    this.hideAddMCPServerModal();
    await this.loadData();
    this.selectedMcpServerId = this.mcpServers[this.mcpServers.length - 1]?.id || null;
    this.render();
  }

  private async handleConnectMCPServer(serverId: string) {
    // Set connecting state and re-render to show "Stop" button
    this.connectingServerId = serverId;
    this.render();

    try {
      await mcpRouter.connect(serverId);
      this.connectingServerId = null;
      await this.loadData();
      this.render();
    } catch (error) {
      this.connectingServerId = null;
      const message = error instanceof Error ? error.message : 'Unknown error';
      
      // Don't show alert for abort - that's user-initiated
      if (!(error instanceof Error && error.name === 'AbortError')) {
        // Update the server with the error for display
        await mcpServerStorage.setError(serverId, message);
      }
      
      await this.loadData();
      this.render();
    }
  }

  private handleStopConnectMCPServer(serverId: string) {
    mcpRouter.abortConnection(serverId);
    this.connectingServerId = null;
    this.render();
  }

  private async handleDisconnectMCPServer(serverId: string) {
    try {
      await mcpRouter.disconnect(serverId);
      await this.loadData();
      this.render();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  private async handleDeleteMCPServer(serverId: string) {
    // Disconnect first if connected
    if (mcpRouter.isConnected(serverId)) {
      await mcpRouter.disconnect(serverId);
    }
    
    await mcpServerStorage.delete(serverId);
    await this.loadData();
    
    // Select another server if we deleted the selected one
    if (this.selectedMcpServerId === serverId) {
      this.selectedMcpServerId = this.mcpServers[0]?.id || null;
    }
    
    this.render();
  }

  private async handleRefreshMCPTools(serverId: string) {
    try {
      await mcpRouter.refreshTools(serverId);
      await this.loadData();
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to refresh tools: ${message}`);
    }
  }

  // ============================================
  // MCP Server Export/Import Methods
  // ============================================

  private async handleExportMCPServers() {
    try {
      if (this.mcpServers.length === 0) {
        alert('No MCP servers to export');
        return;
      }
      await downloadMCPServers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to export MCP servers: ${message}`);
    }
  }

  private pendingMCPImportContent: string | null = null;

  private async handleImportMCPFile(file: File) {
    try {
      const content = await readFileContent(file);
      
      let servers: Array<{ name: string }> = [];
      try {
        servers = normalizeMCPServerImport(content);
      } catch {
        alert('Invalid JSON file');
        return;
      }

      if (servers.length === 0) {
        alert('No servers found in the import file');
        return;
      }

      // Check for potential name conflicts
      const existingNames = new Set(this.mcpServers.map(s => s.name.toLowerCase()));
      const importNames = servers.map(s => s.name || '');
      const conflicts = importNames.filter(name => existingNames.has(name.toLowerCase()));

      // Store content for later use
      this.pendingMCPImportContent = content;

      // Show conflict modal with appropriate message
      const messageEl = this.shadowRoot?.getElementById('mcp-import-conflict-message');
      if (messageEl) {
        if (conflicts.length > 0) {
          messageEl.innerHTML = `
            <p>Found <strong>${servers.length}</strong> server(s) to import.</p>
            <p style="margin-top: var(--space-2); color: var(--color-warning);">
              <strong>${conflicts.length}</strong> server(s) have names that already exist: 
              <em>${conflicts.slice(0, 3).join(', ')}${conflicts.length > 3 ? '...' : ''}</em>
            </p>
          `;
        } else {
          messageEl.innerHTML = `
            <p>Found <strong>${servers.length}</strong> server(s) to import.</p>
            <p style="margin-top: var(--space-2); color: var(--color-success);">No name conflicts detected.</p>
          `;
        }
      }

      this.showMCPImportConflictModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to read import file: ${message}`);
    }
  }

  private showMCPImportConflictModal() {
    const modal = this.shadowRoot?.getElementById('mcp-import-conflict-modal');
    if (modal) {
      modal.style.display = 'flex';
      // Reset to default strategy
      const skipRadio = this.shadowRoot?.querySelector('input[name="mcp-conflict-strategy"][value="skip"]') as HTMLInputElement;
      if (skipRadio) {
        skipRadio.checked = true;
      }
    }
  }

  private hideMCPImportConflictModal() {
    const modal = this.shadowRoot?.getElementById('mcp-import-conflict-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    this.pendingMCPImportContent = null;
  }

  private async handleConfirmMCPImport() {
    if (!this.pendingMCPImportContent) {
      this.hideMCPImportConflictModal();
      return;
    }

    // Get selected conflict strategy
    const selectedRadio = this.shadowRoot?.querySelector('input[name="mcp-conflict-strategy"]:checked') as HTMLInputElement;
    const strategy = (selectedRadio?.value || 'skip') as MCPImportConflictStrategy;

    try {
      const result = await importMCPServers(this.pendingMCPImportContent, strategy);
      
      this.hideMCPImportConflictModal();
      await this.loadData();
      this.render();

      // Show result message
      const messages: string[] = [];
      if (result.imported > 0) {
        messages.push(`${result.imported} server(s) imported`);
      }
      if (result.replaced > 0) {
        messages.push(`${result.replaced} server(s) replaced`);
      }
      if (result.skipped > 0) {
        messages.push(`${result.skipped} server(s) skipped`);
      }

      alert(messages.length > 0 ? messages.join(', ') : 'No servers were imported');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to import MCP servers: ${message}`);
    }
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

