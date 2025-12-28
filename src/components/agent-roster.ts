// ============================================
// AI Brainstorm - Agent Roster Component
// Version: 1.0.0
// ============================================

import { agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { Agent } from '../types';

type AgentStatus = 'idle' | 'thinking' | 'speaking';

export class AgentRoster extends HTMLElement {
  private agents: Agent[] = [];
  private agentStatuses: Map<string, AgentStatus> = new Map();
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
    this.agents.forEach(a => this.agentStatuses.set(a.id, 'idle'));
    this.renderAgents();
  }

  private setupEventListeners() {
    eventBus.on('agent:thinking', (agentId: string) => {
      this.agentStatuses.set(agentId, 'thinking');
      this.updateAgentStatus(agentId);
    });

    eventBus.on('agent:speaking', (agentId: string) => {
      this.agentStatuses.set(agentId, 'speaking');
      this.updateAgentStatus(agentId);
    });

    eventBus.on('agent:idle', (agentId: string) => {
      this.agentStatuses.set(agentId, 'idle');
      this.updateAgentStatus(agentId);
    });
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
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
          padding-bottom: var(--space-2);
        }

        .roster::-webkit-scrollbar {
          height: 4px;
        }

        .roster::-webkit-scrollbar-track {
          background: transparent;
        }

        .roster::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: var(--radius-full);
        }

        .agent-card {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          cursor: default;
          transition: all var(--transition-fast);
          flex-shrink: 0;
        }

        .agent-card:hover {
          background: var(--color-surface-hover);
        }

        .agent-card.thinking {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px var(--color-primary-dim);
        }

        .agent-card.speaking {
          border-color: var(--color-success);
          box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
        }

        .agent-card.secretary {
          border-color: var(--color-secondary);
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
        }

        .status-dot.thinking {
          background: var(--color-primary);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .status-dot.speaking {
          background: var(--color-success);
          animation: pulse 0.8s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
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
      </style>

      <div class="roster" id="roster">
        <div class="empty-roster">Loading agents...</div>
      </div>
    `;
  }

  private renderAgents() {
    const roster = this.shadowRoot?.getElementById('roster');
    if (!roster) return;

    if (this.agents.length === 0) {
      roster.innerHTML = `<div class="empty-roster">No agents in this conversation</div>`;
      return;
    }

    roster.innerHTML = this.agents.map(agent => {
      const status = this.agentStatuses.get(agent.id) || 'idle';
      const initials = agent.name.slice(0, 2).toUpperCase();

      return `
        <div class="agent-card ${status} ${agent.isSecretary ? 'secretary' : ''}" data-id="${agent.id}">
          <div class="avatar" style="background: ${agent.color}20; color: ${agent.color};">
            ${initials}
            <div class="status-dot ${status}"></div>
          </div>
          <div class="agent-info">
            <span class="agent-name">${agent.name}</span>
            <span class="agent-role">${agent.isSecretary ? 'Secretary' : agent.role}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  private updateAgentStatus(agentId: string) {
    const card = this.shadowRoot?.querySelector(`.agent-card[data-id="${agentId}"]`);
    if (!card) return;

    const status = this.agentStatuses.get(agentId) || 'idle';
    card.classList.remove('idle', 'thinking', 'speaking');
    card.classList.add(status);

    const statusDot = card.querySelector('.status-dot');
    if (statusDot) {
      statusDot.classList.remove('idle', 'thinking', 'speaking');
      statusDot.classList.add(status);
    }
  }
}

customElements.define('agent-roster', AgentRoster);

