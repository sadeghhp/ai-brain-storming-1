// ============================================
// AI Brainstorm - User Interjection Handler
// ============================================

import { interjectionStorage, messageStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { UserInterjection } from '../types';

export type InterjectionMode = 'immediate' | 'next_round' | 'queued';

/**
 * User Interjection Handler
 * Manages user inputs during conversations
 */
export class UserInterjectionHandler {
  private conversationId: string;
  private currentRound: number = 0;
  private immediateQueue: UserInterjection[] = [];

  constructor(conversationId: string, currentRound: number = 0) {
    this.conversationId = conversationId;
    this.currentRound = currentRound;
  }

  /**
   * Add a user interjection
   */
  async addInterjection(
    content: string,
    mode: InterjectionMode = 'next_round'
  ): Promise<UserInterjection> {
    const interjection = await interjectionStorage.create(
      this.conversationId,
      content,
      mode === 'immediate' ? this.currentRound : this.currentRound + 1
    );

    // Also create as a message for the conversation history
    const message = await messageStorage.create({
      conversationId: this.conversationId,
      content,
      round: this.currentRound,
      type: 'interjection',
    });

    eventBus.emit('user:interjection', interjection);
    eventBus.emit('message:created', message);

    if (mode === 'immediate') {
      this.immediateQueue.push(interjection);
    }

    return interjection;
  }

  /**
   * Get unprocessed interjections
   */
  async getUnprocessed(): Promise<UserInterjection[]> {
    return interjectionStorage.getUnprocessed(this.conversationId);
  }

  /**
   * Get immediate interjections that should be processed right away
   */
  getImmediateInterjections(): UserInterjection[] {
    const immediate = [...this.immediateQueue];
    this.immediateQueue = [];
    return immediate;
  }

  /**
   * Check if there are immediate interjections waiting
   */
  hasImmediateInterjections(): boolean {
    return this.immediateQueue.length > 0;
  }

  /**
   * Mark an interjection as processed
   */
  async markProcessed(id: string): Promise<void> {
    await interjectionStorage.markProcessed(id);
  }

  /**
   * Mark all unprocessed interjections as processed
   */
  async markAllProcessed(): Promise<void> {
    const unprocessed = await this.getUnprocessed();
    for (const interjection of unprocessed) {
      await this.markProcessed(interjection.id);
    }
  }

  /**
   * Get all interjections for the conversation
   */
  async getAll(): Promise<UserInterjection[]> {
    return interjectionStorage.getByConversation(this.conversationId);
  }

  /**
   * Update current round
   */
  setCurrentRound(round: number): void {
    this.currentRound = round;
  }

  /**
   * Get interjections for a specific round
   */
  async getForRound(round: number): Promise<UserInterjection[]> {
    const all = await this.getAll();
    return all.filter(i => i.afterRound === round);
  }

  /**
   * Get the most recent interjection
   */
  async getMostRecent(): Promise<UserInterjection | undefined> {
    const all = await this.getAll();
    return all.sort((a, b) => b.createdAt - a.createdAt)[0];
  }

  /**
   * Count unprocessed interjections
   */
  async countUnprocessed(): Promise<number> {
    const unprocessed = await this.getUnprocessed();
    return unprocessed.length;
  }

  /**
   * Clear all interjections (for reset)
   */
  async clear(): Promise<void> {
    // Note: This doesn't delete from DB, just marks all as processed
    await this.markAllProcessed();
    this.immediateQueue = [];
  }

  /**
   * Validate interjection content
   */
  static validate(content: string): { valid: boolean; error?: string } {
    if (!content || content.trim().length === 0) {
      return { valid: false, error: 'Content cannot be empty' };
    }

    if (content.length > 2000) {
      return { valid: false, error: 'Content too long (max 2000 characters)' };
    }

    return { valid: true };
  }
}

