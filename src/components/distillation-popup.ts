// ============================================
// AI Brainstorm - Distillation Popup Component
// ============================================
// Displays the context/distillation information used to generate an agent message

import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { escapeHtml } from '../utils/helpers';
import type { ContextSnapshot, PinnedFact } from '../types';

export class DistillationPopup extends HTMLElement {
  private snapshot: ContextSnapshot | null = null;

  static get observedAttributes() {
    return ['open'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string, _newValue: string) {
    if (name === 'open') {
      this.render();
    }
  }

  /**
   * Show the popup with the given context snapshot
   */
  show(snapshot: ContextSnapshot): void {
    this.snapshot = snapshot;
    this.setAttribute('open', 'true');
  }

  /**
   * Close the popup
   */
  close(): void {
    this.setAttribute('open', 'false');
  }

  /**
   * Get category badge color
   */
  private getCategoryColor(category: PinnedFact['category']): string {
    switch (category) {
      case 'decision':
        return 'var(--color-success)';
      case 'constraint':
        return 'var(--color-warning)';
      case 'definition':
        return 'var(--color-primary)';
      case 'consensus':
        return 'var(--color-success)';
      case 'disagreement':
        return 'var(--color-error)';
      case 'action':
        return 'var(--color-secondary)';
      default:
        return 'var(--color-text-tertiary)';
    }
  }

  /**
   * Format pinned fact category name
   */
  private formatCategory(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';
    const snapshot = this.snapshot;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: var(--z-modal, 600);
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
          max-width: 600px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          box-shadow: 
            0 0 0 1px rgba(255, 255, 255, 0.05),
            0 20px 50px -10px rgba(0, 0, 0, 0.5);
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
          gap: var(--space-3);
          padding: var(--space-4) var(--space-5);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-tertiary);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .modal-header h2 {
          margin: 0;
          font-size: var(--text-base);
          color: var(--color-text-primary);
          font-weight: var(--font-semibold);
        }

        .header-icon {
          width: 20px;
          height: 20px;
          color: var(--color-primary);
        }

        .close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
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

        .close-btn svg {
          width: 18px;
          height: 18px;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4) var(--space-5);
        }

        .status-bar {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
          flex-wrap: wrap;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }

        .status-badge.active {
          background: var(--color-primary-dim);
          border-color: var(--color-primary);
          color: var(--color-primary);
        }

        .status-badge.inactive {
          opacity: 0.6;
        }

        .status-badge svg {
          width: 12px;
          height: 12px;
        }

        .section {
          margin-bottom: var(--space-4);
        }

        .section:last-child {
          margin-bottom: 0;
        }

        .section-title {
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--space-2);
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .section-title svg {
          width: 14px;
          height: 14px;
        }

        .section-content {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
        }

