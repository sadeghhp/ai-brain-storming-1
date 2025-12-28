// ============================================
// AI Brainstorm - Main Entry Point
// Version: 1.0.0
// ============================================

import './styles/global.css';
import './components/app-shell';
import './utils/keyboard'; // Initialize keyboard shortcuts
import { eventBus } from './utils/event-bus';

// Application version
const APP_VERSION = '1.0.0';

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

