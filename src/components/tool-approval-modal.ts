// ============================================
// AI Brainstorm - Tool Approval Modal Component
// ============================================
//
// Modal for approving or denying MCP tool calls
// when a conversation is in "approval" mode

import { shadowBaseStyles } from '../styles/shadow-base-styles';
import type { MCPToolCall, MCPServer } from '../types';

export interface ToolApprovalRequest {
  toolCall: MCPToolCall;
  server: MCPServer;
  onApprove: () => void;
  onDeny: () => void;
}

export class ToolApprovalModal extends HTMLElement {
  private currentRequest: ToolApprovalRequest | null = null;
  private pendingRequests: ToolApprovalRequest[] = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  /**
   * Queue a tool call for approval
   */
  requestApproval(request: ToolApprovalRequest): void {
    if (this.currentRequest) {
      // Queue the request
      this.pendingRequests.push(request);
    } else {
      // Show immediately
      this.currentRequest = request;
      this.render();
      this.show();
    }
  }

  /**
   * Show the modal
   */
  private show(): void {
    this.setAttribute('open', 'true');
  }

  /**
   * Hide the modal
   */
  private hide(): void {
    this.removeAttribute('open');
  }

  /**
   * Handle approval
   */
  private approve(): void {
    if (this.currentRequest) {
      this.currentRequest.onApprove();
      this.processNextRequest();
    }
  }

  /**
   * Handle denial
   */
  private deny(): void {
    if (this.currentRequest) {
      this.currentRequest.onDeny();
      this.processNextRequest();
    }
  }

  /**
   * Process the next queued request
   */
  private processNextRequest(): void {
    if (this.pendingRequests.length > 0) {
      this.currentRequest = this.pendingRequests.shift()!;
      this.render();
    } else {
      this.currentRequest = null;
      this.hide();
    }
  }

  /**
   * Render the arguments in a readable format
   */
  private formatArguments(args: Record<string, unknown>): string {
    try {
      return JSON.stringify(args, null, 2);
    } catch {
      return String(args);
    }
  }

  private render(): void {
    if (!this.shadowRoot) return;

    const request = this.currentRequest;
    const queueLength = this.pendingRequests.length;

    this.shadowRoot.innerHTML = `
      <style>
        ${shadowBaseStyles}

        :host {
          display: none;
        }

        :host([open]) {
          display: block;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.15s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .modal {
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          width: 500px;
          max-width: 90vw;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.2s ease-out;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
        }

        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
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
          padding: var(--space-4) var(--space-5);
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-text-primary);
        }

        .modal-title-icon {
          font-size: 24px;
        }

        .queue-badge {
          background: var(--color-warning);
          color: white;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
        }

        .modal-content {
          padding: var(--space-5);
          flex: 1;
          overflow-y: auto;
        }

        .tool-info {
          margin-bottom: var(--space-4);
        }

        .tool-name {
          font-size: var(--text-lg);
          font-weight: var(--font-semibold);
          color: var(--color-primary);
          font-family: var(--font-mono, monospace);
          margin-bottom: var(--space-2);
        }

        .tool-description {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-3);
        }

        .server-info {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
        }

        .server-icon {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-success);
        }

        .arguments-section {
          margin-top: var(--space-4);
        }

        .arguments-label {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-2);
        }

        .arguments-code {
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          font-family: var(--font-mono, monospace);
          font-size: var(--text-sm);
          color: var(--color-text-primary);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 200px;
          overflow-y: auto;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-5);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-secondary);
          border-radius: 0 0 var(--radius-lg) var(--radius-lg);
        }

        .btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-5);
          border-radius: var(--radius-md);
          font-weight: var(--font-medium);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: all var(--transition-fast);
          border: none;
        }

        .btn-deny {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
        }

        .btn-deny:hover {
          background: var(--color-error);
          border-color: var(--color-error);
          color: white;
        }

        .btn-approve {
          background: var(--color-success);
          color: white;
        }

        .btn-approve:hover {
          opacity: 0.9;
        }

        .warning-box {
          display: flex;
          align-items: flex-start;
          gap: var(--space-3);
          padding: var(--space-3);
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: var(--radius-md);
          margin-top: var(--space-4);
        }

        .warning-icon {
          font-size: 18px;
          flex-shrink: 0;
        }

        .warning-text {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          line-height: 1.5;
        }
      </style>

      ${request ? `
        <div class="modal-overlay">
          <div class="modal">
            <div class="modal-header">
              <div class="modal-title">
                <span class="modal-title-icon">🔧</span>
                Tool Call Approval
              </div>
              ${queueLength > 0 ? `
                <span class="queue-badge">+${queueLength} pending</span>
              ` : ''}
            </div>
            
            <div class="modal-content">
              <div class="tool-info">
                <div class="tool-name">${request.toolCall.toolName}</div>
                ${this.getToolDescription(request) ? `
                  <div class="tool-description">${this.getToolDescription(request)}</div>
                ` : ''}
                <div class="server-info">
                  <span class="server-icon"></span>
                  From: ${request.server.name}
                </div>
              </div>

              <div class="arguments-section">
                <div class="arguments-label">Arguments:</div>
                <div class="arguments-code">${this.formatArguments(request.toolCall.arguments)}</div>
              </div>

              <div class="warning-box">
                <span class="warning-icon">⚠️</span>
                <div class="warning-text">
                  This tool will be executed with the arguments shown above. 
                  Review carefully before approving.
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-deny" id="deny-btn">
                ✕ Deny
              </button>
              <button class="btn btn-approve" id="approve-btn">
                ✓ Approve & Execute
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    // Setup event handlers
    this.shadowRoot.getElementById('approve-btn')?.addEventListener('click', () => this.approve());
    this.shadowRoot.getElementById('deny-btn')?.addEventListener('click', () => this.deny());

    // ESC to deny
    this.shadowRoot.querySelector('.modal-overlay')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.deny();
      }
    });
  }

  private getToolDescription(request: ToolApprovalRequest): string {
    const tool = request.server.tools.find(t => t.name === request.toolCall.toolName);
    return tool?.description || '';
  }
}

// Register the custom element
customElements.define('tool-approval-modal', ToolApprovalModal);