        .summary-text {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .facts-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .fact-item {
          display: flex;
          gap: var(--space-2);
          padding: var(--space-2);
          background: var(--color-bg-secondary);
          border-radius: var(--radius-sm);
        }

        .fact-category {
          flex-shrink: 0;
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          text-transform: capitalize;
        }

        .fact-content {
          flex: 1;
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          line-height: 1.4;
        }

        .fact-source {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-top: var(--space-1);
        }

        .list-items {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .list-item {
          display: flex;
          align-items: flex-start;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          line-height: 1.4;
        }

        .list-item::before {
          content: "•";
          color: var(--color-primary);
          font-weight: bold;
          flex-shrink: 0;
        }

        .empty-state {
          text-align: center;
          padding: var(--space-6);
          color: var(--color-text-tertiary);
        }

        .empty-state svg {
          width: 48px;
          height: 48px;
          margin-bottom: var(--space-3);
          opacity: 0.5;
        }

        .empty-state p {
          margin: 0;
          font-size: var(--text-sm);
        }

        /* Responsive */
        @media (max-width: 640px) {
          .modal-content {
            max-width: 100%;
            max-height: 90vh;
            margin: var(--space-2);
          }

          .modal-header {
            padding: var(--space-3) var(--space-4);
          }

          .modal-body {
            padding: var(--space-3) var(--space-4);
          }
        }
      </style>

      <div class="modal-overlay" id="overlay">
        <div class="modal-content">
          <div class="modal-header">
            <div class="header-left">
              <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
                <path d="M12 6a4 4 0 0 0-4 4c0 2 2 4 4 4s4-2 4-4a4 4 0 0 0-4-4z"/>
                <path d="M19.5 17.5A8.5 8.5 0 0 0 12 14a8.5 8.5 0 0 0-7.5 3.5"/>
              </svg>
              <h2>Context Used for This Response</h2>
            </div>
            <button class="close-btn" id="close-btn" title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="modal-body">
            ${this.renderContent(snapshot)}
          </div>
        </div>
      </div>
    `;

    this.setupEventHandlers();
  }

  private renderContent(snapshot: ContextSnapshot | null): string {
    if (!snapshot) {
      return `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>No context information available</p>
        </div>
      `;
    }

    const sections: string[] = [];

    // Status badges
    sections.push(`
      <div class="status-bar">
        <span class="status-badge ${snapshot.distilledMemoryUsed ? 'active' : 'inactive'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          ${snapshot.distilledMemoryUsed ? 'Distillation Used' : 'No Distillation'}
        </span>
        <span class="status-badge ${snapshot.notebookUsed ? 'active' : 'inactive'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          ${snapshot.notebookUsed ? 'Notebook Used' : 'No Notebook'}
        </span>
        <span class="status-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${snapshot.messagesIncludedCount} messages
        </span>
      </div>
    `);

    // Distilled Summary
    if (snapshot.distilledSummary) {
      sections.push(`
        <div class="section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Distilled Summary
          </div>
          <div class="section-content">
            <div class="summary-text">${escapeHtml(snapshot.distilledSummary)}</div>
          </div>
        </div>
      `);
    }

    // Current Stance
    if (snapshot.currentStance) {
      sections.push(`
        <div class="section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Current Discussion State
          </div>
          <div class="section-content">
            <div class="summary-text">${escapeHtml(snapshot.currentStance)}</div>
          </div>
        </div>
      `);
    }

    // Pinned Facts
    if (snapshot.pinnedFacts && snapshot.pinnedFacts.length > 0) {
      const factsHtml = snapshot.pinnedFacts.map(fact => `
        <div class="fact-item">
          <span class="fact-category" style="background: ${this.getCategoryColor(fact.category)}20; color: ${this.getCategoryColor(fact.category)};">
            ${this.formatCategory(fact.category)}
          </span>
          <div>
            <div class="fact-content">${escapeHtml(fact.content)}</div>
            ${fact.source ? `<div class="fact-source">From: ${escapeHtml(fact.source)} (Round ${fact.round})</div>` : ''}
          </div>
        </div>
      `).join('');

      sections.push(`
        <div class="section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Pinned Facts (${snapshot.pinnedFacts.length})
          </div>
          <div class="section-content">
            <div class="facts-list">${factsHtml}</div>
          </div>
        </div>
      `);
    }

    // Key Decisions
    if (snapshot.keyDecisions && snapshot.keyDecisions.length > 0) {
      const decisionsHtml = snapshot.keyDecisions.map(decision => `
        <div class="list-item">${escapeHtml(decision)}</div>
      `).join('');

      sections.push(`
        <div class="section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 11 12 14 22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
            Key Decisions (${snapshot.keyDecisions.length})
          </div>
          <div class="section-content">
            <div class="list-items">${decisionsHtml}</div>
          </div>
        </div>
      `);
    }

    // Open Questions
    if (snapshot.openQuestions && snapshot.openQuestions.length > 0) {
      const questionsHtml = snapshot.openQuestions.map(question => `
        <div class="list-item">${escapeHtml(question)}</div>
      `).join('');

      sections.push(`
        <div class="section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Open Questions (${snapshot.openQuestions.length})
          </div>
          <div class="section-content">
            <div class="list-items">${questionsHtml}</div>
          </div>
        </div>
      `);
    }

    // If no distillation content, show a simple message
    if (!snapshot.distilledMemoryUsed && !snapshot.distilledSummary && (!snapshot.pinnedFacts || snapshot.pinnedFacts.length === 0)) {
      sections.push(`
        <div class="section">
          <div class="section-content">
            <div class="summary-text" style="text-align: center; color: var(--color-text-tertiary);">
              No distilled context was used for this response.
              The agent received ${snapshot.messagesIncludedCount} raw message${snapshot.messagesIncludedCount !== 1 ? 's' : ''} from the conversation.
            </div>
          </div>
        </div>
      `);
    }

    return sections.join('');
  }

  private setupEventHandlers() {
    // Click overlay to close
    this.shadowRoot?.getElementById('overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'overlay') {
        this.close();
      }
    });

    // Close button
    this.shadowRoot?.getElementById('close-btn')?.addEventListener('click', () => {
      this.close();
    });

    // Escape key to close
    this.shadowRoot?.querySelector('.modal-overlay')?.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.close();
      }
    });
  }
}

customElements.define('distillation-popup', DistillationPopup);

