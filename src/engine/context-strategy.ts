// ============================================
// AI Brainstorm - Context Window Strategy
// Version: 1.1.0
// ============================================

import type { Message, Agent, UserInterjection, Notebook } from '../types';
import type { LLMMessage } from '../llm/types';
import { countTokens } from '../llm/token-counter';

/**
 * Message with calculated importance score for prioritized selection
 */
interface ScoredMessage {
  message: Message;
  score: number;
  tokens: number;
}

export interface ContextBudget {
  total: number;
  systemPrompt: number;
  notebook: number;
  interjections: number;
  messages: number;
  responseReserve: number;
}

/**
 * Context Strategy - Manages token budget allocation
 */
export class ContextStrategy {
  private maxTokens: number;
  private responseReserve: number;

  constructor(maxTokens: number, responseReserve: number = 1000) {
    this.maxTokens = maxTokens;
    this.responseReserve = responseReserve;
  }

  /**
   * Calculate token budget for each component
   */
  calculateBudget(systemPromptTokens: number): ContextBudget {
    const available = this.maxTokens - this.responseReserve - systemPromptTokens;

    return {
      total: this.maxTokens,
      systemPrompt: systemPromptTokens,
      notebook: Math.floor(available * 0.1), // 10% for notebook
      interjections: Math.floor(available * 0.15), // 15% for user interjections
      messages: Math.floor(available * 0.75), // 75% for messages
      responseReserve: this.responseReserve,
    };
  }

  /**
   * Select messages to fit within token budget using importance-based scoring
   * 
   * Scoring factors:
   * - Message type (opening, summary, interjection get priority)
   * - User votes/weight (highly rated messages)
   * - Relevance to current agent (addressed to, from same agent)
   * - Recency (recent messages get slight boost)
   * - Position in conversation (first/last messages preserved)
   */
  selectMessages(
    messages: Message[],
    budget: number,
    agentId: string
  ): Message[] {
    if (budget <= 0 || messages.length === 0) return [];

    // Calculate importance scores for all messages
    const scoredMessages: ScoredMessage[] = messages.map((message, index) => ({
      message,
      score: this.calculateMessageImportance(message, agentId, index, messages.length),
      tokens: countTokens(message.content) + 10, // +10 for formatting overhead
    }));

    // Separate critical messages (must include) from regular messages
    const criticalMessages = scoredMessages.filter(sm => sm.score >= 100);
    const regularMessages = scoredMessages.filter(sm => sm.score < 100);

    // Sort regular messages by score (highest first)
    regularMessages.sort((a, b) => b.score - a.score);

    const selected: ScoredMessage[] = [];
    let usedTokens = 0;

    // First, include all critical messages if they fit
    for (const sm of criticalMessages) {
      if (usedTokens + sm.tokens <= budget) {
        selected.push(sm);
        usedTokens += sm.tokens;
      }
    }

    // Then add regular messages by importance score
    for (const sm of regularMessages) {
      if (usedTokens + sm.tokens <= budget) {
        selected.push(sm);
        usedTokens += sm.tokens;
      }
    }

    // Sort selected messages back to chronological order
    selected.sort((a, b) => a.message.createdAt - b.message.createdAt);

    return selected.map(sm => sm.message);
  }

  /**
   * Calculate importance score for a message
   * Higher score = more important to include
   */
  private calculateMessageImportance(
    message: Message,
    agentId: string,
    index: number,
    totalMessages: number
  ): number {
    let score = 0;

    // Message type importance (critical types get 100+ score)
    switch (message.type) {
      case 'opening':
        score += 150; // Opening statement is critical context
        break;
      case 'summary':
        score += 120; // Secretary summaries provide condensed context
        break;
      case 'interjection':
        score += 80; // User guidance is high priority
        break;
      case 'system':
        score += 70; // System messages (round decisions, etc.)
        break;
      case 'response':
        score += 30; // Base score for regular responses
        break;
    }

    // Relevance to current agent
    if (message.agentId === agentId) {
      score += 40; // Own previous messages (continuity)
    }
    if (message.addressedTo === agentId) {
      score += 50; // Messages addressed to this agent
    }

    // User weight/votes (each upvote adds 10, downvotes subtract)
    score += message.weight * 10;

    // Recency bonus (newer messages get slight preference)
    // Scale: most recent gets +20, oldest gets +0
    const recencyFactor = index / Math.max(totalMessages - 1, 1);
    score += Math.floor(recencyFactor * 20);

    // Position bonuses (preserve conversation structure)
    if (index === 0) {
      score += 30; // First message (conversation opener)
    }
    if (index >= totalMessages - 3) {
      score += 25; // Last 3 messages (recent context)
    }

    return score;
  }

