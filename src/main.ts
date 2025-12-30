// ============================================
// AI Brainstorm - Main Entry Point
// ============================================

import './styles/global.css';
import './components/app-shell';
import './utils/keyboard'; // Initialize keyboard shortcuts
import { eventBus } from './utils/event-bus';
import { languageService } from './prompts/language-service';

// Application version - injected by Vite from package.json
declare const __APP_VERSION__: string;
const APP_VERSION = __APP_VERSION__;

// Expose language service to window for debugging
declare global {
  interface Window {
    languageService: typeof languageService;
  }
}
window.languageService = languageService;

/**
 * Initialize the application
 */
function init(): void {
  console.log(`[App] AI Brainstorm v${APP_VERSION} starting...`);

  // Render the app shell
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML = '<app-shell></app-shell>';
  }

  // Set up global error handlers
  window.addEventListener('error', handleGlobalError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  console.log('[App] Application shell mounted');
}

/**
 * Global error handler
 */
function handleGlobalError(event: ErrorEvent): void {
  console.error('[App] Global error:', event.error);
  eventBus.emit('error', {
    message: event.message,
    details: event.error,
  });
}

/**
 * Unhandled promise rejection handler
 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  console.error('[App] Unhandled rejection:', event.reason);
  eventBus.emit('error', {
    message: 'Unhandled promise rejection',
    details: event.reason,
  });
}

// Start the application
init();

