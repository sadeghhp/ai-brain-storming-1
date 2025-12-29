// ============================================
// AI Brainstorm - Message Stream Component
// Version: 1.6.1
// ============================================

import { messageStorage, agentStorage, contextSnapshotStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { shadowBaseStyles } from '../styles/shadow-base-styles';
import { formatRelativeTime, escapeHtml, parseBasicFormatting } from '../utils/helpers';
import { isRTLLanguage } from '../utils/languages';
import type { Message, Agent, ContextSnapshot } from '../types';
import './distillation-popup';
import type { DistillationPopup } from './distillation-popup';

export class MessageStream extends HTMLElement {
  private messages: Message[] = [];
  private agents: Map<string, Agent> = new Map();
  private contextSnapshots: Map<string, ContextSnapshot> = new Map(); // turnId -> snapshot
  private conversationId: string | null = null;
  private targetLanguage: string = '';
  private isRTL: boolean = false;
  private autoScroll = true;
  private streamingAgentId: string | null = null;
  private streamingContent: string = '';
  private collapsedMessages: Set<string> = new Set();
  private isClickHandlerAttached = false;
  private distillationPopup: DistillationPopup | null = null;

  static get observedAttributes() {
    return ['conversation-id', 'target-language'];
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
    if (name === 'target-language' && oldValue !== newValue) {
      this.targetLanguage = newValue || '';
      this.isRTL = isRTLLanguage(this.targetLanguage);
      this.renderMessages();
    }
  }

  private async loadMessages() {
    this.conversationId = this.getAttribute('conversation-id');
    if (!this.conversationId) return;

    // Load target language and RTL state
    this.targetLanguage = this.getAttribute('target-language') || '';
    this.isRTL = isRTLLanguage(this.targetLanguage);

    // Load agents
    const agentList = await agentStorage.getByConversation(this.conversationId);
    this.agents = new Map(agentList.map(a => [a.id, a]));

    // Load messages
    this.messages = await messageStorage.getByConversation(this.conversationId);
    
    // Load context snapshots for messages that have turnIds
    await this.loadContextSnapshots();
    
    this.renderMessages();
  }

  /**
   * Load context snapshots for all messages with turnIds
   */
  private async loadContextSnapshots() {
    const turnIds = this.messages
      .filter(m => m.turnId && m.type === 'response')
      .map(m => m.turnId as string);
    
    if (turnIds.length > 0) {
      this.contextSnapshots = await contextSnapshotStorage.getByTurnIds(turnIds);
    }
  }

  private setupEventListeners() {
    // New message
    eventBus.on('message:created', async (message: Message) => {
      if (message.conversationId === this.conversationId) {
        this.messages.push(message);
        await this.appendMessage(message);
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

    eventBus.on('stream:complete', ({ agentId }) => {
      // Remove any lingering streaming bubble (e.g. if a turn fails and no final message is created)
      const container = this.shadowRoot?.getElementById('messages');
      container?.querySelector(`.streaming-message[data-agent="${agentId}"]`)?.remove();

      if (this.streamingAgentId === agentId) {
        this.streamingAgentId = null;
        this.streamingContent = '';
      }
    });

    // Agent status
    eventBus.on('agent:thinking', (agentId: string) => {
      this.showThinkingIndicator(agentId);
    });

    eventBus.on('agent:idle', (agentId: string) => {
      this.hideThinkingIndicator(agentId);
    });

    // Conversation reset - clear all messages from UI
    eventBus.on('conversation:reset', (conversationId: string) => {
      if (conversationId === this.conversationId) {
        this.clearMessages();
      }
    });
  }

  /**
   * Clear all messages from the UI (called on conversation reset)
   */
  private clearMessages() {
    this.messages = [];
    this.contextSnapshots.clear();
    this.streamingAgentId = null;
    this.streamingContent = '';
    this.collapsedMessages.clear();
    this.renderMessages();
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

        /* RTL (Right-to-Left) support for languages like Persian, Arabic, Hebrew */
        .message-body.rtl {
          direction: rtl;
          text-align: right;
          border-top-left-radius: var(--radius-lg);
          border-top-right-radius: var(--radius-sm);
        }

        .message-body.rtl code {
          direction: ltr;
          unicode-bidi: isolate;
        }

        .interjection .message-body.rtl {
          border-left: none;
          border-right: 3px solid var(--color-secondary);
        }

        .secretary .message-body.rtl {
          border-left: none;
          border-right: 3px solid var(--color-primary);
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

        /* Distillation context icon */
        .distillation-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
          margin-left: auto;
        }

        .distillation-btn:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .distillation-btn svg {
          width: 14px;
          height: 14px;
        }

        .distillation-btn.active {
          color: var(--color-primary);
        }

        .distillation-btn.active:hover {
          background: var(--color-primary-dim);
        }

        .distillation-btn.inactive {
          opacity: 0.4;
          cursor: default;
        }

        .distillation-btn.inactive:hover {
          background: transparent;
          color: var(--color-text-tertiary);
        }

        .interjection .message-body {
          background: var(--color-secondary-dim);
          border-left: 3px solid var(--color-secondary);
        }

        .secretary .message-body {
          background: var(--color-primary-dim);
          border-left: 3px solid var(--color-primary);
        }

        /* Enhanced thinking indicator */
        .thinking-message .message-body {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
        }

        .thinking-indicator {
          display: flex;
          gap: 5px;
          align-items: center;
        }

        .thinking-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: thinkingPulse 1.4s ease-in-out infinite;
        }

        .thinking-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .thinking-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes thinkingPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }

        .thinking-label {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          font-style: italic;
        }

        /* Writing/streaming indicator */
        .streaming-message .message-header .writing-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          animation: writingGlow 1.5s ease-in-out infinite;
        }

        @keyframes writingGlow {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        .streaming-message .writing-dots {
          display: inline-flex;
          gap: 2px;
          margin-left: var(--space-1);
        }

        .streaming-message .writing-dots span {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          animation: writingDots 1s ease-in-out infinite;
        }

        .streaming-message .writing-dots span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .streaming-message .writing-dots span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes writingDots {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        /* Collapse/Expand styles */
        .message-toolbar {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-6);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
        }

        .toolbar-btn {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-1) var(--space-2);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          font-size: var(--text-xs);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .toolbar-btn:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
        }

        .toolbar-btn svg {
          width: 14px;
          height: 14px;
        }

        .collapse-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          cursor: pointer;
          transition: all var(--transition-fast);
          flex-shrink: 0;
          margin-right: var(--space-2);
        }

        .collapse-toggle:hover {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .collapse-toggle svg {
          width: 16px;
          height: 16px;
          transition: transform var(--transition-fast);
        }

        .collapse-toggle.collapsed svg {
          transform: rotate(-90deg);
        }

        .message-body-wrapper {
          overflow: hidden;
          max-height: 2000px;
          opacity: 1;
          transition: max-height 0.3s ease, opacity 0.2s ease;
        }

        .message-body-wrapper.collapsed {
          max-height: 0 !important;
          opacity: 0;
        }

        .collapsed-preview {
          display: none;
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
          font-style: italic;
          padding: var(--space-2) 0;
          cursor: pointer;
        }

        .collapsed-preview:hover {
          color: var(--color-text-secondary);
        }

        .message.is-collapsed .collapsed-preview {
          display: block;
        }

        .message.is-collapsed .message-body-wrapper {
          max-height: 0 !important;
          opacity: 0;
        }

        .message.is-collapsed .message-actions {
          display: none;
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
          height: 1.2em;
          background: var(--cursor-color, var(--color-primary));
          margin-left: 1px;
          vertical-align: text-bottom;
          animation: typewriterBlink 0.8s step-end infinite;
          border-radius: 1px;
        }

        @keyframes typewriterBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Enhanced streaming body with word reveal */
        .streaming-body {
          position: relative;
          overflow: hidden;
        }

        .streaming-body .word-reveal {
          display: inline;
          animation: wordFadeIn 0.15s ease-out forwards;
        }

        @keyframes wordFadeIn {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Enhanced thinking indicator with breathing effect */
        .thinking-message {
          animation: messageBreath 2s ease-in-out infinite;
        }

        @keyframes messageBreath {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 1; }
        }

        .thinking-message .avatar {
          animation: avatarPulse 1.5s ease-in-out infinite;
        }

        @keyframes avatarPulse {
          0%, 100% {
            box-shadow: 0 0 0 2px var(--avatar-glow-color, var(--color-primary))40;
          }
          50% {
            box-shadow: 0 0 0 6px var(--avatar-glow-color, var(--color-primary))20,
                        0 0 15px var(--avatar-glow-color, var(--color-primary))30;
          }
        }

        /* Enhanced writing badge */
        .streaming-message .message-header .writing-badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: 3px 10px;
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          animation: writingBadgePulse 1.5s ease-in-out infinite;
        }

        @keyframes writingBadgePulse {
          0%, 100% { 
            opacity: 0.8;
            transform: scale(1);
          }
          50% { 
            opacity: 1;
            transform: scale(1.02);
          }
        }

        .streaming-message .writing-dots {
          display: inline-flex;
          gap: 3px;
          margin-left: var(--space-1);
        }

        .streaming-message .writing-dots span {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          animation: writingDotsJump 1.2s ease-in-out infinite;
        }

        .streaming-message .writing-dots span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .streaming-message .writing-dots span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes writingDotsJump {
          0%, 60%, 100% { 
            transform: translateY(0);
            opacity: 0.5;
          }
          30% { 
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        /* Current speaker highlight effect */
        .streaming-message .avatar,
        .thinking-message .avatar {
          position: relative;
        }

        .streaming-message .avatar::before,
        .thinking-message .avatar::before {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: var(--radius-full);
          background: radial-gradient(circle, var(--avatar-glow-color, var(--color-primary))20 0%, transparent 70%);
          animation: glowRing 2s ease-in-out infinite;
          z-index: -1;
        }

        @keyframes glowRing {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        /* Thinking indicator with bouncing dots */
        .thinking-indicator {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .thinking-indicator span {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          animation: thinkingBounce 1.4s ease-in-out infinite;
        }

        .thinking-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }

        .thinking-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes thinkingBounce {
          0%, 80%, 100% { 
            transform: scale(0.6);
            opacity: 0.4;
          }
          40% { 
            transform: scale(1);
            opacity: 1;
          }
        }
      </style>

      <div class="message-toolbar" id="toolbar" style="display: none;">
        <button class="toolbar-btn" id="collapse-all-btn" title="Collapse all messages">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 14l-5-5-5 5"/>
            <path d="M17 9l-5-5-5 5"/>
          </svg>
          Collapse All
        </button>
        <button class="toolbar-btn" id="expand-all-btn" title="Expand all messages">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M7 10l5 5 5-5"/>
            <path d="M7 15l5 5 5-5"/>
          </svg>
          Expand All
        </button>
      </div>

      <div class="message-container" id="messages">
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>No messages yet. Start the conversation!</p>
        </div>
      </div>
      
      <distillation-popup id="distillation-popup"></distillation-popup>
    `;
    
    // Get reference to distillation popup
    this.distillationPopup = this.shadowRoot.getElementById('distillation-popup') as DistillationPopup;

    // Scroll handler
    const container = this.shadowRoot.getElementById('messages');
    container?.addEventListener('scroll', () => {
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
        this.autoScroll = isAtBottom;
      }
    });

    // Toolbar button handlers
    const collapseAllBtn = this.shadowRoot.getElementById('collapse-all-btn');
    const expandAllBtn = this.shadowRoot.getElementById('expand-all-btn');

    collapseAllBtn?.addEventListener('click', () => this.collapseAll());
    expandAllBtn?.addEventListener('click', () => this.expandAll());

    // One-time delegated click handling (prevents duplicate listeners during re-renders/appends)
    if (!this.isClickHandlerAttached) {
      this.isClickHandlerAttached = true;
      const messageContainer = this.shadowRoot.getElementById('messages');
      messageContainer?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        const toggleBtn = target.closest('.collapse-toggle') as HTMLElement | null;
        if (toggleBtn) {
          e.stopPropagation();
          const messageId = toggleBtn.getAttribute('data-id');
          if (messageId) this.toggleMessageCollapse(messageId);
          return;
        }

        const preview = target.closest('.collapsed-preview') as HTMLElement | null;
        if (preview) {
          const messageId = preview.getAttribute('data-id');
          if (messageId) this.toggleMessageCollapse(messageId);
          return;
        }

        // Handle distillation button click
        const distillationBtn = target.closest('.distillation-btn') as HTMLElement | null;
        if (distillationBtn && !distillationBtn.hasAttribute('disabled')) {
          e.stopPropagation();
          const turnId = distillationBtn.getAttribute('data-turn-id');
          if (turnId) this.showDistillationPopup(turnId);
        }
      });
    }
  }

  /**
   * Show the distillation popup for a specific turn
   */
  private showDistillationPopup(turnId: string) {
    const snapshot = this.contextSnapshots.get(turnId);
    if (snapshot && this.distillationPopup) {
      this.distillationPopup.show(snapshot);
    }
  }

  private renderMessages() {
    const container = this.shadowRoot?.getElementById('messages');
    const toolbar = this.shadowRoot?.getElementById('toolbar');
    if (!container) return;

    if (this.messages.length === 0) {
      if (toolbar) toolbar.style.display = 'none';
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

    // Show toolbar when there are messages
    if (toolbar) toolbar.style.display = 'flex';

    container.innerHTML = this.messages.map(msg => this.renderMessage(msg)).join('');
    this.scrollToBottom();
  }

  private renderMessage(message: Message): string {
    const agent = message.agentId ? this.agents.get(message.agentId) : null;
    const isInterjection = message.type === 'interjection';
    const isSecretary = agent?.isSecretary;
    const isAgentResponse = message.type === 'response' && message.turnId;

    const name = isInterjection ? 'User' : (agent?.name || 'System');
    const color = isInterjection ? 'var(--color-secondary)' : (agent?.color || 'var(--color-text-tertiary)');
    const initials = name.slice(0, 2).toUpperCase();
    const role = agent?.role || '';

    const formattedContent = parseBasicFormatting(escapeHtml(message.content));
    const isCollapsed = this.collapsedMessages.has(message.id);
    const previewText = message.content.slice(0, 80).replace(/\n/g, ' ') + (message.content.length > 80 ? '...' : '');
    
    // Get context snapshot for this message (if it's an agent response)
    const snapshot = message.turnId ? this.contextSnapshots.get(message.turnId) ?? null : null;
    const hasDistillation = snapshot?.distilledMemoryUsed ?? false;

    return `
      <div class="message ${isInterjection ? 'interjection' : ''} ${isSecretary ? 'secretary' : ''} ${isCollapsed ? 'is-collapsed' : ''}" data-id="${message.id}">
        <div class="avatar" style="background: ${color}20; color: ${color};">
          ${initials}
        </div>
        <div class="message-content">
          <div class="message-header">
            <button class="collapse-toggle ${isCollapsed ? 'collapsed' : ''}" data-id="${message.id}" title="${isCollapsed ? 'Expand' : 'Collapse'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            <span class="agent-name" style="color: ${color};">${escapeHtml(name)}</span>
            ${role ? `<span class="message-role">${escapeHtml(role)}</span>` : ''}
            <span class="message-time">${formatRelativeTime(message.createdAt)}</span>
            ${message.weight > 0 ? `<span class="weight-badge">+${message.weight}</span>` : ''}
            ${isAgentResponse ? this.renderDistillationIcon(message.turnId!, snapshot, hasDistillation) : ''}
          </div>
          <div class="collapsed-preview" data-id="${message.id}">${escapeHtml(previewText)}</div>
          <div class="message-body-wrapper ${isCollapsed ? 'collapsed' : ''}">
            <div class="message-body ${this.isRTL ? 'rtl' : ''}">${formattedContent}</div>
          </div>
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

  /**
   * Render the distillation context icon
   */
  private renderDistillationIcon(turnId: string, snapshot: ContextSnapshot | null, hasDistillation: boolean): string {
    // Active (colored) only when distillation was actually used.
    // Inactive (grey) when distillation was NOT used (but snapshot exists and can still be opened).
    const isActive = hasDistillation;
    const title = !snapshot
      ? 'No context snapshot available'
      : hasDistillation
        ? 'View context used for this response (distillation active)'
        : 'No distillation used for this response (click to view details)';
    
    return `
      <button class="distillation-btn ${isActive ? 'active' : 'inactive'}" 
              data-turn-id="${turnId}" 
              title="${title}"
              ${!snapshot ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
          <path d="M12 6a4 4 0 0 0-4 4c0 2 2 4 4 4s4-2 4-4a4 4 0 0 0-4-4z"/>
          <path d="M19.5 17.5A8.5 8.5 0 0 0 12 14a8.5 8.5 0 0 0-7.5 3.5"/>
        </svg>
      </button>
    `;
  }

  private async appendMessage(message: Message) {
    const container = this.shadowRoot?.getElementById('messages');
    const toolbar = this.shadowRoot?.getElementById('toolbar');
    if (!container) return;

    // Show toolbar when there are messages
    if (toolbar) toolbar.style.display = 'flex';

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

    // Load context snapshot for this message if it has a turnId
    if (message.turnId && message.type === 'response') {
      const snapshot = await contextSnapshotStorage.getByTurnId(message.turnId);
      if (snapshot) {
        this.contextSnapshots.set(message.turnId, snapshot);
      }
    }

    container.insertAdjacentHTML('beforeend', this.renderMessage(message));
  }

  private toggleMessageCollapse(messageId: string) {
    const messageEl = this.shadowRoot?.querySelector(`.message[data-id="${messageId}"]`);
    if (!messageEl) return;

    const isCurrentlyCollapsed = this.collapsedMessages.has(messageId);

    if (isCurrentlyCollapsed) {
      this.collapsedMessages.delete(messageId);
      messageEl.classList.remove('is-collapsed');
      messageEl.querySelector('.collapse-toggle')?.classList.remove('collapsed');
      messageEl.querySelector('.message-body-wrapper')?.classList.remove('collapsed');
    } else {
      this.collapsedMessages.add(messageId);
      messageEl.classList.add('is-collapsed');
      messageEl.querySelector('.collapse-toggle')?.classList.add('collapsed');
      messageEl.querySelector('.message-body-wrapper')?.classList.add('collapsed');
    }
  }

  private collapseAll() {
    this.messages.forEach(msg => {
      this.collapsedMessages.add(msg.id);
    });
    
    this.shadowRoot?.querySelectorAll('.message').forEach(messageEl => {
      messageEl.classList.add('is-collapsed');
      messageEl.querySelector('.collapse-toggle')?.classList.add('collapsed');
      messageEl.querySelector('.message-body-wrapper')?.classList.add('collapsed');
    });
  }

  private expandAll() {
    this.collapsedMessages.clear();
    
    this.shadowRoot?.querySelectorAll('.message').forEach(messageEl => {
      messageEl.classList.remove('is-collapsed');
      messageEl.querySelector('.collapse-toggle')?.classList.remove('collapsed');
      messageEl.querySelector('.message-body-wrapper')?.classList.remove('collapsed');
    });
  }

  private addStreamingBubble(agentId: string) {
    const container = this.shadowRoot?.getElementById('messages');
    if (!container) return;

    // Remove thinking indicator when streaming starts
    this.hideThinkingIndicator(agentId);

    const agent = this.agents.get(agentId);
    const color = agent?.color || 'var(--color-primary)';
    const name = agent?.name || 'Agent';
    const role = agent?.role || '';
    const initials = name.slice(0, 2).toUpperCase();

    container.insertAdjacentHTML('beforeend', `
      <div class="message streaming-message" data-agent="${agentId}" style="--avatar-glow-color: ${color}; --cursor-color: ${color};">
        <div class="avatar" style="background: ${color}20; color: ${color};">
          ${initials}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="agent-name" style="color: ${color};">${escapeHtml(name)}</span>
            ${role ? `<span class="message-role">${escapeHtml(role)}</span>` : ''}
            <span class="writing-badge" style="background: ${color}20; color: ${color};">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/>
              </svg>
              writing
              <span class="writing-dots">
                <span style="background: ${color};"></span>
                <span style="background: ${color};"></span>
                <span style="background: ${color};"></span>
              </span>
            </span>
          </div>
          <div class="message-body streaming-body ${this.isRTL ? 'rtl' : ''}" style="border-${this.isRTL ? 'right' : 'left'}: 3px solid ${color};"><span class="streaming-cursor"></span></div>
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

    // Don't show duplicate thinking indicators
    const existingIndicator = container.querySelector(`.thinking-message[data-agent="${agentId}"]`);
    if (existingIndicator) return;

    // Remove empty state if present
    const emptyState = container.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const agent = this.agents.get(agentId);
    const color = agent?.color || 'var(--color-primary)';
    const name = agent?.name || 'Agent';
    const role = agent?.role || '';
    const initials = name.slice(0, 2).toUpperCase();

    container.insertAdjacentHTML('beforeend', `
      <div class="message thinking-message" data-agent="${agentId}" style="--avatar-glow-color: ${color};">
        <div class="avatar" style="background: ${color}20; color: ${color};">
          ${initials}
        </div>
        <div class="message-content">
          <div class="message-header">
            <span class="agent-name" style="color: ${color};">${escapeHtml(name)}</span>
            ${role ? `<span class="message-role">${escapeHtml(role)}</span>` : ''}
            <span class="writing-badge" style="background: ${color}15; color: ${color};">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
              thinking
            </span>
          </div>
          <div class="message-body ${this.isRTL ? 'rtl' : ''}" style="border-${this.isRTL ? 'right' : 'left'}: 3px solid ${color}; background: ${color}08;">
            <div class="thinking-indicator">
              <span style="background: ${color};"></span>
              <span style="background: ${color};"></span>
              <span style="background: ${color};"></span>
            </div>
            <span class="thinking-label">preparing response...</span>
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

