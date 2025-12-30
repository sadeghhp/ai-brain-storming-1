// ============================================
// AI Brainstorm - Result Manager
// ============================================

import { SecretaryAgent } from '../agents/secretary';
import { resultDraftStorage, messageStorage, agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { ResultDraft, Conversation, Message } from '../types';

/**
 * Result Manager - Manages the result draft and final output
 */
export class ResultManager {
  private conversationId: string;
  private secretary: SecretaryAgent | null = null;
  private lastUpdateRound: number = 0;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
  }

  /**
   * Initialize with secretary agent
   */
  async initialize(): Promise<void> {
    this.secretary = await SecretaryAgent.load(this.conversationId);
    if (!this.secretary) {
      console.warn('[ResultManager] No secretary agent found');
    }
  }

  /**
   * Get current result draft
   */
  async getDraft(): Promise<ResultDraft | undefined> {
    return resultDraftStorage.get(this.conversationId);
  }

  /**
   * Update result draft with new content
   */
  async updateDraft(updates: Partial<ResultDraft>): Promise<ResultDraft> {
    const draft = await resultDraftStorage.update(this.conversationId, updates);
    eventBus.emit('draft:updated', draft);
    return draft;
  }

  /**
   * Append content to the draft
   */
  async appendContent(content: string): Promise<ResultDraft> {
    const draft = await resultDraftStorage.appendContent(this.conversationId, content);
    eventBus.emit('draft:updated', draft);
    return draft;
  }

  /**
   * Generate incremental update after a round
   */
  async incrementalUpdate(currentRound: number): Promise<void> {
    if (!this.secretary || currentRound <= this.lastUpdateRound) {
      return;
    }

    try {
      // Get messages from the new round
      const messages = await messageStorage.getByRound(this.conversationId, currentRound);
      
      if (messages.length === 0) {
        return;
      }

      await this.secretary.incrementalUpdate(messages);
      this.lastUpdateRound = currentRound;
    } catch (error) {
      console.error('[ResultManager] Incremental update failed:', error);
    }
  }

  /**
   * Generate complete result draft
   */
  async generateFinalDraft(conversation: Conversation): Promise<ResultDraft | null> {
    if (!this.secretary) {
      // Generate simple draft without secretary
      return this.generateSimpleDraft(conversation);
    }

    try {
      return await this.secretary.generateResultDraft(conversation);
    } catch (error) {
      console.error('[ResultManager] Failed to generate final draft:', error);
      return this.generateSimpleDraft(conversation);
    }
  }

  /**
   * Generate a simple draft without AI summarization
   */
  private async generateSimpleDraft(conversation: Conversation): Promise<ResultDraft> {
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);

    // Build a simple structured summary
    const content = this.buildSimpleSummary(conversation, messages, agents);

    return this.updateDraft({
      content,
      summary: `Discussion on "${conversation.subject}" with ${agents.length} participants.`,
      keyDecisions: 'Review the full content for decisions.',
    });
  }

  /**
   * Build simple summary from messages
   */
  private buildSimpleSummary(
    conversation: Conversation,
    messages: Message[],
    agents: Array<{ id: string; name: string; isSecretary: boolean }>
  ): string {
    const parts: string[] = [];

    parts.push(`# Discussion Summary`);
    parts.push(`\n## Topic\n${conversation.subject}`);
    parts.push(`\n## Goal\n${conversation.goal}`);
    
    parts.push(`\n## Participants`);
    for (const agent of agents.filter(a => !a.isSecretary)) {
      parts.push(`- ${agent.name}`);
    }

    parts.push(`\n## Discussion Highlights`);

    // Get highly rated messages
    const highlightedMessages = messages
      .filter(m => m.weight >= 2)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);

    if (highlightedMessages.length > 0) {
      for (const message of highlightedMessages) {
        const sender = agents.find(a => a.id === message.agentId);
        parts.push(`\n> **${sender?.name || 'Unknown'}**: ${message.content.slice(0, 200)}${message.content.length > 200 ? '...' : ''}`);
      }
    } else {
      // Just list last few messages
      const recentMessages = messages.slice(-5);
      for (const message of recentMessages) {
        const sender = agents.find(a => a.id === message.agentId);
        parts.push(`\n**${sender?.name || 'Unknown'}**: ${message.content.slice(0, 200)}${message.content.length > 200 ? '...' : ''}`);
      }
    }

    parts.push(`\n## Statistics`);
    parts.push(`- Total messages: ${messages.length}`);
    parts.push(`- Rounds completed: ${conversation.currentRound}`);
    parts.push(`- Session completed: ${new Date().toLocaleString()}`);

    return parts.join('\n');
  }

  /**
   * Export result as Markdown
   */
  async exportAsMarkdown(): Promise<string> {
    const draft = await this.getDraft();
    if (!draft) {
      return '# No result draft available';
    }

    return `# ${draft.summary || 'Discussion Result'}

${draft.content || 'No content available.'}

## Key Decisions

${draft.keyDecisions || 'No key decisions recorded.'}

---
*Generated by AI Brainstorm*
*Last updated: ${new Date(draft.updatedAt).toLocaleString()}*
`;
  }

  /**
   * Export result as JSON
   */
  async exportAsJSON(): Promise<string> {
    const draft = await this.getDraft();
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);

    return JSON.stringify({
      draft,
      messages,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        expertise: a.expertise,
      })),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  /**
   * Clear the result draft
   */
  async clear(): Promise<void> {
    await this.updateDraft({
      content: '',
      summary: '',
      keyDecisions: '',
      executiveSummary: '',
      themes: [],
      consensusAreas: '',
      disagreements: '',
      recommendations: '',
      actionItems: '',
      openQuestions: '',
      roundSummaries: [],
    });
    this.lastUpdateRound = 0;
  }
}

