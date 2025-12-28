// ============================================
// AI Brainstorm - Turn Manager
// Version: 1.0.0
// ============================================

import type { Agent, Turn, ConversationMode } from '../types';
import { turnStorage, messageStorage } from '../storage/storage-manager';
import { generateTurnId } from '../storage/db';

export interface TurnSchedule {
  round: number;
  sequence: number;
  agentId: string;
  addressedTo?: string;
}

/**
 * Turn Manager - Manages turn-taking logic for all conversation modes
 */
export class TurnManager {
  private conversationId: string;
  private mode: ConversationMode;
  private agents: Agent[];
  private currentRound: number;
  private currentSequence: number;
  private pendingAddresses: Map<string, string> = new Map(); // agentId -> addressing content

  constructor(
    conversationId: string,
    mode: ConversationMode,
    agents: Agent[],
    currentRound: number = 0
  ) {
    this.conversationId = conversationId;
    this.mode = mode;
    this.agents = agents.filter(a => !a.isSecretary); // Exclude secretary from regular turns
    this.currentRound = currentRound;
    this.currentSequence = 0;
  }

  /**
   * Get the next agent to speak based on the conversation mode
   */
  async getNextAgent(): Promise<TurnSchedule | null> {
    switch (this.mode) {
      case 'round-robin':
        return this.getNextRoundRobin();
      case 'moderator':
        return this.getNextModerated();
      case 'dynamic':
        return this.getNextDynamic();
      default:
        return this.getNextRoundRobin();
    }
  }

  /**
   * Round-robin mode: Fixed order, each agent speaks once per round
   */
  private getNextRoundRobin(): TurnSchedule | null {
    if (this.agents.length === 0) return null;

    const sequence = this.currentSequence;
    const round = this.currentRound;

    // Check if we need to advance to next round
    if (sequence >= this.agents.length) {
      this.currentRound++;
      this.currentSequence = 0;
      return {
        round: this.currentRound,
        sequence: 0,
        agentId: this.agents[0].id,
      };
    }

    this.currentSequence++;

    return {
      round,
      sequence,
      agentId: this.agents[sequence].id,
    };
  }

  /**
   * Moderator mode: AI moderator decides who speaks next
   * For now, uses weighted random selection based on participation
   */
  private async getNextModerated(): Promise<TurnSchedule | null> {
    if (this.agents.length === 0) return null;

    const messages = await messageStorage.getByConversation(this.conversationId);
    
    // Calculate participation scores (less participation = higher chance)
    const participationCounts = new Map<string, number>();
    for (const agent of this.agents) {
      participationCounts.set(agent.id, 0);
    }
    
    for (const message of messages) {
      if (message.agentId && participationCounts.has(message.agentId)) {
        participationCounts.set(
          message.agentId,
          (participationCounts.get(message.agentId) || 0) + 1
        );
      }
    }

    // Invert to get weights (less participation = higher weight)
    const maxParticipation = Math.max(...Array.from(participationCounts.values()), 1);
    const weights: Array<{ agentId: string; weight: number }> = [];
    
    for (const [agentId, count] of participationCounts) {
      weights.push({
        agentId,
        weight: maxParticipation - count + 1,
      });
    }

    // Weighted random selection
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const { agentId, weight } of weights) {
      random -= weight;
      if (random <= 0) {
        const sequence = this.currentSequence++;
        return {
          round: this.currentRound,
          sequence,
          agentId,
        };
      }
    }

    // Fallback to first agent
    return {
      round: this.currentRound,
      sequence: this.currentSequence++,
      agentId: this.agents[0].id,
    };
  }

  /**
   * Dynamic mode: Agents can address each other with @mentions
   */
  private async getNextDynamic(): Promise<TurnSchedule | null> {
    if (this.agents.length === 0) return null;

    // Check if there are any pending addresses
    if (this.pendingAddresses.size > 0) {
      const [addressedAgentId] = this.pendingAddresses.entries().next().value as [string, string];
      this.pendingAddresses.delete(addressedAgentId);

      return {
        round: this.currentRound,
        sequence: this.currentSequence++,
        agentId: addressedAgentId,
      };
    }

    // Check recent messages for @mentions
    const recentMessages = await messageStorage.getRecent(this.conversationId, 5);
    for (const message of recentMessages.reverse()) {
      const addressedAgent = this.parseAddressing(message.content);
      if (addressedAgent && addressedAgent !== message.agentId) {
        return {
          round: this.currentRound,
          sequence: this.currentSequence++,
          agentId: addressedAgent,
          addressedTo: message.agentId,
        };
      }
    }

    // Fall back to round-robin if no addressing
    return this.getNextRoundRobin();
  }

  /**
   * Parse @mentions from message content
   */
  private parseAddressing(content: string): string | null {
    const mentionPattern = /@(\w+)/g;
    const matches = content.matchAll(mentionPattern);

    for (const match of matches) {
      const name = match[1].toLowerCase();
      const agent = this.agents.find(
        a => a.name.toLowerCase().includes(name) || 
             a.role.toLowerCase().includes(name)
      );
      if (agent) {
        return agent.id;
      }
    }

    return null;
  }

  /**
   * Queue an agent to respond (for dynamic addressing)
   */
  queueAgent(agentId: string, reason: string): void {
    this.pendingAddresses.set(agentId, reason);
  }

  /**
   * Create a turn record in the database
   */
  async createTurn(schedule: TurnSchedule): Promise<Turn> {
    const turnId = generateTurnId(this.conversationId, schedule.round, schedule.sequence);
    
    // Check if turn already exists (idempotency)
    const existing = await turnStorage.getById(turnId);
    if (existing) {
      return existing;
    }

    return turnStorage.create(
      this.conversationId,
      schedule.agentId,
      schedule.round,
      schedule.sequence
    );
  }

  /**
   * Check if a turn has already been completed
   */
  async isTurnCompleted(round: number, sequence: number): Promise<boolean> {
    const turnId = generateTurnId(this.conversationId, round, sequence);
    return turnStorage.isCompleted(turnId);
  }

  /**
   * Get pending turns (planned but not completed)
   */
  async getPendingTurns(): Promise<Turn[]> {
    const turns = await turnStorage.getByConversation(this.conversationId);
    return turns.filter(t => t.state === 'planned' || t.state === 'running');
  }

  /**
   * Get failed turns that can be retried
   */
  async getFailedTurns(): Promise<Turn[]> {
    const turns = await turnStorage.getByConversation(this.conversationId);
    return turns.filter(t => t.state === 'failed');
  }

  /**
   * Advance to next round
   */
  advanceRound(): void {
    this.currentRound++;
    this.currentSequence = 0;
    this.pendingAddresses.clear();
  }

  /**
   * Get current round number
   */
  getCurrentRound(): number {
    return this.currentRound;
  }

  /**
   * Set current round (for resuming)
   */
  setCurrentRound(round: number): void {
    this.currentRound = round;
    this.currentSequence = 0;
  }

  /**
   * Check if round is complete
   */
  isRoundComplete(): boolean {
    return this.currentSequence >= this.agents.length;
  }

  /**
   * Get agent count (excluding secretary)
   */
  getAgentCount(): number {
    return this.agents.length;
  }

  /**
   * Update agents list (when agents are added/removed)
   */
  updateAgents(agents: Agent[]): void {
    this.agents = agents.filter(a => !a.isSecretary);
  }

  /**
   * Get turn order for display
   */
  getTurnOrder(): Array<{ agentId: string; name: string; order: number }> {
    return this.agents.map((agent, index) => ({
      agentId: agent.id,
      name: agent.name,
      order: index,
    }));
  }
}

