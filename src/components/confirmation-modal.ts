// ============================================
// AI Brainstorm - Confirmation Modal
// Version: 1.0.0
// ============================================

import { shadowBaseStyles } from '../styles/shadow-base-styles';

export interface ConfirmationConfig {
  title: string;
  message: string;
  details?: string[];
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export class ConfirmationModal extends HTMLElement {
  private config: ConfirmationConfig = {
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'warning',
  };

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

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === 'open') {
      this.render();
      
      // Focus the cancel button when opening for better accessibility
      if (newValue === 'true') {
        requestAnimationFrame(() => {
          const cancelBtn = this.shadowRoot?.getElementById('cancel-btn') as HTMLButtonElement;
          cancelBtn?.focus();
        });
      }
    }
  }

  configure(config: Partial<ConfirmationConfig>) {
    this.config = { ...this.config, ...config };
    this.render();
  }

  /**
   * Show the confirmation modal and return a promise that resolves to true (confirmed) or false (cancelled)
   */
  async show(config?: Partial<ConfirmationConfig>): Promise<boolean> {
    if (config) {
      this.configure(config);
    }
    
    this.setAttribute('open', 'true');
    
    return new Promise((resolve) => {
      const handleConfirm = () => {
        cleanup();
        this.setAttribute('open', 'false');
        resolve(true);
      };
      
      const handleCancel = () => {
        cleanup();
        this.setAttribute('open', 'false');
        resolve(false);
      };
      
      const cleanup = () => {
        this.removeEventListener('confirm', handleConfirm);
        this.removeEventListener('cancel', handleCancel);
      };
      
      this.addEventListener('confirm', handleConfirm, { once: true });
      this.addEventListener('cancel', handleCancel, { once: true });
    });
  }

  private close(confirmed: boolean) {
    this.setAttribute('open', 'false');
    this.dispatchEvent(new CustomEvent(confirmed ? 'confirm' : 'cancel'));
  }

  private getVariantIcon(): string {
    switch (this.config.variant) {
      case 'danger':
        return `
          <svg class="icon danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        `;
      case 'warning':
        return `
          <svg class="icon warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        `;
      case 'info':
      default:
        return `
          <svg class="icon info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        `;
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    const isOpen = this.getAttribute('open') === 'true';
    const { title, message, details, confirmText, cancelText, variant } = this.config;

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
          max-width: 420px;
          overflow: hidden;
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
          gap: var(--space-3);
          padding: var(--space-5) var(--space-6);
          border-bottom: 1px solid var(--color-border);
        }

        .modal-header h2 {
          margin: 0;
          font-size: var(--text-lg);
          color: var(--color-text-primary);
          font-weight: var(--font-semibold);
        }

        .icon {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
        }

        .icon.danger {
          color: var(--color-error);
        }

        .icon.warning {
          color: var(--color-warning);
        }

        .icon.info {
          color: var(--color-primary);
        }

        .modal-body {
          padding: var(--space-5) var(--space-6);
        }

        .message {
          font-size: var(--text-base);
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin: 0;
        }

        .details-list {
          margin: var(--space-4) 0 0;
          padding: var(--space-3) var(--space-4);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          list-style: none;
        }

        .details-list li {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) 0;
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
        }

        .details-list li:not(:last-child) {
          border-bottom: 1px solid var(--color-border);
        }

        .details-list li svg {
          width: 14px;
          height: 14px;
          color: var(--color-error);
          flex-shrink: 0;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-3);
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg-tertiary);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all var(--transition-fast);
          min-width: 100px;
        }

        .btn-secondary {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
        }

        .btn-secondary:hover {
          background: var(--color-surface-hover);
          border-color: var(--color-border-strong);
          color: var(--color-text-primary);
        }

        .btn-danger {
          background: var(--color-error);
          border: 1px solid var(--color-error);
          color: white;
        }

        .btn-danger:hover {
          background: #dc2626;
          border-color: #dc2626;
        }

        .btn-warning {
          background: var(--color-warning);
          border: 1px solid var(--color-warning);
          color: var(--color-bg-primary);
        }

        .btn-warning:hover {
          background: #d97706;
          border-color: #d97706;
        }

        .btn-primary {
          background: var(--color-primary);
          border: 1px solid var(--color-primary);
          color: var(--color-bg-primary);
        }

        .btn-primary:hover {
          opacity: 0.9;
        }

        .btn:focus-visible {
          outline: 2px solid var(--color-primary);
          outline-offset: 2px;
        }

        /* Responsive */
        @media (max-width: 480px) {
          .modal-content {
            max-width: 100%;
            margin: var(--space-4);
          }

          .modal-footer {
            flex-direction: column-reverse;
          }

          .btn {
            width: 100%;
          }
        }
      </style>

      <div class="modal-overlay" id="overlay">
        <div class="modal-content">
          <div class="modal-header">
            ${this.getVariantIcon()}
            <h2>${title}</h2>
          </div>
          <div class="modal-body">
            <p class="message">${message}</p>
            ${details && details.length > 0 ? `
              <ul class="details-list">
                ${details.map(detail => `
                  <li>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    ${detail}
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancel-btn">${cancelText}</button>
            <button class="btn btn-${variant}" id="confirm-btn">${confirmText}</button>
          </div>
        </div>
      </div>
    `;

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Click overlay to cancel
    this.shadowRoot?.getElementById('overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'overlay') {
        this.close(false);
      }
    });

    // Cancel button
    this.shadowRoot?.getElementById('cancel-btn')?.addEventListener('click', () => {
      this.close(false);
    });

    // Confirm button
    this.shadowRoot?.getElementById('confirm-btn')?.addEventListener('click', () => {
      this.close(true);
    });

    // Escape key to cancel
    this.shadowRoot?.querySelector('.modal-overlay')?.addEventListener('keydown', (e: Event) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        this.close(false);
      }
    });
  }
}

customElements.define('confirmation-modal', ConfirmationModal);

