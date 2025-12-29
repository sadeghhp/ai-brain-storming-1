// ============================================
// AI Brainstorm - Control Bar Component
// Version: 1.4.0
// ============================================

import type { ConversationStatus } from '../types';
import './confirmation-modal';
import type { ConfirmationModal } from './confirmation-modal';

export class ControlBar extends HTMLElement {
  private status: ConversationStatus = 'idle';
  private speedMs: number = 2000;
  private locked: boolean = false;

  static get observedAttributes() {
    return ['status', 'speed', 'locked'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === 'status') {
      this.status = newValue as ConversationStatus;
      this.updateButtons();
    }
    if (name === 'speed') {
      this.speedMs = parseInt(newValue) || 2000;
      this.updateSpeed();
    }
    if (name === 'locked') {
      this.locked = newValue === 'true';
      this.updateButtons();
    }
  }

  private render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: var(--space-4) var(--space-6);
        }

        .control-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-4);
        }

        .playback-controls {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .control-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .control-btn:hover:not(:disabled) {
          background: var(--color-surface-hover);
          color: var(--color-text-primary);
        }

        .control-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .control-btn.primary {
          width: 48px;
          height: 48px;
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: var(--color-bg-primary);
        }

        .control-btn.primary:hover:not(:disabled) {
          background: var(--color-primary);
          opacity: 0.9;
        }

        .control-btn.danger {
          color: var(--color-error);
        }

        .control-btn.danger:hover:not(:disabled) {
          background: rgba(244, 63, 94, 0.1);
          border-color: var(--color-error);
        }

        .control-btn.success {
          color: var(--color-success);
        }

        .control-btn.success:hover:not(:disabled) {
          background: rgba(34, 197, 94, 0.1);
          border-color: var(--color-success);
        }

        .speed-control {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .speed-label {
          font-size: var(--text-sm);
          color: var(--color-text-tertiary);
        }

        .speed-slider {
          width: 120px;
          height: 4px;
          -webkit-appearance: none;
          appearance: none;
          background: var(--color-border);
          border-radius: var(--radius-full);
          outline: none;
        }

        .speed-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: var(--color-primary);
          border-radius: 50%;
          cursor: pointer;
          transition: transform var(--transition-fast);
        }

        .speed-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .speed-value {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          min-width: 40px;
          text-align: right;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-text-tertiary);
        }

        .status-dot.running {
          background: var(--color-success);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .status-dot.paused {
          background: var(--color-warning);
        }

        .status-dot.completed {
          background: var(--color-primary);
        }

        .status-dot.finishing {
          background: var(--color-success);
          animation: pulse 1s ease-in-out infinite;
        }

        .status-dot.locked {
          background: var(--color-warning);
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .status-text {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
          text-transform: capitalize;
        }

        .status-text.locked {
          color: var(--color-warning);
        }
      </style>

      <div class="control-container">
        <div class="playback-controls">
          <button class="control-btn primary" id="play-btn" title="Start">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </button>
          <button class="control-btn" id="pause-btn" title="Pause" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>
          <button class="control-btn danger" id="stop-btn" title="Stop" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
          <button class="control-btn success" id="finish-btn" title="Finish Discussion" disabled>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </button>
          <button class="control-btn" id="reset-btn" title="Reset">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>

        <div class="speed-control">
          <span class="speed-label">Speed</span>
          <input type="range" class="speed-slider" id="speed-slider" min="500" max="10000" value="${this.speedMs}" step="500">
          <span class="speed-value" id="speed-value">${this.formatSpeed(this.speedMs)}</span>
        </div>

        <div class="status-indicator">
          <div class="status-dot ${this.status}"></div>
          <span class="status-text">${this.status}</span>
        </div>
      </div>

      <confirmation-modal id="reset-confirm-modal"></confirmation-modal>
    `;

    this.setupEventHandlers();
    this.updateButtons();
  }

  private setupEventHandlers() {
    // Play/Start button
    this.shadowRoot?.getElementById('play-btn')?.addEventListener('click', () => {
      if (this.status === 'idle' || this.status === 'completed') {
        this.dispatchEvent(new CustomEvent('start'));
      } else if (this.status === 'paused') {
        this.dispatchEvent(new CustomEvent('resume'));
      }
    });

    // Pause button
    this.shadowRoot?.getElementById('pause-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('pause'));
    });

    // Stop button
    this.shadowRoot?.getElementById('stop-btn')?.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('stop'));
    });

    // Finish button - show confirmation modal
    this.shadowRoot?.getElementById('finish-btn')?.addEventListener('click', async () => {
      const modal = this.shadowRoot?.getElementById('reset-confirm-modal') as ConfirmationModal;
      if (!modal) return;

      const confirmed = await modal.show({
        title: 'Finish Discussion?',
        message: 'This will allow each participant one final brief turn for closing thoughts, then generate the final result document.',
        details: [
          'Each agent gets a brief final turn',
          'Secretary compiles the final result',
          'Conversation will be marked as completed',
        ],
        confirmText: 'Finish',
        cancelText: 'Cancel',
        variant: 'success',
      });

      if (confirmed) {
        this.dispatchEvent(new CustomEvent('finish'));
      }
    });

    // Reset button - show confirmation modal
    this.shadowRoot?.getElementById('reset-btn')?.addEventListener('click', async () => {
      const modal = this.shadowRoot?.getElementById('reset-confirm-modal') as ConfirmationModal;
      if (!modal) return;

      const confirmed = await modal.show({
        title: 'Reset Conversation',
        message: 'This will delete all conversation data and allow you to start fresh. This action cannot be undone.',
        details: [
          'All messages will be deleted',
          'Turn history will be cleared',
          'Agent notebooks will be reset',
          'Result drafts will be removed',
        ],
        confirmText: 'Reset Conversation',
        cancelText: 'Cancel',
        variant: 'warning',
      });

      if (confirmed) {
        this.dispatchEvent(new CustomEvent('reset'));
      }
    });

    // Speed slider
    const slider = this.shadowRoot?.getElementById('speed-slider') as HTMLInputElement;
    slider?.addEventListener('input', () => {
      this.speedMs = parseInt(slider.value);
      this.updateSpeed();
      this.dispatchEvent(new CustomEvent('speed-change', { detail: { speedMs: this.speedMs } }));
    });
  }

  private updateButtons() {
    const playBtn = this.shadowRoot?.getElementById('play-btn') as HTMLButtonElement;
    const pauseBtn = this.shadowRoot?.getElementById('pause-btn') as HTMLButtonElement;
    const stopBtn = this.shadowRoot?.getElementById('stop-btn') as HTMLButtonElement;
    const finishBtn = this.shadowRoot?.getElementById('finish-btn') as HTMLButtonElement;
    const resetBtn = this.shadowRoot?.getElementById('reset-btn') as HTMLButtonElement;

    if (!playBtn || !pauseBtn || !stopBtn || !finishBtn || !resetBtn) return;

    // If locked by another tab, disable all control buttons
    if (this.locked) {
      playBtn.disabled = true;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      finishBtn.disabled = true;
      resetBtn.disabled = true;
      playBtn.title = 'Running in another tab';
      
      // Update status indicator to show locked state
      const statusDot = this.shadowRoot?.querySelector('.status-dot');
      const statusText = this.shadowRoot?.querySelector('.status-text');
      if (statusDot) {
        statusDot.className = 'status-dot locked';
      }
      if (statusText) {
        statusText.textContent = 'locked';
        statusText.className = 'status-text locked';
      }
      return;
    }

    switch (this.status) {
      case 'idle':
        playBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        finishBtn.disabled = true;
        resetBtn.disabled = false;
        playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        playBtn.title = 'Start';
        break;

      case 'running':
        playBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        finishBtn.disabled = false;
        resetBtn.disabled = true;
        playBtn.title = 'Start';
        break;

      case 'paused':
        playBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = false;
        finishBtn.disabled = false;
        resetBtn.disabled = false;
        playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        playBtn.title = 'Resume';
        break;

      case 'finishing':
        // During finishing, disable most controls
        playBtn.disabled = true;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        finishBtn.disabled = true;
        resetBtn.disabled = true;
        playBtn.title = 'Finishing...';
        break;

      case 'completed':
        // Allow restarting from completed state
        playBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        finishBtn.disabled = true;
        resetBtn.disabled = false;
        playBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        playBtn.title = 'Continue conversation';
        break;
    }

    // Update status indicator
    const statusDot = this.shadowRoot?.querySelector('.status-dot');
    const statusText = this.shadowRoot?.querySelector('.status-text');
    if (statusDot) {
      statusDot.className = `status-dot ${this.status}`;
    }
    if (statusText) {
      statusText.textContent = this.status;
      statusText.className = 'status-text';
    }
  }

  private updateSpeed() {
    const speedValue = this.shadowRoot?.getElementById('speed-value');
    if (speedValue) {
      speedValue.textContent = this.formatSpeed(this.speedMs);
    }
  }

  private formatSpeed(ms: number): string {
    if (ms === 0) return 'Max';
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  }
}

customElements.define('control-bar', ControlBar);

