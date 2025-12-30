// ============================================
// AI Brainstorm - State Machine Tests
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConversationStateMachine, TurnStateMachine } from '../src/engine/state-machine';

describe('ConversationStateMachine', () => {
  let machine: ConversationStateMachine;

  beforeEach(() => {
    machine = new ConversationStateMachine();
  });

  describe('initialization', () => {
    it('should start in idle state', () => {
      expect(machine.currentStatus).toBe('idle');
      expect(machine.isIdle()).toBe(true);
    });

    it('should accept custom initial state', () => {
      const pausedMachine = new ConversationStateMachine('paused');
      expect(pausedMachine.currentStatus).toBe('paused');
      expect(pausedMachine.isPaused()).toBe(true);
    });
  });

  describe('valid transitions', () => {
    it('should transition from idle to running', () => {
      expect(machine.canTransition('running')).toBe(true);
      expect(machine.transition('running')).toBe(true);
      expect(machine.isRunning()).toBe(true);
    });

    it('should transition from running to paused', () => {
      machine.transition('running');
      expect(machine.canTransition('paused')).toBe(true);
      expect(machine.transition('paused')).toBe(true);
      expect(machine.isPaused()).toBe(true);
    });

    it('should transition from running to completed', () => {
      machine.transition('running');
      expect(machine.canTransition('completed')).toBe(true);
      expect(machine.transition('completed')).toBe(true);
      expect(machine.isCompleted()).toBe(true);
    });

    it('should transition from running to finishing', () => {
      machine.transition('running');
      expect(machine.canTransition('finishing')).toBe(true);
      expect(machine.transition('finishing')).toBe(true);
      expect(machine.isFinishing()).toBe(true);
    });

    it('should transition from finishing to completed', () => {
      machine.transition('running');
      machine.transition('finishing');
      expect(machine.canTransition('completed')).toBe(true);
      expect(machine.transition('completed')).toBe(true);
      expect(machine.isCompleted()).toBe(true);
    });

    it('should transition from paused to running', () => {
      machine.transition('running');
      machine.transition('paused');
      expect(machine.canTransition('running')).toBe(true);
      expect(machine.transition('running')).toBe(true);
      expect(machine.isRunning()).toBe(true);
    });

    it('should transition from completed back to idle for reset', () => {
      machine.transition('running');
      machine.transition('completed');
      expect(machine.canTransition('idle')).toBe(true);
      expect(machine.transition('idle')).toBe(true);
      expect(machine.isIdle()).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('should not transition from idle to paused', () => {
      expect(machine.canTransition('paused')).toBe(false);
      expect(machine.transition('paused')).toBe(false);
      expect(machine.isIdle()).toBe(true);
    });

    it('should not transition from idle to completed', () => {
      expect(machine.canTransition('completed')).toBe(false);
      expect(machine.transition('completed')).toBe(false);
      expect(machine.isIdle()).toBe(true);
    });

    it('should not transition from idle to finishing', () => {
      expect(machine.canTransition('finishing')).toBe(false);
      expect(machine.transition('finishing')).toBe(false);
      expect(machine.isIdle()).toBe(true);
    });

    it('should not transition from paused to completed directly', () => {
      machine.transition('running');
      machine.transition('paused');
      expect(machine.canTransition('completed')).toBe(false);
      expect(machine.transition('completed')).toBe(false);
      expect(machine.isPaused()).toBe(true);
    });
  });

  describe('isActive', () => {
    it('should return true for running state', () => {
      machine.transition('running');
      expect(machine.isActive()).toBe(true);
    });

    it('should return true for paused state', () => {
      machine.transition('running');
      machine.transition('paused');
      expect(machine.isActive()).toBe(true);
    });

    it('should return true for finishing state', () => {
      machine.transition('running');
      machine.transition('finishing');
      expect(machine.isActive()).toBe(true);
    });

    it('should return false for idle state', () => {
      expect(machine.isActive()).toBe(false);
    });

    it('should return false for completed state', () => {
      machine.transition('running');
      machine.transition('completed');
      expect(machine.isActive()).toBe(false);
    });
  });

  describe('subscriptions', () => {
    it('should notify subscribers on state change', () => {
      const callback = vi.fn();
      machine.subscribe(callback);
      
      machine.transition('running');
      
      expect(callback).toHaveBeenCalledWith('running');
    });

    it('should allow unsubscribing', () => {
      const callback = vi.fn();
      const unsubscribe = machine.subscribe(callback);
      
      unsubscribe();
      machine.transition('running');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not notify on failed transition', () => {
      const callback = vi.fn();
      machine.subscribe(callback);
      
      machine.transition('completed'); // Invalid from idle
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('should reset to idle state', () => {
      machine.transition('running');
      machine.transition('completed');
      
      machine.reset();
      
      expect(machine.isIdle()).toBe(true);
    });

    it('should notify subscribers on reset', () => {
      machine.transition('running');
      
      const callback = vi.fn();
      machine.subscribe(callback);
      
      machine.reset();
      
      expect(callback).toHaveBeenCalledWith('idle');
    });
  });
});

describe('TurnStateMachine', () => {
  let machine: TurnStateMachine;

  beforeEach(() => {
    machine = new TurnStateMachine();
  });

  describe('initialization', () => {
    it('should start in planned state', () => {
      expect(machine.currentStatus).toBe('planned');
    });
  });

  describe('valid transitions', () => {
    it('should transition from planned to running', () => {
      expect(machine.canTransition('running')).toBe(true);
      expect(machine.transition('running')).toBe(true);
      expect(machine.currentStatus).toBe('running');
    });

    it('should transition from running to completed', () => {
      machine.transition('running');
      expect(machine.canTransition('completed')).toBe(true);
      expect(machine.transition('completed')).toBe(true);
      expect(machine.currentStatus).toBe('completed');
    });

    it('should transition from running to failed', () => {
      machine.transition('running');
      expect(machine.canTransition('failed')).toBe(true);
      expect(machine.transition('failed')).toBe(true);
      expect(machine.currentStatus).toBe('failed');
    });

    it('should transition from planned to cancelled', () => {
      expect(machine.canTransition('cancelled')).toBe(true);
      expect(machine.transition('cancelled')).toBe(true);
      expect(machine.currentStatus).toBe('cancelled');
    });

    it('should transition from running to cancelled', () => {
      machine.transition('running');
      expect(machine.canTransition('cancelled')).toBe(true);
      expect(machine.transition('cancelled')).toBe(true);
      expect(machine.currentStatus).toBe('cancelled');
    });
  });

  describe('invalid transitions', () => {
    it('should not transition from planned to completed', () => {
      expect(machine.canTransition('completed')).toBe(false);
      expect(machine.transition('completed')).toBe(false);
      expect(machine.currentStatus).toBe('planned');
    });

    it('should not transition from completed to running', () => {
      machine.transition('running');
      machine.transition('completed');
      expect(machine.canTransition('running')).toBe(false);
      expect(machine.transition('running')).toBe(false);
      expect(machine.currentStatus).toBe('completed');
    });

    it('should not transition from cancelled to running', () => {
      machine.transition('cancelled');
      expect(machine.canTransition('running')).toBe(false);
      expect(machine.transition('running')).toBe(false);
      expect(machine.currentStatus).toBe('cancelled');
    });
  });
});