  /**
   * Select user interjections to include
   */
  selectInterjections(
    interjections: UserInterjection[],
    budget: number
  ): UserInterjection[] {
    if (budget <= 0) return [];

    const selected: UserInterjection[] = [];
    let usedTokens = 0;

    // Process from most recent
    const sorted = [...interjections].sort((a, b) => b.createdAt - a.createdAt);

    for (const interjection of sorted) {
      const tokens = countTokens(interjection.content) + 10;

      if (usedTokens + tokens <= budget) {
        selected.push(interjection);
        usedTokens += tokens;
      }
    }

    return selected.reverse();
  }

  /**
   * Truncate notebook to fit budget
   */
  truncateNotebook(notes: string, budget: number): string {
    if (!notes || budget <= 0) return '';

    const tokens = countTokens(notes);
    if (tokens <= budget) return notes;

    // Keep most recent notes
    const entries = notes.split('\n---\n');
    let result = '';
    let usedTokens = 0;

    for (let i = entries.length - 1; i >= 0; i--) {
      const entryTokens = countTokens(entries[i]);
      if (usedTokens + entryTokens <= budget) {
        result = entries[i] + (result ? '\n---\n' + result : '');
        usedTokens += entryTokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Build optimized context for an agent
   */
  buildOptimizedContext(
    systemPrompt: string,
    messages: Message[],
    interjections: UserInterjection[],
    notebook: Notebook | null,
    agentId: string,
    agents: Agent[]
  ): LLMMessage[] {
    const systemTokens = countTokens(systemPrompt);
    const budget = this.calculateBudget(systemTokens);

    const result: LLMMessage[] = [];

    // System prompt
    result.push({ role: 'system', content: systemPrompt });

    // Notebook (if available and has content)
    if (notebook?.notes) {
      const truncatedNotes = this.truncateNotebook(notebook.notes, budget.notebook);
      if (truncatedNotes) {
        result.push({
          role: 'system',
          content: `Your notes from this discussion:\n${truncatedNotes}`,
        });
      }
    }

    // User interjections
    const selectedInterjections = this.selectInterjections(interjections, budget.interjections);
    for (const interjection of selectedInterjections) {
      result.push({
        role: 'user',
        content: `[USER GUIDANCE]: ${interjection.content}`,
      });
    }

    // Messages
    const selectedMessages = this.selectMessages(messages, budget.messages, agentId);
    for (const message of selectedMessages) {
      const sender = agents.find(a => a.id === message.agentId);
      const senderName = sender?.name || 'Unknown';

      if (message.agentId === agentId) {
        result.push({ role: 'assistant', content: message.content });
      } else if (message.type === 'interjection') {
        result.push({ role: 'user', content: `[USER]: ${message.content}` });
      } else {
        const addressing = message.addressedTo
          ? ` (to ${agents.find(a => a.id === message.addressedTo)?.name || 'someone'})`
          : '';
        result.push({
          role: 'user',
          content: `[${senderName}]${addressing}: ${message.content}`,
        });
      }
    }

    return result;
  }

  /**
   * Estimate if we need to summarize older content
   */
  needsSummarization(messages: Message[]): boolean {
    const totalTokens = messages.reduce(
      (sum, m) => sum + countTokens(m.content),
      0
    );
    return totalTokens > this.maxTokens * 0.8;
  }

  /**
   * Get messages that should be summarized
   */
  getMessagesForSummarization(messages: Message[]): Message[] {
    const budget = this.maxTokens * 0.6; // Keep 60% as detailed
    let usedTokens = 0;

    // Find cutoff point
    const sorted = [...messages].sort((a, b) => b.createdAt - a.createdAt);
    let cutoffIndex = 0;

    for (let i = 0; i < sorted.length; i++) {
      usedTokens += countTokens(sorted[i].content);
      if (usedTokens > budget) {
        cutoffIndex = i;
        break;
      }
    }

    // Return older messages for summarization
    return sorted.slice(cutoffIndex).reverse();
  }
}

