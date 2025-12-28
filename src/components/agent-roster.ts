// ============================================
// AI Brainstorm - Agent Roster Component
// Version: 2.1.0
// ============================================

import { agentStorage, conversationStorage, providerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { Agent, Conversation, LLMProvider } from '../types';
import './agent-editor-modal';
import type { AgentEditorModal, AgentEditorResult } from './agent-editor-modal';

type AgentStatus = 'idle' | 'thinking' | 'speaking';

export class AgentRoster extends HTMLElement {
  private agents: Agent[] = [];
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private conversationId: string | null = null;
  private conversation: Conversation | null = null;
  private providers: LLMProvider[] = [];

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

    // Refresh when conversation status changes
    eventBus.on('conversation:started', () => this.loadAgents());
    eventBus.on('conversation:paused', () => this.loadAgents());
    eventBus.on('conversation:stopped', () => this.loadAgents());
    eventBus.on('conversation:updated', () => this.loadAgents());
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
          overflow-y: hidden;
          padding-bottom: var(--space-2);
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
        }

        .agent-card.editable:hover {
          border-color: var(--color-primary);
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

        .tooltip {
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          white-space: nowrap;
          opacity: 0;
          visibility: hidden;
          transition: all var(--transition-fast);
          pointer-events: none;
          z-index: 10;
        }

        .tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: var(--color-border);
        }

        .agent-card:hover .tooltip {
          opacity: 1;
          visibility: visible;
        }
      </style>

      <div class="roster" id="roster">
        <div class="empty-roster">Loading agents...</div>
      </div>

      <agent-editor-modal id="agent-editor"></agent-editor-modal>
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
    if (!roster) return;

    if (this.agents.length === 0) {
      roster.innerHTML = `<div class="empty-roster">No agents in this conversation</div>`;
      return;
    }

    const editable = this.isEditable();

    roster.innerHTML = this.agents.map(agent => {
      const status = this.agentStatuses.get(agent.id) || 'idle';
      const initials = agent.name.slice(0, 2).toUpperCase();
      const provider = this.providers.find(p => p.id === agent.llmProviderId);
      const model = provider?.models.find(m => m.id === agent.modelId);
      const tooltipText = editable 
        ? `Click to edit • ${model?.name || agent.modelId}` 
        : `${model?.name || agent.modelId} • Pause to edit`;

      return `
        <div class="agent-card ${status} ${agent.isSecretary ? 'secretary' : ''} ${editable ? 'editable' : ''}" 
             data-id="${agent.id}" 
             title="">
          <div class="tooltip">${tooltipText}</div>
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
            <div class="status-dot ${status}"></div>
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
