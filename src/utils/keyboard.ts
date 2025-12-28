// ============================================
// AI Brainstorm - Keyboard Shortcuts
// Version: 1.0.0
// ============================================

import { eventBus } from './event-bus';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: () => void;
}

const shortcuts: KeyboardShortcut[] = [];

/**
 * Register a keyboard shortcut
 */
export function registerShortcut(shortcut: KeyboardShortcut): () => void {
  shortcuts.push(shortcut);
  return () => {
    const index = shortcuts.indexOf(shortcut);
    if (index > -1) shortcuts.splice(index, 1);
  };
}

/**
 * Handle keydown events
 */
export function handleKeydown(event: KeyboardEvent): boolean {
  // Don't handle if user is typing in an input
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    // Allow Ctrl/Cmd + Enter in textareas
    if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') {
      return false;
    }
  }

  for (const shortcut of shortcuts) {
    const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
    const ctrlMatches = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
    const shiftMatches = !!shortcut.shift === event.shiftKey;
    const altMatches = !!shortcut.alt === event.altKey;

    if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
      event.preventDefault();
      shortcut.action();
      return true;
    }
  }

  return false;
}

/**
 * Get all registered shortcuts
 */
export function getAllShortcuts(): Array<{ combo: string; description: string }> {
  return shortcuts.map(s => ({
    combo: formatShortcutCombo(s),
    description: s.description,
  }));
}

/**
 * Format shortcut key combination for display
 */
function formatShortcutCombo(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];

  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());

  return parts.join(' + ');
}

/**
 * Initialize default shortcuts
 */
export function initializeDefaultShortcuts(): void {
  // New conversation
  registerShortcut({
    key: 'n',
    ctrl: true,
    description: 'New conversation',
    action: () => {
      const modal = document.querySelector('app-shell')?.shadowRoot?.querySelector('new-conversation-modal');
      modal?.setAttribute('open', 'true');
    },
  });

  // Open settings
  registerShortcut({
    key: ',',
    ctrl: true,
    description: 'Open settings',
    action: () => {
      eventBus.emit('settings:open', undefined);
    },
  });

  // Close modals / settings (Escape)
  registerShortcut({
    key: 'Escape',
    description: 'Close modal / settings',
    action: () => {
      const modal = document.querySelector('app-shell')?.shadowRoot?.querySelector('new-conversation-modal');
      if (modal?.getAttribute('open') === 'true') {
        modal.setAttribute('open', 'false');
        return;
      }
      eventBus.emit('settings:close', undefined);
    },
  });

  // Start/pause conversation (space when not in input)
  registerShortcut({
    key: ' ',
    ctrl: true,
    description: 'Start/pause conversation',
    action: () => {
      // This would need to be connected to the current conversation engine
      console.log('[Keyboard] Start/pause shortcut triggered');
    },
  });

  // Help (?)
  registerShortcut({
    key: '?',
    shift: true,
    description: 'Show keyboard shortcuts',
    action: () => {
      showShortcutsHelp();
    },
  });
}

/**
 * Show keyboard shortcuts help overlay
 */
function showShortcutsHelp(): void {
  const allShortcuts = getAllShortcuts();

  // Remove existing overlay
  document.querySelector('.shortcuts-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'shortcuts-overlay';
  overlay.innerHTML = `
    <style>
      .shortcuts-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(4px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .shortcuts-content {
        background: var(--color-bg-secondary, #12121a);
        border: 1px solid var(--color-border, rgba(255,255,255,0.08));
        border-radius: 16px;
        padding: 32px;
        max-width: 480px;
        width: 90%;
        color: var(--color-text-primary, #f0f0f5);
      }
      .shortcuts-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .shortcut-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .shortcut-combo {
        display: inline-flex;
        gap: 4px;
      }
      .shortcut-key {
        padding: 4px 8px;
        background: var(--color-surface, rgba(255,255,255,0.03));
        border: 1px solid var(--color-border, rgba(255,255,255,0.08));
        border-radius: 6px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
      }
      .shortcut-desc {
        color: var(--color-text-secondary, #a0a0b0);
        font-size: 14px;
      }
      .shortcuts-hint {
        margin-top: 24px;
        text-align: center;
        font-size: 12px;
        color: var(--color-text-tertiary, #606070);
      }
    </style>
    <div class="shortcuts-content">
      <div class="shortcuts-title">
        ⌨️ Keyboard Shortcuts
      </div>
      <div class="shortcuts-list">
        ${allShortcuts.map(s => `
          <div class="shortcut-item">
            <span class="shortcut-combo">
              ${s.combo.split(' + ').map(k => `<span class="shortcut-key">${k}</span>`).join('<span>+</span>')}
            </span>
            <span class="shortcut-desc">${s.description}</span>
          </div>
        `).join('')}
      </div>
      <div class="shortcuts-hint">
        Press Escape or click anywhere to close
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);
}

// Initialize when module loads
initializeDefaultShortcuts();

// Set up global listener
window.addEventListener('keydown', handleKeydown);

