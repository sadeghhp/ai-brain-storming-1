// ============================================
// AI Brainstorm - Round Progress Component
// ============================================

import { agentStorage, conversationStorage, turnStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { Agent, Conversation, TurnQueueState } from '../types';

export class RoundProgress extends HTMLElement {
  private conversationId: string | null = null;
  private conversation: Conversation | null = null;
  private agents: Agent[] = [];
  private completedTurns: number = 0;
  private currentAgentId: string | null = null;
  private turnQueueState: TurnQueueState | null = null;

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

    this.conversation = await conversationStorage.getById(this.conversationId) || null;
    const allAgents = await agentStorage.getByConversation(this.conversationId);
    // Filter out secretary
    this.agents = allAgents.filter(a => !a.isSecretary);
    // Hydrate progress from persisted turns so completed conversations render correctly after reload
    await this.hydrateProgressFromTurns();
    this.updateDisplay();
  }

  private getRelevantRoundIndex(): number {
    const currentRound = this.conversation?.currentRound ?? 0;
    const status = this.conversation?.status ?? 'idle';

    return status === 'running' || status === 'paused'
      ? currentRound
      : Math.max(0, currentRound - 1);
  }

  private getDisplayRoundNumber(): number {
    const currentRound = this.conversation?.currentRound ?? 0;
    const status = this.conversation?.status ?? 'idle';

    // When running/paused, show the in-progress round (1-based).
    // When idle/completed, show the last completed round (also 1-based).
    return status === 'running' || status === 'paused'
      ? currentRound + 1
      : Math.max(1, currentRound);
  }

  private async hydrateProgressFromTurns(): Promise<void> {
    if (!this.conversationId || !this.conversation) return;

    const roundIndex = this.getRelevantRoundIndex();
    const turns = await turnStorage.getByRound(this.conversationId, roundIndex);
    const completedAgentIds = new Set(
      turns.filter(t => t.state === 'completed').map(t => t.agentId)
    );
    this.completedTurns = Math.min(completedAgentIds.size, this.agents.length);
  }

  private setupEventListeners() {
    // Turn queue updates
    eventBus.on('turn:queued', (state: TurnQueueState) => {
      if (state.conversationId === this.conversationId) {
        this.turnQueueState = state;
        this.completedTurns = state.currentIndex;
        this.updateDisplay();
      }
    });

    eventBus.on('turn:order-updated', (state: TurnQueueState) => {
      if (state.conversationId === this.conversationId) {
        this.turnQueueState = state;
        this.completedTurns = state.currentIndex;
        this.updateDisplay();
      }
    });

    // Agent status
    eventBus.on('agent:thinking', (agentId: string) => {
      this.currentAgentId = agentId;
      this.updateCurrentAgent();
    });

    eventBus.on('stream:chunk', ({ agentId }) => {
      this.currentAgentId = agentId;
      this.updateCurrentAgent();
    });

    eventBus.on('agent:idle', () => {
      // Note: completedTurns is updated from queue events, not here (avoid double-counting)
      this.currentAgentId = null;
      this.updateDisplay();
    });

    eventBus.on('stream:complete', () => {
      // Note: completedTurns is updated from queue events, not here (avoid double-counting)
      this.currentAgentId = null;
      this.updateDisplay();
    });

    // Conversation events
    eventBus.on('conversation:updated', (conv) => {
      if (conv.id === this.conversationId) {
        this.conversation = conv;
        this.updateDisplay();
      }
    });

    eventBus.on('conversation:started', (id) => {
      if (id === this.conversationId) {
        this.completedTurns = 0;
        this.updateDisplay();
      }
    });

    eventBus.on('conversation:reset', (id) => {
      if (id === this.conversationId) {
        this.completedTurns = 0;
        this.currentAgentId = null;
        this.turnQueueState = null;
        this.loadData();
      }
    });
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        :host {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .progress-container {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .round-badge {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-3);
          background: var(--color-primary-dim);
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-semibold);
          color: var(--color-primary);
        }

        .round-badge svg {
          width: 12px;
          height: 12px;
        }

        .progress-bar-container {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .progress-bar {
          width: 100px;
          height: 6px;
          background: var(--color-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
          position: relative;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
          border-radius: var(--radius-full);
          transition: width 0.3s ease;
          position: relative;
        }

        .progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: 20px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3));
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .progress-text {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          white-space: nowrap;
        }

        .current-speaker {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: var(--color-surface);
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border);
        }

        .speaker-avatar {
          width: 20px;
          height: 20px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          font-weight: var(--font-bold);
        }

        .speaker-info {
          display: flex;
          flex-direction: column;
        }

        .speaker-label {
          font-size: 9px;
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .speaker-name {
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
        }

        .thinking-dots {
          display: flex;
          gap: 2px;
          margin-left: var(--space-1);
        }

        .thinking-dots span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          animation: dotBounce 1.4s ease-in-out infinite;
        }

        .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes dotBounce {
          0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          40% {
            transform: scale(1.2);
            opacity: 1;
          }
        }

        .circular-progress {
          position: relative;
          width: 32px;
          height: 32px;
        }

        .circular-progress svg {
          transform: rotate(-90deg);
        }

        .circular-progress .bg {
          stroke: var(--color-surface);
        }

        .circular-progress .fg {
          stroke: var(--color-primary);
          stroke-linecap: round;
          transition: stroke-dashoffset 0.3s ease;
        }

        .circular-progress .text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 9px;
          font-weight: var(--font-bold);
          color: var(--color-text-primary);
        }
      </style>

      <div class="progress-container" id="progress-container">
        <!-- Content rendered dynamically -->
      </div>
    `;

    this.updateDisplay();
  }

  private updateDisplay() {
    const container = this.shadowRoot?.getElementById('progress-container');
    if (!container) return;

    const displayRound = this.getDisplayRoundNumber();
    const relevantRoundIndex = this.getRelevantRoundIndex();

    const hasMatchingQueueState = this.turnQueueState?.round === relevantRoundIndex;
    const totalAgents = hasMatchingQueueState ? this.turnQueueState!.totalAgents : this.agents.length;
    const completed = Math.min(
      hasMatchingQueueState ? this.turnQueueState!.currentIndex : this.completedTurns,
      totalAgents
    );
    const progressPercent = totalAgents > 0 ? (completed / totalAgents) * 100 : 0;
    const circumference = 2 * Math.PI * 12; // r=12
    const dashOffset = circumference - (progressPercent / 100) * circumference;

    container.innerHTML = `
      <div class="round-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Round ${displayRound}
      </div>

      <div class="circular-progress">
        <svg width="32" height="32" viewBox="0 0 32 32">
          <circle class="bg" cx="16" cy="16" r="12" fill="none" stroke-width="3"/>
          <circle 
            class="fg" 
            cx="16" cy="16" r="12" 
            fill="none" 
            stroke-width="3"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashOffset}"
          />
        </svg>
        <span class="text">${completed}/${totalAgents}</span>
      </div>

      <div class="progress-bar-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <span class="progress-text">${completed} of ${totalAgents} agents</span>
      </div>

      ${this.renderCurrentSpeaker()}
    `;
  }

  private renderCurrentSpeaker(): string {
    if (!this.currentAgentId) return '';

    const agent = this.agents.find(a => a.id === this.currentAgentId);
    if (!agent) return '';

    const initials = agent.name.slice(0, 2).toUpperCase();

    return `
      <div class="current-speaker">
        <div class="speaker-avatar" style="background: ${agent.color}20; color: ${agent.color};">
          ${initials}
        </div>
        <div class="speaker-info">
          <span class="speaker-label">Speaking</span>
          <span class="speaker-name">${agent.name}</span>
        </div>
        <div class="thinking-dots">
          <span style="background: ${agent.color};"></span>
          <span style="background: ${agent.color};"></span>
          <span style="background: ${agent.color};"></span>
        </div>
      </div>
    `;
  }

  private updateCurrentAgent() {
    // Re-render to show current speaker
    this.updateDisplay();
  }
}

customElements.define('round-progress', RoundProgress);

