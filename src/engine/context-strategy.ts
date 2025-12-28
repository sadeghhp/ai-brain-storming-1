// ============================================
// AI Brainstorm - Context Window Strategy
// Version: 1.0.0
// ============================================

import type { Message, Agent, UserInterjection, Notebook } from '../types';
import type { LLMMessage } from '../llm/types';
import { countTokens } from '../llm/token-counter';

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
   * Select messages to fit within token budget
   * Priority: Recent messages > User interjections > Older messages
   */
  selectMessages(
    messages: Message[],
    budget: number,
    agentId: string
  ): Message[] {
    if (budget <= 0) return [];

    const selected: Message[] = [];
    let usedTokens = 0;

    // Process messages from most recent to oldest
    const sortedMessages = [...messages].sort((a, b) => b.createdAt - a.createdAt);

    for (const message of sortedMessages) {
      const messageTokens = countTokens(message.content) + 10; // +10 for formatting overhead

      // Prioritize messages that mention this agent or are from this agent
      const isRelevant = 
        message.agentId === agentId ||
        message.addressedTo === agentId ||
        message.type === 'interjection';

      // Always include if relevant and fits
      if (isRelevant && usedTokens + messageTokens <= budget) {
        selected.push(message);
        usedTokens += messageTokens;
        continue;
      }

      // Include other messages if they fit
      if (usedTokens + messageTokens <= budget) {
        selected.push(message);
        usedTokens += messageTokens;
      }
    }

    // Reverse to restore chronological order
    return selected.reverse();
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

