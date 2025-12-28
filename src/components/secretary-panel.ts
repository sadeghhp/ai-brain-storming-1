// ============================================
// AI Brainstorm - Secretary Panel Component
// Version: 2.0.0
// ============================================

import { resultDraftStorage, messageStorage, agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { copyToClipboard, downloadAsFile, parseBasicFormatting, escapeHtml } from '../utils/helpers';
import type { ResultDraft, Message, Agent } from '../types';

// Color palette for theme tags (matching variables.css)
const THEME_COLORS = [
  '#00f5ff', '#8b5cf6', '#f43f5e', '#22c55e', '#f59e0b',
  '#3b82f6', '#ec4899', '#14b8a6', '#f97316', '#a855f7'
];

/**
 * Secretary Panel Component
 * Displays live round summaries and structured final results from the secretary agent
 * Enhanced with agent colors for better readability
 */
export class SecretaryPanel extends HTMLElement {
  private draft: ResultDraft | null = null;
  private conversationId: string | null = null;
  private roundSummaryMessages: Message[] = [];
  private activeSection: string = 'summaries';
  agents: Map<string, Agent> = new Map();

  static get observedAttributes() {
    return ['conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    await this.loadData();
    this.setupEventListeners();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'conversation-id' && oldValue !== newValue) {
      this.conversationId = newValue;
      this.loadData();
    }
  }

  private async loadData() {
    this.conversationId = this.getAttribute('conversation-id');
    if (!this.conversationId) return;

    // Load agents for color mapping
    const agentList = await agentStorage.getByConversation(this.conversationId);
    this.agents = new Map(agentList.filter(a => !a.isSecretary).map(a => [a.id, a]));

    // Load result draft
    this.draft = await resultDraftStorage.get(this.conversationId) || null;

    // Load round summary messages (type: 'summary')
    const allMessages = await messageStorage.getByConversation(this.conversationId);
    this.roundSummaryMessages = allMessages.filter(m => m.type === 'summary');

    this.renderContent();
  }

  private setupEventListeners() {
    // Listen for draft updates
    eventBus.on('draft:updated', (draft: ResultDraft) => {
      if (draft.conversationId === this.conversationId) {
        this.draft = draft;
        this.renderContent();
      }
    });

    // Listen for new messages (round summaries)
    eventBus.on('message:created', (message: Message) => {
      if (message.conversationId === this.conversationId && message.type === 'summary') {
        this.roundSummaryMessages.push(message);
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
          color: var(--color-secondary);
        }

        .secretary-badge {
          background: var(--color-secondary);
          color: white;
          font-size: var(--text-xs);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-weight: var(--font-medium);
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

        .tabs {
          display: flex;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-tertiary);
        }

        .tab {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--color-text-secondary);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .tab:hover {
          color: var(--color-text-primary);
          background: var(--color-surface);
        }

        .tab.active {
          color: var(--color-secondary);
          border-bottom-color: var(--color-secondary);
        }

        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
        }

        .tab-content {
          display: none;
        }

        .tab-content.active {
          display: block;
        }

        /* Agent Legend */
        .agent-legend {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          padding: var(--space-3);
          margin-bottom: var(--space-4);
          background: linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          backdrop-filter: blur(8px);
        }

        .agent-legend-title {
          width: 100%;
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--space-1);
        }

        .agent-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          background: color-mix(in srgb, var(--agent-color) 15%, transparent);
          color: var(--agent-color);
          border: 1px solid color-mix(in srgb, var(--agent-color) 30%, transparent);
          transition: all var(--transition-fast);
        }

        .agent-chip:hover {
          background: color-mix(in srgb, var(--agent-color) 25%, transparent);
          transform: translateY(-1px);
        }

        .agent-chip::before {
          content: '';
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--agent-color);
          box-shadow: 0 0 6px color-mix(in srgb, var(--agent-color) 50%, transparent);
        }

        /* Agent name mentions in content */
        .agent-mention {
          font-weight: var(--font-semibold);
          padding: 0 2px;
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--mention-color) 12%, transparent);
          color: var(--mention-color);
          transition: all var(--transition-fast);
        }

        .agent-mention:hover {
          background: color-mix(in srgb, var(--mention-color) 20%, transparent);
        }

        /* Round Summary Cards - Enhanced */
        .round-summary {
          margin-bottom: var(--space-4);
          background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          backdrop-filter: blur(8px);
          transition: all var(--transition-normal);
          position: relative;
        }

        .round-summary::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, var(--round-color-1, var(--color-primary)) 0%, var(--round-color-2, var(--color-secondary)) 100%);
          opacity: 0.8;
        }

        .round-summary:hover {
          border-color: var(--color-border-strong);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .round-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          padding-left: calc(var(--space-4) + 3px);
          background: linear-gradient(90deg, rgba(255,255,255,0.02) 0%, transparent 100%);
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .round-header:hover {
          background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
        }

        .round-number {
          font-size: var(--text-sm);
          font-weight: var(--font-bold);
          color: var(--color-primary);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .round-number svg {
          opacity: 0.7;
        }

        .round-time {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          padding: 2px 8px;
          background: var(--color-surface);
          border-radius: var(--radius-full);
        }

        .round-content {
          padding: var(--space-4);
          padding-left: calc(var(--space-4) + 3px);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          line-height: var(--leading-relaxed);
        }

        /* Section Cards - Enhanced with glassmorphism */
        .section {
          margin-bottom: var(--space-4);
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          padding: var(--space-2) 0;
        }

        .section-title {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: var(--space-2);
          transition: color var(--transition-fast);
        }

        .section-title:hover {
          color: var(--color-text-secondary);
        }

        .section-title svg {
          transition: transform var(--transition-fast);
        }

        .section-title.collapsed svg {
          transform: rotate(-90deg);
        }

        .section-content {
          background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          line-height: var(--leading-relaxed);
          backdrop-filter: blur(8px);
          transition: all var(--transition-fast);
        }

        .section-content:hover {
          border-color: var(--color-border-strong);
        }

        .section-content.collapsed {
          display: none;
        }

        /* Theme Tags - Colorful */
        .themes-list {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
          padding: 0;
          margin: 0;
          list-style: none;
        }

        .theme-tag {
          padding: var(--space-1) var(--space-3);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          background: color-mix(in srgb, var(--tag-color, var(--color-secondary)) 20%, transparent);
          color: var(--tag-color, var(--color-secondary));
          border: 1px solid color-mix(in srgb, var(--tag-color, var(--color-secondary)) 35%, transparent);
          transition: all var(--transition-fast);
          cursor: default;
        }

        .theme-tag:hover {
          background: color-mix(in srgb, var(--tag-color, var(--color-secondary)) 30%, transparent);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px color-mix(in srgb, var(--tag-color, var(--color-secondary)) 25%, transparent);
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

        .export-buttons {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-4);
          padding-top: var(--space-4);
          border-top: 1px solid var(--color-border);
        }

        .export-btn {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
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
          background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
          transform: translateY(-1px);
        }

        .export-btn:active {
          transform: translateY(0);
        }

        .updated-at {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          text-align: center;
          margin-top: var(--space-3);
          padding: var(--space-2);
          background: var(--color-surface);
          border-radius: var(--radius-md);
        }

        .neutral-notice {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(139, 92, 246, 0.03) 100%);
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-4);
        }

        .neutral-notice svg {
          flex-shrink: 0;
          color: var(--color-secondary);
        }

        .progress-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2);
          background: var(--color-primary-dim);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          color: var(--color-primary);
          margin-bottom: var(--space-3);
        }

        .progress-indicator.active {
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        /* Smooth scrollbar */
        .panel-content::-webkit-scrollbar {
          width: 6px;
        }

        .panel-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .panel-content::-webkit-scrollbar-thumb {
          background: var(--color-border-strong);
          border-radius: var(--radius-full);
        }

        .panel-content::-webkit-scrollbar-thumb:hover {
          background: var(--color-text-tertiary);
        }
      </style>

      <div class="panel-header">
        <div class="panel-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="8.5" cy="7" r="4"/>
            <path d="M20 8v6M23 11h-6"/>
          </svg>
          <span class="secretary-badge">Secretary</span>
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

      <div class="tabs">
        <button class="tab active" data-tab="summaries">Round Summaries</button>
        <button class="tab" data-tab="result">Final Result</button>
      </div>

      <div class="panel-content" id="content">
        <!-- Content rendered dynamically -->
      </div>
    `;

    this.setupButtonHandlers();
  }

  private setupButtonHandlers() {
    // Copy button
    this.shadowRoot?.getElementById('copy-btn')?.addEventListener('click', async () => {
      const content = this.buildExportContent();
      if (content) {
        await copyToClipboard(content);
      }
    });

    // Refresh button
    this.shadowRoot?.getElementById('refresh-btn')?.addEventListener('click', () => {
      this.loadData();
    });

    // Tab switching
    this.shadowRoot?.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabName = target.dataset.tab;
        if (tabName) {
          this.activeSection = tabName;
          this.updateTabs();
          this.renderContent();
        }
      });
    });
  }

  private updateTabs() {
    this.shadowRoot?.querySelectorAll('.tab').forEach(tab => {
      const tabName = (tab as HTMLElement).dataset.tab;
      tab.classList.toggle('active', tabName === this.activeSection);
    });
  }

  private renderContent() {
    const content = this.shadowRoot?.getElementById('content');
    if (!content) return;

    if (this.activeSection === 'summaries') {
      this.renderRoundSummaries(content);
    } else {
      this.renderFinalResult(content);
    }
  }

  private renderRoundSummaries(container: HTMLElement) {
    if (this.roundSummaryMessages.length === 0 && (!this.draft?.roundSummaries || this.draft.roundSummaries.length === 0)) {
      container.innerHTML = `
        ${this.renderAgentLegend()}
        <div class="neutral-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          The secretary observes and records without expressing opinions
        </div>
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>No round summaries yet</p>
          <p style="font-size: var(--text-xs); margin-top: var(--space-2);">
            Summaries will appear after each round completes
          </p>
        </div>
      `;
      return;
    }

    // Combine message-based summaries and stored roundSummaries
    const summaries: Array<{ round: number; content: string; time?: number }> = [];

    // From messages
    this.roundSummaryMessages.forEach(msg => {
      summaries.push({
        round: msg.round,
        content: msg.content,
        time: msg.createdAt,
      });
    });

    // From draft (if messages not available, use stored roundSummaries)
    if (this.draft?.roundSummaries && this.roundSummaryMessages.length === 0) {
      this.draft.roundSummaries.forEach((content, index) => {
        summaries.push({
          round: index,
          content,
        });
      });
    }

    // Sort by round (newest first)
    summaries.sort((a, b) => b.round - a.round);

    container.innerHTML = `
      ${this.renderAgentLegend()}
      <div class="neutral-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        The secretary observes and records without expressing opinions
      </div>
      ${summaries.map((s) => {
        const colors = this.getRoundColors(s.round);
        const cleanContent = s.content.replace(/^\*\*Round \d+ Summary:\*\*\n\n/, '');
        const formattedContent = this.highlightAgentNames(parseBasicFormatting(escapeHtml(cleanContent)));
        
        return `
          <div class="round-summary" style="--round-color-1: ${colors.color1}; --round-color-2: ${colors.color2};">
            <div class="round-header">
              <span class="round-number">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                Round ${s.round}
              </span>
              ${s.time ? `<span class="round-time">${new Date(s.time).toLocaleTimeString()}</span>` : ''}
            </div>
            <div class="round-content">
              ${formattedContent}
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  private renderFinalResult(container: HTMLElement) {
    if (!this.draft || !this.hasStructuredContent()) {
      container.innerHTML = `
        ${this.renderAgentLegend()}
        <div class="neutral-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          Final results are generated when the conversation ends
        </div>
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>No final result yet</p>
          <p style="font-size: var(--text-xs); margin-top: var(--space-2);">
            Complete the conversation to generate the final result
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      ${this.renderAgentLegend()}
      <div class="neutral-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        This is an objective summary based on what was discussed
      </div>

      ${this.draft.executiveSummary ? this.renderSectionWithHighlights('Executive Summary', this.draft.executiveSummary) : ''}
      
      ${this.draft.themes && this.draft.themes.length > 0 ? `
        <div class="section">
          <div class="section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            Main Themes
          </div>
          <div class="section-content">
            <ul class="themes-list">
              ${this.draft.themes.map((t, i) => `
                <li class="theme-tag" style="--tag-color: ${this.getThemeColor(i)};">
                  ${escapeHtml(t)}
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      ` : ''}

      ${this.draft.consensusAreas ? this.renderSectionWithHighlights('Areas of Consensus', this.draft.consensusAreas) : ''}
      ${this.draft.disagreements ? this.renderSectionWithHighlights('Areas of Disagreement', this.draft.disagreements) : ''}
      ${this.draft.recommendations ? this.renderSectionWithHighlights('Recommendations', this.draft.recommendations) : ''}
      ${this.draft.actionItems ? this.renderSectionWithHighlights('Action Items', this.draft.actionItems) : ''}
      ${this.draft.openQuestions ? this.renderSectionWithHighlights('Open Questions', this.draft.openQuestions) : ''}

      <div class="export-buttons">
        <button class="export-btn" id="export-md">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export Markdown
        </button>
        <button class="export-btn" id="export-json">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export JSON
        </button>
      </div>

      <div class="updated-at">
        Last updated: ${new Date(this.draft.updatedAt).toLocaleString()}
      </div>
    `;

    // Setup export handlers
    container.querySelector('#export-md')?.addEventListener('click', () => {
      const content = this.buildExportContent();
      if (content) {
        downloadAsFile(content, 'secretary-result.md', 'text/markdown');
      }
    });

    container.querySelector('#export-json')?.addEventListener('click', () => {
      if (this.draft) {
        downloadAsFile(JSON.stringify(this.draft, null, 2), 'secretary-result.json', 'application/json');
      }
    });
  }

  /**
   * Render a section with agent name highlighting
   */
  private renderSectionWithHighlights(title: string, content: string): string {
    if (!content || content.trim() === '') return '';
    
    const formattedContent = this.highlightAgentNames(parseBasicFormatting(escapeHtml(content)));
    
    return `
      <div class="section">
        <div class="section-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
          ${escapeHtml(title)}
        </div>
        <div class="section-content">
          ${formattedContent}
        </div>
      </div>
    `;
  }

  private hasStructuredContent(): boolean {
    if (!this.draft) return false;
    return !!(
      this.draft.executiveSummary ||
      (this.draft.themes && this.draft.themes.length > 0) ||
      this.draft.consensusAreas ||
      this.draft.disagreements ||
      this.draft.recommendations ||
      this.draft.actionItems ||
      this.draft.openQuestions
    );
  }

  private buildExportContent(): string {
    const parts: string[] = [];

    parts.push('# Secretary Report\n');

    if (this.draft?.executiveSummary) {
      parts.push('## Executive Summary\n');
      parts.push(this.draft.executiveSummary + '\n');
    }

    if (this.draft?.themes && this.draft.themes.length > 0) {
      parts.push('## Main Themes\n');
      this.draft.themes.forEach(t => parts.push(`- ${t}`));
      parts.push('');
    }

    if (this.draft?.consensusAreas) {
      parts.push('## Areas of Consensus\n');
      parts.push(this.draft.consensusAreas + '\n');
    }

    if (this.draft?.disagreements) {
      parts.push('## Areas of Disagreement\n');
      parts.push(this.draft.disagreements + '\n');
    }

    if (this.draft?.recommendations) {
      parts.push('## Recommendations\n');
      parts.push(this.draft.recommendations + '\n');
    }

    if (this.draft?.actionItems) {
      parts.push('## Action Items\n');
      parts.push(this.draft.actionItems + '\n');
    }

    if (this.draft?.openQuestions) {
      parts.push('## Open Questions\n');
      parts.push(this.draft.openQuestions + '\n');
    }

    if (this.roundSummaryMessages.length > 0 || (this.draft?.roundSummaries && this.draft.roundSummaries.length > 0)) {
      parts.push('## Round Summaries\n');
      
      if (this.roundSummaryMessages.length > 0) {
        this.roundSummaryMessages.forEach(msg => {
          parts.push(`### Round ${msg.round}\n`);
          parts.push(msg.content.replace(/^\*\*Round \d+ Summary:\*\*\n\n/, '') + '\n');
        });
      } else if (this.draft?.roundSummaries) {
        this.draft.roundSummaries.forEach((content, i) => {
          parts.push(`### Round ${i}\n`);
          parts.push(content + '\n');
        });
      }
    }

    return parts.join('\n');
  }

  /**
   * Render agent color legend showing all participating agents
   */
  private renderAgentLegend(): string {
    if (this.agents.size === 0) return '';

    const agentChips = Array.from(this.agents.values())
      .sort((a, b) => a.order - b.order)
      .map(agent => `
        <span class="agent-chip" style="--agent-color: ${agent.color};">
          ${escapeHtml(agent.name)}
        </span>
      `)
      .join('');

    return `
      <div class="agent-legend">
        <div class="agent-legend-title">Participants</div>
        ${agentChips}
      </div>
    `;
  }

  /**
   * Highlight agent names in content with their respective colors
   */
  private highlightAgentNames(content: string): string {
    if (this.agents.size === 0) return content;

    let result = content;
    
    // Sort agents by name length (longest first) to avoid partial replacements
    const sortedAgents = Array.from(this.agents.values())
      .sort((a, b) => b.name.length - a.name.length);

    for (const agent of sortedAgents) {
      // Match agent name followed by word boundary (not in middle of word)
      // Using a regex that handles common patterns like "AgentName argued", "AgentName's", etc.
      const regex = new RegExp(`\\b(${this.escapeRegex(agent.name)})\\b`, 'g');
      result = result.replace(regex, `<span class="agent-mention" style="--mention-color: ${agent.color};">$1</span>`);
    }

    return result;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get gradient colors for a round based on participating agents
   * Returns two colors for gradient effect
   */
  private getRoundColors(roundIndex: number): { color1: string; color2: string } {
    const agentList = Array.from(this.agents.values());
    if (agentList.length === 0) {
      return { color1: 'var(--color-primary)', color2: 'var(--color-secondary)' };
    }

    // Rotate through agent colors based on round
    const idx1 = roundIndex % agentList.length;
    const idx2 = (roundIndex + 1) % agentList.length;
    
    return {
      color1: agentList[idx1]?.color || 'var(--color-primary)',
      color2: agentList[idx2]?.color || 'var(--color-secondary)'
    };
  }

  private getThemeColor(index: number): string {
    return THEME_COLORS[index % THEME_COLORS.length];
  }
}

customElements.define('secretary-panel', SecretaryPanel);

