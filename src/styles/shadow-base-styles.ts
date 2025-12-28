// ============================================
// AI Brainstorm - Shared Shadow DOM Base Styles
// Version: 1.0.0
// ============================================
// Provides consistent scrollbar styling and box-sizing reset
// for Shadow DOM components (Chromium + Firefox).

/**
 * Base CSS for Shadow DOM components.
 * Includes box-sizing reset and scrollbar styling.
 * Import and include in component <style> blocks.
 */
export const shadowBaseStyles = `
  /* Box-sizing reset */
  *, *::before, *::after {
    box-sizing: border-box;
  }

  /* Scrollbar - WebKit (Chrome, Edge, Safari) */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--color-border-strong);
    border-radius: var(--radius-full);
    transition: background 0.2s ease;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-tertiary);
  }

  ::-webkit-scrollbar-corner {
    background: transparent;
  }

  /* Scrollbar - Firefox */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--color-border-strong) transparent;
  }
`;

/**
 * Overflow-safe flex utilities.
 * Prevents flex children from forcing horizontal overflow.
 */
export const flexOverflowStyles = `
  /* Flex overflow guards */
  .flex-truncate {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .text-break {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
`;

