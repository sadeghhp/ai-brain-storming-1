// ============================================
// AI Brainstorm - Conversation State Machine
// ============================================

import type { ConversationStatus } from '../types';

/**
 * Valid state transitions for a conversation
 */
const validTransitions: Record<ConversationStatus, ConversationStatus[]> = {
  idle: ['running'],
  running: ['paused', 'completed', 'finishing', 'idle'], // idle for reset, finishing for wrap-up
  paused: ['running', 'finishing', 'idle'], // idle for reset, finishing for wrap-up
  finishing: ['completed', 'idle'], // finishing leads to completed or can be reset
  completed: ['idle', 'running'], // reset to idle OR restart conversation
};

/**
 * State machine for managing conversation status
 */
export class ConversationStateMachine {
  private status: ConversationStatus;
  private listeners: Set<(status: ConversationStatus) => void> = new Set();

  constructor(initialStatus: ConversationStatus = 'idle') {
    this.status = initialStatus;
  }

  /**
   * Get current status
   */
  get currentStatus(): ConversationStatus {
    return this.status;
  }

  /**
   * Check if a transition is valid
   */
  canTransition(to: ConversationStatus): boolean {
    return validTransitions[this.status].includes(to);
  }

  /**
   * Attempt to transition to a new status
   */
  transition(to: ConversationStatus): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[StateMachine] Invalid transition: ${this.status} -> ${to}`);
      return false;
    }

    const from = this.status;
    this.status = to;
    console.log(`[StateMachine] Transition: ${from} -> ${to}`);

    // Notify listeners
    this.listeners.forEach(listener => listener(to));

    return true;
  }

  /**
   * Subscribe to status changes
   */
  subscribe(listener: (status: ConversationStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Check status helpers
   */
  isIdle(): boolean {
    return this.status === 'idle';
  }

  isRunning(): boolean {
    return this.status === 'running';
  }

  isPaused(): boolean {
    return this.status === 'paused';
  }

  isCompleted(): boolean {
    return this.status === 'completed';
  }

  isFinishing(): boolean {
    return this.status === 'finishing';
  }

  isActive(): boolean {
    return this.status === 'running' || this.status === 'paused' || this.status === 'finishing';
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.status = 'idle';
    this.listeners.forEach(listener => listener('idle'));
  }
}

/**
 * Turn state machine
 */
export type TurnStatus = 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';

const turnTransitions: Record<TurnStatus, TurnStatus[]> = {
  planned: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [], // Terminal state
  failed: ['running', 'cancelled'], // Can retry
  cancelled: [], // Terminal state
};

export class TurnStateMachine {
  private status: TurnStatus;

  constructor(initialStatus: TurnStatus = 'planned') {
    this.status = initialStatus;
  }

  get currentStatus(): TurnStatus {
    return this.status;
  }

  canTransition(to: TurnStatus): boolean {
    return turnTransitions[this.status].includes(to);
  }

  transition(to: TurnStatus): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[TurnStateMachine] Invalid transition: ${this.status} -> ${to}`);
      return false;
    }

    this.status = to;
    return true;
  }

  isTerminal(): boolean {
    return this.status === 'completed' || this.status === 'cancelled';
  }

  canRetry(): boolean {
    return this.status === 'failed';
  }
}

