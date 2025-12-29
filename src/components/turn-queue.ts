// ============================================
// AI Brainstorm - Turn Queue Component
// ============================================

import { agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { Agent, TurnQueueState, TurnQueueItem } from '../types';

export class TurnQueue extends HTMLElement {
  private conversationId: string | null = null;
  private agents: Agent[] = [];
  private queueState: TurnQueueState | null = null;
  private currentAgentId: string | null = null;

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

    this.agents = await agentStorage.getByConversation(this.conversationId);
    // Filter out secretary for turn queue display
    this.agents = this.agents.filter(a => !a.isSecretary);
    this.renderQueue();
  }

  private setupEventListeners() {
    // Listen for turn queue updates
    eventBus.on('turn:queued', (state: TurnQueueState) => {
      if (state.conversationId === this.conversationId) {
        this.queueState = state;
        this.renderQueue();
      }
    });

    eventBus.on('turn:order-updated', (state: TurnQueueState) => {
      if (state.conversationId === this.conversationId) {
        this.queueState = state;
        this.renderQueue();
      }
    });

    // Listen for agent status changes
    eventBus.on('agent:thinking', (agentId: string) => {
      this.currentAgentId = agentId;
      this.updateAgentStatus(agentId, 'thinking');
    });

    eventBus.on('stream:chunk', ({ agentId }) => {
      this.currentAgentId = agentId;
      this.updateAgentStatus(agentId, 'writing');
    });

    eventBus.on('agent:idle', (agentId: string) => {
      if (this.currentAgentId === agentId) {
        this.updateAgentStatus(agentId, 'completed');
      }
    });

    eventBus.on('stream:complete', ({ agentId }) => {
      this.updateAgentStatus(agentId, 'completed');
    });

    // Reset on conversation events
    eventBus.on('conversation:started', (id) => {
      if (id === this.conversationId) {
        this.resetQueue();
      }
    });

    eventBus.on('conversation:reset', (id) => {
      if (id === this.conversationId) {
        this.resetQueue();
      }
    });
  }

  private resetQueue() {
    this.queueState = null;
    this.currentAgentId = null;
    this.renderQueue();
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        :host {
          display: block;
          padding: var(--space-2) var(--space-4);
          background: var(--color-bg-tertiary);
          border-bottom: 1px solid var(--color-border);
        }

        .queue-container {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          overflow-x: auto;
          padding: var(--space-1) 0;
        }

        .queue-label {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          flex-shrink: 0;
          margin-right: var(--space-2);
        }

        .queue-items {
          display: flex;
          align-items: center;
          gap: var(--space-1);
        }

        .queue-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
          /* Removed entry animation to prevent flash on re-renders */
        }

        .queue-item.completed {
          opacity: 0.5;
          background: transparent;
          border-color: transparent;
        }

        .queue-item.completed .avatar {
          opacity: 0.6;
        }

        .queue-item.current {
          border-color: var(--agent-color, var(--color-primary));
          background: var(--color-surface);
          --glow-color: var(--agent-color, var(--color-primary));
          animation: spotlight 1.5s ease-in-out infinite;
        }

        .queue-item.waiting {
          opacity: 0.7;
        }

        .avatar {
          width: 24px;
          height: 24px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: var(--font-bold);
          font-size: 10px;
          flex-shrink: 0;
        }

        .agent-name {
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-primary);
          white-space: nowrap;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 3px;
          margin-left: var(--space-1);
        }

        .status-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--agent-color, var(--color-primary));
        }

        .status-dot.thinking {
          animation: dotBounce 1.4s ease-in-out infinite;
        }

        .status-dot:nth-child(2) {
          animation-delay: 0.2s;
        }

        .status-dot:nth-child(3) {
          animation-delay: 0.4s;
        }

        .check-icon {
          width: 14px;
          height: 14px;
          color: var(--color-success);
        }

        .connector {
          width: 16px;
          height: 2px;
          background: var(--color-border);
          flex-shrink: 0;
          position: relative;
        }

        .connector.active {
          background: var(--color-primary);
          animation: flowPulse 1.5s ease-in-out infinite;
        }

        .connector::after {
          content: '';
          position: absolute;
          right: -2px;
          top: 50%;
          transform: translateY(-50%);
          border: 3px solid transparent;
          border-left-color: var(--color-border);
        }

        .connector.active::after {
          border-left-color: var(--color-primary);
        }

        .empty-state {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          font-style: italic;
        }

        @keyframes queueSlideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes spotlight {
          0%, 100% {
            box-shadow: 0 0 0 0 var(--glow-color),
                        0 0 4px 1px var(--glow-color);
          }
          50% {
            box-shadow: 0 0 0 2px var(--glow-color),
                        0 0 12px 3px var(--glow-color);
          }
        }

        @keyframes flowPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

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
      </style>

      <div class="queue-container">
        <span class="queue-label">Turn Order</span>
        <div class="queue-items" id="queue-items">
          <span class="empty-state">Start conversation to see turn order</span>
        </div>
      </div>
    `;
  }

  private renderQueue() {
    const container = this.shadowRoot?.getElementById('queue-items');
    if (!container) return;

    if (this.agents.length === 0) {
      container.innerHTML = `<span class="empty-state">No agents in conversation</span>`;
      return;
    }

    // Build queue based on state or default order
    const queue = this.buildQueueDisplay();
    
    if (queue.length === 0) {
      container.innerHTML = `<span class="empty-state">Start conversation to see turn order</span>`;
      return;
    }

    container.innerHTML = queue.map((item, index) => {
      const isLast = index === queue.length - 1;
      return `
        ${this.renderQueueItem(item)}
        ${!isLast ? this.renderConnector(item.status === 'completed') : ''}
      `;
    }).join('');
  }

  private buildQueueDisplay(): TurnQueueItem[] {
    if (this.queueState && this.queueState.queue.length > 0) {
      return this.queueState.queue;
    }

    // Default display based on agent order
    return this.agents.map((agent, index) => ({
      agentId: agent.id,
      agentName: agent.name,
      agentColor: agent.color,
      status: this.currentAgentId === agent.id ? 'current' : 'waiting' as const,
      order: index,
    }));
  }

  private renderQueueItem(item: TurnQueueItem): string {
    const initials = item.agentName.slice(0, 2).toUpperCase();
    const statusClass = item.status;
    
    return `
      <div class="queue-item ${statusClass}" style="--agent-color: ${item.agentColor};" data-agent-id="${item.agentId}">
        <div class="avatar" style="background: ${item.agentColor}20; color: ${item.agentColor};">
          ${initials}
        </div>
        <span class="agent-name">${item.agentName}</span>
        ${item.status === 'completed' ? `
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ` : ''}
        ${item.status === 'current' ? `
          <div class="status-indicator">
            <span class="status-dot thinking" style="background: ${item.agentColor};"></span>
            <span class="status-dot thinking" style="background: ${item.agentColor};"></span>
            <span class="status-dot thinking" style="background: ${item.agentColor};"></span>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderConnector(completed: boolean): string {
    return `<div class="connector ${completed ? '' : 'active'}"></div>`;
  }

  private updateAgentStatus(agentId: string, status: 'thinking' | 'writing' | 'completed') {
    const item = this.shadowRoot?.querySelector(`.queue-item[data-agent-id="${agentId}"]`);
    if (!item) return;

    // Remove all status classes
    item.classList.remove('completed', 'current', 'waiting');

    if (status === 'completed') {
      item.classList.add('completed');
      // Update status indicator
      const statusIndicator = item.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.innerHTML = `
          <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        `;
      }
    } else {
      item.classList.add('current');
      // Ensure thinking dots are shown
      let statusIndicator = item.querySelector('.status-indicator');
      if (!statusIndicator) {
        const container = document.createElement('div');
        container.className = 'status-indicator';
        item.appendChild(container);
        statusIndicator = container;
      }
      const color = (item as HTMLElement).style.getPropertyValue('--agent-color') || 'var(--color-primary)';
      statusIndicator.innerHTML = `
        <span class="status-dot thinking" style="background: ${color};"></span>
        <span class="status-dot thinking" style="background: ${color};"></span>
        <span class="status-dot thinking" style="background: ${color};"></span>
      `;
    }
  }
}

customElements.define('turn-queue', TurnQueue);

