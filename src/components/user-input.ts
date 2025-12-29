// ============================================
// AI Brainstorm - User Input Component
// ============================================

import { UserInterjectionHandler } from '../engine/user-interjection';

export class UserInput extends HTMLElement {
  private conversationId: string | null = null;
  private handler: UserInterjectionHandler | null = null;

  static get observedAttributes() {
    return ['conversation-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'conversation-id' && oldValue !== newValue) {
      this.conversationId = newValue;
      this.handler = new UserInterjectionHandler(newValue);
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        /* Shadow DOM doesn't inherit global resets; add the essentials here. */
        *, *::before, *::after {
          box-sizing: border-box;
        }

        :host {
          --control-h: 44px;
          display: block;
          padding: var(--space-4) var(--space-6);
          background: var(--color-bg-secondary);
          border-top: 1px solid var(--color-border);
          padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
        }

        /* ------------------------------------------------
           Main grid: 2 rows
           Row 1 = input field + send button
           Row 2 = footer (hint, counter, toggle)
           ------------------------------------------------ */
        .input-section {
          display: grid;
          grid-template-columns: minmax(0, 1fr) var(--control-h);
          grid-template-rows: auto auto;
          grid-template-areas:
            "field  send"
            "footer footer";
          gap: var(--space-3);
          align-items: end;
        }

        /* ---------- Row 1: Textarea ---------- */
        .input-wrapper {
          grid-area: field;
          min-width: 0;
        }

        .input-field {
          display: block;
          width: 100%;
          padding: var(--space-3) var(--space-4);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          color: var(--color-text-primary);
          font-family: inherit;
          font-size: var(--text-base);
          line-height: 1.4;
          resize: none;
          min-height: var(--control-h);
          max-height: 120px;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        .input-field:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px var(--color-primary-dim);
        }

        .input-field::placeholder {
          color: var(--color-text-tertiary);
        }

        /* ---------- Row 1: Send Button ---------- */
        .send-btn {
          grid-area: send;
          align-self: end;
          display: flex;
          align-items: center;
          justify-content: center;
          width: var(--control-h);
          height: var(--control-h);
          background: var(--color-primary);
          border: none;
          border-radius: var(--radius-lg);
          color: var(--color-bg-primary);
          cursor: pointer;
          transition: all var(--transition-fast);
          flex-shrink: 0;
        }

        .send-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px var(--color-primary-dim);
        }

        .send-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none;
        }

        .send-btn svg {
          width: 20px;
          height: 20px;
        }

        /* ---------- Row 2: Footer ---------- */
        .input-footer {
          grid-area: footer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-4);
          padding: 0 var(--space-1);
          flex-wrap: wrap;
        }

        .hint {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .footer-right {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          margin-left: auto;
        }

        .char-count {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }

        .char-count.warning {
          color: var(--color-warning);
        }

        .char-count.error {
          color: var(--color-error);
          font-weight: 500;
        }

        .mode-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          cursor: pointer;
          user-select: none;
        }

        .mode-toggle:hover {
          color: var(--color-text-secondary);
        }

        .mode-toggle input[type="checkbox"] {
          width: 14px;
          height: 14px;
          accent-color: var(--color-primary);
          cursor: pointer;
        }

        /* ---------- Responsive ---------- */
        @media (max-width: 480px) {
          :host {
            padding-left: var(--space-4);
            padding-right: var(--space-4);
          }

          .input-footer {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-2);
          }

          .footer-right {
            width: 100%;
            justify-content: space-between;
            margin-left: 0;
          }
        }
      </style>

      <div class="input-section">
        <div class="input-wrapper">
          <textarea 
            class="input-field" 
            id="input-field"
            placeholder="Share your thoughts or guidance..."
            rows="1"
            maxlength="2000"
          ></textarea>
        </div>

        <button class="send-btn" id="send-btn" disabled title="Send (Ctrl+Enter)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>

        <div class="input-footer">
          <span class="hint">Press Ctrl+Enter to send</span>
          <div class="footer-right">
            <span class="char-count" id="char-count">0 / 2000</span>
            <label class="mode-toggle">
              <input type="checkbox" id="immediate-mode">
              Immediate (interrupt current turn)
            </label>
          </div>
        </div>
      </div>
    `;

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    const inputField = this.shadowRoot?.getElementById('input-field') as HTMLTextAreaElement;
    const sendBtn = this.shadowRoot?.getElementById('send-btn') as HTMLButtonElement;
    const charCount = this.shadowRoot?.getElementById('char-count') as HTMLSpanElement;
    const immediateMode = this.shadowRoot?.getElementById('immediate-mode') as HTMLInputElement;

    if (!inputField || !sendBtn || !charCount) return;

    // Auto-resize textarea
    inputField.addEventListener('input', () => {
      inputField.style.height = 'auto';
      inputField.style.height = Math.min(inputField.scrollHeight, 120) + 'px';

      // Update char count
      const count = inputField.value.length;
      charCount.textContent = `${count} / 2000`;
      charCount.className = 'char-count';
      if (count > 1800) charCount.classList.add('warning');
      if (count >= 2000) charCount.classList.add('error');

      // Enable/disable send button
      sendBtn.disabled = count === 0 || count > 2000;
    });

    // Keyboard shortcut
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey && !sendBtn.disabled) {
        e.preventDefault();
        this.send(inputField.value, immediateMode.checked);
        inputField.value = '';
        inputField.style.height = 'auto';
        charCount.textContent = '0 / 2000';
        sendBtn.disabled = true;
      }
    });

    // Send button click
    sendBtn.addEventListener('click', () => {
      if (inputField.value.trim()) {
        this.send(inputField.value, immediateMode.checked);
        inputField.value = '';
        inputField.style.height = 'auto';
        charCount.textContent = '0 / 2000';
        sendBtn.disabled = true;
      }
    });
  }

  private async send(content: string, immediate: boolean) {
    if (!this.handler) {
      this.conversationId = this.getAttribute('conversation-id');
      if (this.conversationId) {
        this.handler = new UserInterjectionHandler(this.conversationId);
      }
    }

    if (this.handler) {
      await this.handler.addInterjection(content, immediate ? 'immediate' : 'next_round');
    }
  }
}

customElements.define('user-input', UserInput);
