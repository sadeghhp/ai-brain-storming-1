// ============================================
// AI Brainstorm - Result Draft Panel Component
// Version: 1.0.0
// ============================================

import { resultDraftStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { copyToClipboard, downloadAsFile, parseBasicFormatting, escapeHtml } from '../utils/helpers';
import type { ResultDraft } from '../types';

export class ResultDraftPanel extends HTMLElement {
  private draft: ResultDraft | null = null;
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
    await this.loadDraft();
    this.setupEventListeners();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'conversation-id' && oldValue !== newValue) {
      this.conversationId = newValue;
      this.loadDraft();
    }
  }

  private async loadDraft() {
    this.conversationId = this.getAttribute('conversation-id');
    if (!this.conversationId) return;

    this.draft = await resultDraftStorage.get(this.conversationId) || null;
    this.renderContent();
  }

  private setupEventListeners() {
    eventBus.on('draft:updated', (draft: ResultDraft) => {
      if (draft.conversationId === this.conversationId) {
        this.draft = draft;
        this.renderContent();
      }
    });
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

        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-tertiary);
        }

        .panel-title {
          font-size: var(--text-sm);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .panel-title svg {
          color: var(--color-primary);
        }

        .panel-actions {
          display: flex;
          gap: var(--space-1);
        }

        .action-btn {
          padding: var(--space-1);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .action-btn:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
        }

        .section {
          margin-bottom: var(--space-6);
        }

        .section-title {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--space-2);
        }

        .section-content {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          line-height: var(--leading-relaxed);
        }

        .section-content code {
          background: var(--color-bg-primary);
          padding: 0.15em 0.4em;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 0.9em;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          color: var(--color-text-tertiary);
          text-align: center;
        }

        .empty-icon {
          width: 48px;
          height: 48px;
          margin-bottom: var(--space-3);
          opacity: 0.3;
        }

        .key-decisions {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .key-decisions li {
          padding: var(--space-2) 0;
          border-bottom: 1px solid var(--color-border);
          font-size: var(--text-sm);
        }

        .key-decisions li:last-child {
          border-bottom: none;
        }

        .key-decisions li::before {
          content: '→';
          color: var(--color-primary);
          margin-right: var(--space-2);
        }

        .export-buttons {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-4);
          padding-top: var(--space-4);
          border-top: 1px solid var(--color-border);
        }

        .export-btn {
          flex: 1;
          padding: var(--space-2);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          transition: all var(--transition-fast);
        }

        .export-btn:hover {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
        }

        .updated-at {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          text-align: center;
          margin-top: var(--space-2);
        }
      </style>

      <div class="panel-header">
        <div class="panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          Result Draft
        </div>
        <div class="panel-actions">
          <button class="action-btn" id="copy-btn" title="Copy to clipboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="action-btn" id="refresh-btn" title="Refresh">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="panel-content" id="content">
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>No result draft yet</p>
          <p style="font-size: var(--text-xs); margin-top: var(--space-2);">
            The secretary will compile results as the discussion progresses
          </p>
        </div>
      </div>
    `;

    this.setupButtonHandlers();
  }

  private setupButtonHandlers() {
    this.shadowRoot?.getElementById('copy-btn')?.addEventListener('click', async () => {
      if (this.draft?.content) {
        await copyToClipboard(this.draft.content);
        // Could add a toast notification here
      }
    });

    this.shadowRoot?.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.loadDraft();
    });
  }

  private renderContent() {
    const content = this.shadowRoot?.getElementById('content');
    if (!content) return;

    if (!this.draft || (!this.draft.content && !this.draft.summary && !this.draft.keyDecisions)) {
      content.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>No result draft yet</p>
          <p style="font-size: var(--text-xs); margin-top: var(--space-2);">
            The secretary will compile results as the discussion progresses
          </p>
        </div>
      `;
      return;
    }

    const formattedContent = this.draft.content 
      ? parseBasicFormatting(escapeHtml(this.draft.content))
      : '';

    const keyDecisions = this.draft.keyDecisions
      ? this.draft.keyDecisions.split('\n').filter(line => line.trim())
      : [];

    content.innerHTML = `
      ${this.draft.summary ? `
        <div class="section">
          <div class="section-title">Summary</div>
          <div class="section-content">${parseBasicFormatting(escapeHtml(this.draft.summary))}</div>
        </div>
      ` : ''}

      ${keyDecisions.length > 0 ? `
        <div class="section">
          <div class="section-title">Key Decisions</div>
          <div class="section-content">
            <ul class="key-decisions">
              ${keyDecisions.map(d => `<li>${escapeHtml(d.replace(/^[-•*]\s*/, ''))}</li>`).join('')}
            </ul>
          </div>
        </div>
      ` : ''}

      ${formattedContent ? `
        <div class="section">
          <div class="section-title">Full Content</div>
          <div class="section-content">${formattedContent}</div>
        </div>
      ` : ''}

      <div class="export-buttons">
        <button class="export-btn" id="export-md">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Markdown
        </button>
        <button class="export-btn" id="export-json">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          JSON
        </button>
      </div>

      <div class="updated-at">
        Last updated: ${new Date(this.draft.updatedAt).toLocaleString()}
      </div>
    `;

    // Export handlers
    content.querySelector('#export-md')?.addEventListener('click', () => {
      if (this.draft) {
        const md = `# Discussion Result\n\n## Summary\n${this.draft.summary}\n\n## Key Decisions\n${this.draft.keyDecisions}\n\n## Full Content\n${this.draft.content}`;
        downloadAsFile(md, 'result-draft.md', 'text/markdown');
      }
    });

    content.querySelector('#export-json')?.addEventListener('click', () => {
      if (this.draft) {
        downloadAsFile(JSON.stringify(this.draft, null, 2), 'result-draft.json', 'application/json');
      }
    });
  }
}

customElements.define('result-draft', ResultDraftPanel);

