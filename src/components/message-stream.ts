// ============================================
// AI Brainstorm - Message Stream Component
// Version: 1.1.0
// ============================================

import { messageStorage, agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { formatRelativeTime, escapeHtml, parseBasicFormatting } from '../utils/helpers';
import type { Message, Agent } from '../types';

export class MessageStream extends HTMLElement {
  private messages: Message[] = [];
  private agents: Map<string, Agent> = new Map();
  private conversationId: string | null = null;
  private autoScroll = true;
  private streamingAgentId: string | null = null;
  private streamingContent: string = '';

  static get observedAttributes() {
    return ['conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    this.render();
    await this.loadMessages();
    this.setupEventListeners();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'conversation-id' && oldValue !== newValue) {
      this.conversationId = newValue;
      this.loadMessages();
    }
  }

  private async loadMessages() {
    this.conversationId = this.getAttribute('conversation-id');
    if (!this.conversationId) return;

    // Load agents
    const agentList = await agentStorage.getByConversation(this.conversationId);
    this.agents = new Map(agentList.map(a => [a.id, a]));

    // Load messages
    this.messages = await messageStorage.getByConversation(this.conversationId);
    this.renderMessages();
  }

  private setupEventListeners() {
    // New message
    eventBus.on('message:created', (message: Message) => {
      if (message.conversationId === this.conversationId) {
        this.messages.push(message);
        this.appendMessage(message);
        this.scrollToBottom();
      }
    });

    // Streaming chunks
    eventBus.on('stream:chunk', ({ agentId, content }) => {
      if (this.streamingAgentId !== agentId) {
        this.streamingAgentId = agentId;
        this.streamingContent = '';
        this.addStreamingBubble(agentId);
      }
      this.streamingContent += content;
      this.updateStreamingBubble(this.streamingContent);
    });

    eventBus.on('stream:complete', () => {
      this.streamingAgentId = null;
      this.streamingContent = '';
    });

    // Agent status
    eventBus.on('agent:thinking', (agentId: string) => {
      this.showThinkingIndicator(agentId);
    });

    eventBus.on('agent:idle', (agentId: string) => {
      this.hideThinkingIndicator(agentId);
    });
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        :host {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          background: var(--color-bg-primary);
        }

        .message-container {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4) var(--space-6);
          scroll-behavior: smooth;
        }

        .message {
          display: flex;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .avatar {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-full);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: var(--font-bold);
          font-size: var(--text-sm);
          flex-shrink: 0;
        }

        .message-content {
          flex: 1;
          min-width: 0;
        }

        .message-header {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-1);
        }

        .agent-name {
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
        }

        .message-time {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .message-role {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          background: var(--color-surface);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
        }

        .message-body {
          background: var(--color-surface);
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-lg);
          border-top-left-radius: var(--radius-sm);
          color: var(--color-text-primary);
          line-height: var(--leading-relaxed);
        }

        .message-body code {
          background: var(--color-bg-secondary);
          padding: 0.15em 0.4em;
          border-radius: var(--radius-sm);
          font-family: var(--font-mono);
          font-size: 0.9em;
        }

        .message-body strong {
          font-weight: var(--font-semibold);
        }

        .message-actions {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-2);
          opacity: 0;
          transition: opacity var(--transition-fast);
        }

        .message:hover .message-actions {
          opacity: 1;
        }

        .action-btn {
          padding: var(--space-1) var(--space-2);
          background: var(--color-surface);
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          cursor: pointer;
          font-size: var(--text-xs);
          display: flex;
          align-items: center;
          gap: var(--space-1);
          transition: all var(--transition-fast);
        }

        .action-btn:hover {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
        }

        .action-btn.liked {
          color: var(--color-primary);
        }

        .weight-badge {
          font-size: var(--text-xs);
          color: var(--color-primary);
          margin-left: var(--space-2);
        }

        .interjection .message-body {
          background: var(--color-secondary-dim);
          border-left: 3px solid var(--color-secondary);
        }

        .secretary .message-body {
          background: var(--color-primary-dim);
          border-left: 3px solid var(--color-primary);
        }

        .thinking-indicator {
          display: flex;
          gap: 4px;
          padding: var(--space-2);
        }

        .thinking-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-primary);
          animation: pulse 1.4s ease-in-out infinite;
        }

        .thinking-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .thinking-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-tertiary);
          text-align: center;
          padding: var(--space-8);
        }

        .empty-icon {
          width: 48px;
          height: 48px;
          margin-bottom: var(--space-4);
          opacity: 0.3;
        }

        .streaming-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: var(--color-primary);
          margin-left: 2px;
          animation: blink 1s step-end infinite;
        }

        @keyframes blink {
          50% { opacity: 0; }
        }
      </style>

      <div class="message-container" id="messages">
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No messages yet. Start the conversation!</p>
        </div>
      </div>
    `;

    // Scroll handler
    const container = this.shadowRoot.getElementById('messages');
    container?.addEventListener('scroll', () => {
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
        this.autoScroll = isAtBottom;
      }
    });
  }

  private renderMessages() {
    const container = this.shadowRoot?.getElementById('messages');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No messages yet. Start the conversation!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.messages.map(msg => this.renderMessage(msg)).join('');
    this.scrollToBottom();
  }

  private renderMessage(message: Message): string {
    const agent = message.agentId ? this.agents.get(message.agentId) : null;
    const isInterjection = message.type === 'interjection';
    const isSecretary = agent?.isSecretary;

    const name = isInterjection ? 'User' : (agent?.name || 'System');
    const color = isInterjection ? 'var(--color-secondary)' : (agent?.color || 'var(--color-text-tertiary)');
    const initials = name.slice(0, 2).toUpperCase();
    const role = agent?.role || '';

    const formattedContent = parseBasicFormatting(escapeHtml(message.content));

    return `
      <div class="message ${isInterjection ? 'interjection' : ''} ${isSecretary ? 'secretary' : ''}" data-id="${message.id}">
        <div class="avatar" style="background: ${color}20; color: ${color};">
          ${initials}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="agent-name" style="color: ${color};">${escapeHtml(name)}</span>
            ${role ? `<span class="message-role">${escapeHtml(role)}</span>` : ''}
            <span class="message-time">${formatRelativeTime(message.createdAt)}</span>
            ${message.weight > 0 ? `<span class="weight-badge">+${message.weight}</span>` : ''}
          </div>
          <div class="message-body">${formattedContent}</div>
          <div class="message-actions">
            <button class="action-btn like-btn" data-id="${message.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              Like
            </button>
            <button class="action-btn copy-btn" data-id="${message.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private appendMessage(message: Message) {
    const container = this.shadowRoot?.getElementById('messages');
    if (!container) return;

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    // Remove streaming bubble if exists
    const streamingBubble = container.querySelector('.streaming-message');
    if (streamingBubble) {
      streamingBubble.remove();
    }

    container.insertAdjacentHTML('beforeend', this.renderMessage(message));
  }

  private addStreamingBubble(agentId: string) {
    const container = this.shadowRoot?.getElementById('messages');
    if (!container) return;

    const agent = this.agents.get(agentId);
    const color = agent?.color || 'var(--color-primary)';
    const name = agent?.name || 'Agent';
    const initials = name.slice(0, 2).toUpperCase();

    container.insertAdjacentHTML('beforeend', `
      <div class="message streaming-message" data-agent="${agentId}">
        <div class="avatar" style="background: ${color}20; color: ${color};">
          ${initials}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="agent-name" style="color: ${color};">${name}</span>
            <span class="message-time">now</span>
          </div>
          <div class="message-body streaming-body"><span class="streaming-cursor"></span></div>
        </div>
      </div>
    `);

    this.scrollToBottom();
  }

  private updateStreamingBubble(content: string) {
    const streamingBody = this.shadowRoot?.querySelector('.streaming-body');
    if (streamingBody) {
      const formattedContent = parseBasicFormatting(escapeHtml(content));
      streamingBody.innerHTML = formattedContent + '<span class="streaming-cursor"></span>';
      this.scrollToBottom();
    }
  }

  private showThinkingIndicator(agentId: string) {
    const container = this.shadowRoot?.getElementById('messages');
    if (!container) return;

    const agent = this.agents.get(agentId);
    const color = agent?.color || 'var(--color-primary)';
    const name = agent?.name || 'Agent';
    const initials = name.slice(0, 2).toUpperCase();

    container.insertAdjacentHTML('beforeend', `
      <div class="message thinking-message" data-agent="${agentId}">
        <div class="avatar" style="background: ${color}20; color: ${color};">
          ${initials}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="agent-name" style="color: ${color};">${name}</span>
            <span class="message-time">thinking...</span>
          </div>
          <div class="message-body">
            <div class="thinking-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    `);

    this.scrollToBottom();
  }

  private hideThinkingIndicator(agentId: string) {
    const thinkingMsg = this.shadowRoot?.querySelector(`.thinking-message[data-agent="${agentId}"]`);
    thinkingMsg?.remove();
  }

  private scrollToBottom() {
    if (!this.autoScroll) return;

    const container = this.shadowRoot?.getElementById('messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}

customElements.define('message-stream', MessageStream);

