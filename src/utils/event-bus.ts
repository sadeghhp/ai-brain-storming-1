// ============================================
// AI Brainstorm - Event Bus (Pub/Sub)
// Version: 1.0.0
// ============================================

import type { AppEvents } from '../types';

type EventCallback<T> = (data: T) => void;
type Unsubscribe = () => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): Unsubscribe {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.add(callback as EventCallback<unknown>);

    // Return unsubscribe function
    return () => {
      callbacks.delete(callback as EventCallback<unknown>);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Subscribe to an event (one-time only)
   */
  once<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): Unsubscribe {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      callback(data);
    });
    return unsubscribe;
  }

  /**
   * Emit an event
   */
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[EventBus] Error in listener for "${event}":`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   */
  off<K extends keyof AppEvents>(event: K): void {
    this.listeners.delete(event);
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof AppEvents>(event: K): number {
    return this.listeners.get(event)?.size || 0;
  }

  /**
   * Get all registered events
   */
  events(): string[] {
    return Array.from(this.listeners.keys());
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Debug helper (only in development)
// @ts-ignore - Vite injects import.meta.env at build time
if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  (window as unknown as { __eventBus: EventBus }).__eventBus = eventBus;
}

