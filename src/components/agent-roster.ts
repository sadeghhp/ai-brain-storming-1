// ============================================
// AI Brainstorm - Agent Roster Component
// ============================================

import { agentStorage, conversationStorage, providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { Agent, Conversation, LLMProvider, TurnQueueState } from '../types';
import './agent-editor-modal';
import type { AgentEditorModal, AgentEditorResult } from './agent-editor-modal';

type AgentStatus = 'idle' | 'thinking' | 'speaking';
type TurnPosition = 'current' | 'next' | 'waiting' | 'completed' | null;

export class AgentRoster extends HTMLElement {
  private agents: Agent[] = [];
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private agentTurnPositions: Map<string, TurnPosition> = new Map();
  private conversationId: string | null = null;
  private conversation: Conversation | null = null;
  private providers: LLMProvider[] = [];
  private turnProgress: { completed: number; total: number } = { completed: 0, total: 0 };
  private hoveredAgentId: string | null = null;

  static get observedAttributes() {
    return ['conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    await this.loadAgents();
    this.setupEventListeners();
    this.setupHoverTooltip();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'conversation-id' && oldValue !== newValue) {
      this.conversationId = newValue;
      this.loadAgents();
    }
  }

  private async loadAgents() {
    this.conversationId = this.getAttribute('conversation-id');
    if (!this.conversationId) return;

    this.conversation = await conversationStorage.getById(this.conversationId) || null;
    this.agents = await agentStorage.getByConversation(this.conversationId);
    this.providers = await providerStorage.getAll();
    this.agents.forEach(a => this.agentStatuses.set(a.id, 'idle'));
    this.renderAgents();
  }

  private isEditable(): boolean {
    return this.conversation?.status !== 'running';
  }

  private setupEventListeners() {
    eventBus.on('agent:thinking', (agentId: string) => {
      this.agentStatuses.set(agentId, 'thinking');
      this.agentTurnPositions.set(agentId, 'current');
      this.updateAgentStatus(agentId);
      this.updateTurnPosition(agentId, 'current');
    });

    eventBus.on('agent:speaking', (agentId: string) => {
      this.agentStatuses.set(agentId, 'speaking');
      this.agentTurnPositions.set(agentId, 'current');
      this.updateAgentStatus(agentId);
    });

    eventBus.on('agent:idle', (agentId: string) => {
      this.agentStatuses.set(agentId, 'idle');
      this.agentTurnPositions.set(agentId, 'completed');
      this.updateAgentStatus(agentId);
      this.updateTurnPosition(agentId, 'completed');
    });

    // Update to speaking when streaming starts
    eventBus.on('stream:chunk', ({ agentId }) => {
      if (this.agentStatuses.get(agentId) !== 'speaking') {
        this.agentStatuses.set(agentId, 'speaking');
        this.updateAgentStatus(agentId);
      }
    });

    // Reset to idle when streaming completes
    eventBus.on('stream:complete', ({ agentId }) => {
      this.agentStatuses.set(agentId, 'idle');
      this.agentTurnPositions.set(agentId, 'completed');
      this.updateAgentStatus(agentId);
      this.updateTurnPosition(agentId, 'completed');
      // Note: Progress is updated from queue events, not here (avoid double-counting)
    });

    // Listen for turn queue updates
    eventBus.on('turn:queued', (state: TurnQueueState) => {
      if (state.conversationId === this.conversationId) {
        this.updateFromQueueState(state);
      }
    });

    eventBus.on('turn:order-updated', (state: TurnQueueState) => {
      if (state.conversationId === this.conversationId) {
        this.updateFromQueueState(state);
      }
    });

    // Refresh when conversation status changes
    eventBus.on('conversation:started', (id) => {
      if (id === this.conversationId) {
        this.turnProgress = { completed: 0, total: this.agents.filter(a => !a.isSecretary).length };
        this.agentTurnPositions.clear();
        this.loadAgents();
      }
    });
    eventBus.on('conversation:paused', () => this.loadAgents());
    eventBus.on('conversation:stopped', () => this.loadAgents());
    eventBus.on('conversation:updated', () => this.loadAgents());
    eventBus.on('conversation:reset', (id) => {
      if (id === this.conversationId) {
        this.turnProgress = { completed: 0, total: 0 };
        this.agentTurnPositions.clear();
        this.loadAgents();
      }
    });
  }

  private updateFromQueueState(state: TurnQueueState) {
    this.turnProgress = { completed: state.currentIndex, total: state.totalAgents };
    
    // Update progress display incrementally (no full re-render)
    const progressContainer = this.shadowRoot?.getElementById('progress-container') as HTMLElement | null;
    const progressFill = this.shadowRoot?.getElementById('progress-fill') as HTMLElement | null;
    const progressText = this.shadowRoot?.getElementById('turn-progress') as HTMLElement | null;

    if (progressContainer && this.conversation?.status === 'running') {
      progressContainer.style.display = 'flex';
      const percent = state.totalAgents > 0 ? (state.currentIndex / state.totalAgents) * 100 : 0;
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${state.currentIndex}/${state.totalAgents}`;
    } else if (progressContainer) {
      progressContainer.style.display = 'none';
    }

    // Compute turn positions from queue state
    const positions = new Map<string, TurnPosition>();
    state.queue.forEach((item, index) => {
      if (item.status === 'current') {
        positions.set(item.agentId, 'current');
        // Mark next agent
        if (index + 1 < state.queue.length) {
          positions.set(state.queue[index + 1].agentId, 'next');
        }
      } else if (item.status === 'completed') {
        positions.set(item.agentId, 'completed');
      } else {
        // Only set waiting if not already marked as next
        if (!positions.has(item.agentId)) {
          positions.set(item.agentId, null);
        }
      }
    });

    // Update turn positions incrementally (no full re-render)
    positions.forEach((pos, agentId) => {
      this.agentTurnPositions.set(agentId, pos);
      this.updateTurnPosition(agentId, pos);
    });
  }

  private updateTurnPosition(agentId: string, position: TurnPosition) {
    const card = this.shadowRoot?.querySelector(`.agent-card[data-id="${agentId}"]`);
    if (!card) return;

    // Update turn badge
    let turnBadge = card.querySelector('.turn-badge') as HTMLElement;
    
    if (position === 'current') {
      if (!turnBadge) {
        turnBadge = document.createElement('div');
        turnBadge.className = 'turn-badge current-turn';
        card.appendChild(turnBadge);
      }
      turnBadge.className = 'turn-badge current-turn';
      turnBadge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="8"/>
        </svg>
        NOW
      `;
    } else if (position === 'next') {
      if (!turnBadge) {
        turnBadge = document.createElement('div');
        turnBadge.className = 'turn-badge next-turn';
        card.appendChild(turnBadge);
      }
      turnBadge.className = 'turn-badge next-turn';
      turnBadge.textContent = 'NEXT';
    } else if (position === 'completed') {
      if (turnBadge) {
        turnBadge.className = 'turn-badge completed-turn';
        turnBadge.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
      }
    } else if (turnBadge) {
      turnBadge.remove();
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        :host {
          display: block;
          padding: var(--space-3) var(--space-6);
          background: var(--color-bg-secondary);
          border-bottom: 1px solid var(--color-border);
        }

        .roster {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          overflow-y: visible;
          padding-top: 12px;
          padding-bottom: 24px;
        }

        .agent-card {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: all var(--transition-fast);
          flex-shrink: 0;
          position: relative;
        }

        .agent-card:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          z-index: 50;
        }

        .agent-card.editable:hover {
          border-color: var(--color-primary);
        }

        .agent-card.thinking {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px var(--color-primary-dim);
          animation: cardPulse 2s ease-in-out infinite;
        }

        .agent-card.speaking {
          border-color: var(--color-success);
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
          animation: cardGlow 1s ease-in-out infinite;
        }

        .agent-card.secretary {
          border-color: var(--color-secondary);
        }

        @keyframes cardPulse {
          0%, 100% { box-shadow: 0 0 0 2px var(--color-primary-dim); }
          50% { box-shadow: 0 0 0 4px var(--color-primary-dim), 0 0 12px var(--color-primary-dim); }
        }

        @keyframes cardGlow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2); }
          50% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.3), 0 0 8px rgba(34, 197, 94, 0.2); }
        }

        .agent-card .edit-indicator {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 20px;
          height: 20px;
          background: var(--color-primary);
          border-radius: var(--radius-full);
          display: none;
          align-items: center;
          justify-content: center;
          color: white;
          opacity: 0;
          transform: scale(0.8);
          transition: all var(--transition-fast);
        }

        .agent-card.editable:hover .edit-indicator {
          display: flex;
          opacity: 1;
          transform: scale(1);
        }

        .avatar {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: var(--font-bold);
          font-size: var(--text-xs);
          position: relative;
        }

        .status-dot {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid var(--color-bg-secondary);
          background: var(--color-text-tertiary);
          transition: all var(--transition-fast);
        }

        .status-dot.thinking {
          background: var(--color-primary);
          animation: statusPulse 1.5s ease-in-out infinite;
          box-shadow: 0 0 6px var(--color-primary);
        }

        .status-dot.speaking {
          background: var(--color-success);
          animation: statusPulse 0.8s ease-in-out infinite;
          box-shadow: 0 0 6px var(--color-success);
        }

        @keyframes statusPulse {
          0%, 100% { 
            opacity: 1; 
            transform: scale(1);
          }
          50% { 
            opacity: 0.7; 
            transform: scale(1.2);
          }
        }

        .status-label {
          position: absolute;
          bottom: -18px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 9px;
          font-weight: var(--font-medium);
          white-space: nowrap;
          padding: 1px 4px;
          border-radius: var(--radius-sm);
          opacity: 0;
          transition: opacity var(--transition-fast);
        }

        .agent-card.thinking .status-label,
        .agent-card.speaking .status-label {
          opacity: 1;
        }

        .status-label.thinking {
          color: var(--color-primary);
          background: var(--color-primary-dim);
        }

        .status-label.speaking {
          color: var(--color-success);
          background: rgba(34, 197, 94, 0.15);
        }

        .agent-info {
          display: flex;
          flex-direction: column;
        }

        .agent-name {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          white-space: nowrap;
        }

        .agent-role {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          white-space: nowrap;
        }

        .empty-roster {
          color: var(--color-text-tertiary);
          font-size: var(--text-sm);
          padding: var(--space-4);
          text-align: center;
        }

        /* Fixed-position hover tooltip (avoids overflow clipping from horizontal scroll containers) */
        .hover-tooltip {
          position: fixed;
          left: 0;
          top: 0;
          transform: translate(-9999px, -9999px);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border-strong);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          max-width: min(320px, calc(100vw - 24px));
          line-height: 1.2;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          opacity: 0;
          visibility: hidden;
          transition: opacity var(--transition-fast), transform var(--transition-fast);
          pointer-events: none;
          z-index: var(--z-tooltip, 9999);
          white-space: normal;
        }

        .hover-tooltip[data-open="true"] {
          opacity: 1;
          visibility: visible;
        }

        .hover-tooltip::after {
          content: '';
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
        }

        .hover-tooltip[data-placement="top"]::after {
          top: 100%;
          border-top-color: var(--color-border-strong);
        }

        .hover-tooltip[data-placement="bottom"]::after {
          bottom: 100%;
          border-bottom-color: var(--color-border-strong);
        }

        /* Turn position badges */
        .turn-badge {
          position: absolute;
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          padding: 2px 6px;
          border-radius: var(--radius-full);
          font-size: 8px;
          font-weight: var(--font-bold);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
          z-index: 5;
        }

        .turn-badge.current-turn {
          background: var(--color-success);
          color: white;
          animation: currentTurnPulse 2s ease-in-out infinite;
          --badge-color: var(--color-success);
        }

        .turn-badge.next-turn {
          background: var(--color-warning);
          color: var(--color-bg-primary);
        }

        .turn-badge.completed-turn {
          background: var(--color-surface);
          color: var(--color-success);
          border: 1px solid var(--color-success);
        }

        @keyframes currentTurnPulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            box-shadow: 0 0 0 0 var(--badge-color);
          }
          50% {
            transform: translateX(-50%) scale(1.05);
            box-shadow: 0 0 0 4px transparent;
          }
        }

        /* Progress indicator in roster header */
        .roster-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .roster-title {
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .turn-progress {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }

        .turn-progress-bar {
          width: 60px;
          height: 4px;
          background: var(--color-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .turn-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
          transition: width 0.3s ease;
        }
      </style>

      <div class="roster-header">
        <span class="roster-title">Agents</span>
        <div class="turn-progress" id="progress-container" style="display: none;">
          <div class="turn-progress-bar">
            <div class="turn-progress-fill" id="progress-fill" style="width: 0%"></div>
          </div>
          <span id="turn-progress">0/0</span>
        </div>
      </div>
      <div class="roster" id="roster">
        <div class="empty-roster">Loading agents...</div>
      </div>

      <agent-editor-modal id="agent-editor"></agent-editor-modal>
      <div class="hover-tooltip" id="hover-tooltip" aria-hidden="true"></div>
    `;

    this.setupAgentEditorHandlers();
  }

  private setupAgentEditorHandlers() {
    const agentEditor = this.shadowRoot?.getElementById('agent-editor') as AgentEditorModal;
    
    agentEditor?.addEventListener('agent:saved', async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { result, agentId } = customEvent.detail as { 
        result: AgentEditorResult; 
        agentId?: string;
      };

      if (agentId) {
        await agentStorage.update(agentId, {
          name: result.name,
          role: result.role,
          expertise: result.expertise,
          llmProviderId: result.llmProviderId,
          modelId: result.modelId,
          thinkingDepth: result.thinkingDepth,
          creativityLevel: result.creativityLevel,
          notebookUsage: result.notebookUsage,
        });
      }

      await this.loadAgents();
    });
  }

  private renderAgents() {
    const roster = this.shadowRoot?.getElementById('roster');
    const progressContainer = this.shadowRoot?.getElementById('progress-container');
    const progressFill = this.shadowRoot?.getElementById('progress-fill');
    const progressText = this.shadowRoot?.getElementById('turn-progress');
    
    if (!roster) return;

    if (this.agents.length === 0) {
      roster.innerHTML = `<div class="empty-roster">No agents in this conversation</div>`;
      if (progressContainer) progressContainer.style.display = 'none';
      return;
    }

    // Update progress display
    const nonSecretaryAgents = this.agents.filter(a => !a.isSecretary);
    if (progressContainer && this.conversation?.status === 'running') {
      progressContainer.style.display = 'flex';
      const percent = nonSecretaryAgents.length > 0 
        ? (this.turnProgress.completed / nonSecretaryAgents.length) * 100 
        : 0;
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = `${this.turnProgress.completed}/${nonSecretaryAgents.length}`;
    } else if (progressContainer) {
      progressContainer.style.display = 'none';
    }

    const editable = this.isEditable();

    roster.innerHTML = this.agents.map(agent => {
      const status = this.agentStatuses.get(agent.id) || 'idle';
      const turnPosition = this.agentTurnPositions.get(agent.id);
      const initials = agent.name.slice(0, 2).toUpperCase();
      const provider = this.providers.find(p => p.id === agent.llmProviderId);
      const model = provider?.models.find(m => m.id === agent.modelId);
      const tooltipText = editable 
        ? `Click to edit • ${model?.name || agent.modelId}` 
        : `${model?.name || agent.modelId} • Pause to edit`;
      const statusLabel = status === 'thinking' ? 'thinking...' : status === 'speaking' ? 'writing...' : '';
      const escapedTooltip = this.escapeHtml(tooltipText);

      return `
        <div class="agent-card ${status} ${agent.isSecretary ? 'secretary' : ''} ${editable ? 'editable' : ''}" 
             data-id="${agent.id}" 
             data-tooltip="${escapedTooltip}"
             title="">
          ${this.renderTurnBadge(turnPosition || null, agent.color)}
          ${editable ? `
            <div class="edit-indicator">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          ` : ''}
          <div class="avatar" style="background: ${agent.color}20; color: ${agent.color};">
            ${initials}
            <div class="status-dot ${status}" style="${status !== 'idle' ? `background: ${agent.color}; box-shadow: 0 0 6px ${agent.color};` : ''}"></div>
            <span class="status-label ${status}" style="${status === 'thinking' ? `color: ${agent.color}; background: ${agent.color}20;` : status === 'speaking' ? `color: ${agent.color}; background: ${agent.color}20;` : ''}">${statusLabel}</span>
          </div>
          <div class="agent-info">
            <span class="agent-name">${agent.name}</span>
            <span class="agent-role">${agent.isSecretary ? 'Secretary' : agent.role}</span>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers for editable cards
    this.shadowRoot?.querySelectorAll('.agent-card.editable').forEach(card => {
      card.addEventListener('click', () => {
        const agentId = card.getAttribute('data-id');
        if (agentId) {
          this.openAgentEditor(agentId);
        }
      });
    });
  }

  private setupHoverTooltip() {
    const roster = this.shadowRoot?.getElementById('roster') as HTMLElement | null;
    const tooltipEl = this.shadowRoot?.getElementById('hover-tooltip') as HTMLElement | null;
    if (!roster || !tooltipEl) return;

    const hide = () => {
      this.hoveredAgentId = null;
      tooltipEl.setAttribute('aria-hidden', 'true');
      tooltipEl.removeAttribute('data-open');
      tooltipEl.style.transform = 'translate(-9999px, -9999px)';
      tooltipEl.textContent = '';
    };

    const position = (card: HTMLElement) => {
      const rect = card.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const offset = 10;

      // Fill content first so we can measure tooltip size
      const tooltipRect = tooltipEl.getBoundingClientRect();
      const tooltipW = tooltipRect.width || 240;
      const tooltipH = tooltipRect.height || 32;

      const centerX = rect.left + rect.width / 2;
      const topY = rect.top - offset - tooltipH;
      const bottomY = rect.bottom + offset;

      const placeTop = topY >= margin;
      const placement = placeTop ? 'top' : 'bottom';

      let x = centerX - tooltipW / 2;
      x = Math.max(margin, Math.min(vw - margin - tooltipW, x));

      let y = placeTop ? topY : bottomY;
      y = Math.max(margin, Math.min(vh - margin - tooltipH, y));

      tooltipEl.dataset.placement = placement;
      tooltipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };

    const showForCard = (card: HTMLElement) => {
      const agentId = card.getAttribute('data-id');
      if (!agentId) return;
      const text = card.getAttribute('data-tooltip') || '';
      if (!text) return;

      this.hoveredAgentId = agentId;
      tooltipEl.textContent = text;
      tooltipEl.setAttribute('aria-hidden', 'false');
      tooltipEl.dataset.open = 'true';

      // Position after paint so width/height are correct
      requestAnimationFrame(() => {
        if (this.hoveredAgentId !== agentId) return;
        position(card);
      });
    };

    roster.addEventListener('pointerover', (e: Event) => {
      const target = e.target as HTMLElement | null;
      const card = target?.closest('.agent-card') as HTMLElement | null;
      if (!card) return;
      const agentId = card.getAttribute('data-id');
      if (agentId && agentId === this.hoveredAgentId) return;
      showForCard(card);
    });

    roster.addEventListener('pointermove', (e: Event) => {
      if (!this.hoveredAgentId) return;
      const target = e.target as HTMLElement | null;
      const card = target?.closest('.agent-card') as HTMLElement | null;
      if (!card) return;
      const agentId = card.getAttribute('data-id');
      if (!agentId || agentId !== this.hoveredAgentId) return;
      position(card);
    });

    roster.addEventListener('pointerout', (e: Event) => {
      const related = (e as PointerEvent).relatedTarget as HTMLElement | null;
      // If moving within the same roster/into another card, let pointerover handle it.
      if (related && roster.contains(related)) return;
      hide();
    });

    roster.addEventListener('scroll', () => hide(), { passive: true });
    window.addEventListener('scroll', () => hide(), { passive: true });
    window.addEventListener('resize', () => hide(), { passive: true });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private renderTurnBadge(position: TurnPosition, _color: string): string {
    if (!position || position === 'waiting') return '';

    if (position === 'current') {
      return `
        <div class="turn-badge current-turn">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="8"/>
          </svg>
          NOW
        </div>
      `;
    } else if (position === 'next') {
      return `<div class="turn-badge next-turn">NEXT</div>`;
    } else if (position === 'completed') {
      return `
        <div class="turn-badge completed-turn">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      `;
    }
    return '';
  }

  private openAgentEditor(agentId: string) {
    const agentEditor = this.shadowRoot?.getElementById('agent-editor') as AgentEditorModal;
    if (!agentEditor) return;

    const agent = this.agents.find(a => a.id === agentId);
    if (!agent) return;

    agentEditor.configure({
      mode: 'edit',
      agent: agent,
      conversationId: this.conversationId || undefined,
    });

    agentEditor.setAttribute('open', 'true');
  }

  private updateAgentStatus(agentId: string) {
    const card = this.shadowRoot?.querySelector(`.agent-card[data-id="${agentId}"]`);
    if (!card) return;

    const agent = this.agents.find(a => a.id === agentId);
    const status = this.agentStatuses.get(agentId) || 'idle';
    const color = agent?.color || 'var(--color-primary)';
    
    card.classList.remove('idle', 'thinking', 'speaking');
    card.classList.add(status);

    const statusDot = card.querySelector('.status-dot') as HTMLElement;
    if (statusDot) {
      statusDot.classList.remove('idle', 'thinking', 'speaking');
      statusDot.classList.add(status);
      // Apply agent color to status dot
      if (status !== 'idle') {
        statusDot.style.background = color;
        statusDot.style.boxShadow = `0 0 6px ${color}`;
      } else {
        statusDot.style.background = '';
        statusDot.style.boxShadow = '';
      }
    }

    // Update status label
    const statusLabel = card.querySelector('.status-label') as HTMLElement;
    if (statusLabel) {
      statusLabel.classList.remove('idle', 'thinking', 'speaking');
      statusLabel.classList.add(status);
      statusLabel.textContent = status === 'thinking' ? 'thinking...' : status === 'speaking' ? 'writing...' : '';
      if (status !== 'idle') {
        statusLabel.style.color = color;
        statusLabel.style.background = `${color}20`;
      } else {
        statusLabel.style.color = '';
        statusLabel.style.background = '';
      }
    }
  }
}

customElements.define('agent-roster', AgentRoster);
