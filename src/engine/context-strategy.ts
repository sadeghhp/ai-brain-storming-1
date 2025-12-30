// ============================================
// AI Brainstorm - Context Window Strategy
// ============================================

import type { Message, Agent, UserInterjection, Notebook } from '../types';
import type { LLMMessage } from '../llm/types';
import { countTokens } from '../llm/token-counter';
import { TIME_DECAY, CONTEXT_BUDGET, MESSAGE_IMPORTANCE, TOKEN_ESTIMATION } from '../constants';

/**
 * Message with calculated importance score for prioritized selection
 */
interface ScoredMessage {
  message: Message;
  score: number;
  tokens: number;
}

/**
 * Time decay configuration
 * Controls how much older messages are penalized
 */
interface TimeDecayConfig {
  enabled: boolean;
  halfLifeMs: number;      // Time in ms for score to decay by 50%
  minDecayFactor: number;  // Minimum decay factor (0-1), prevents complete decay
  roundDecay: number;      // Penalty per round old (0-1 scale)
}

const DEFAULT_TIME_DECAY: TimeDecayConfig = {
  enabled: TIME_DECAY.ENABLED,
  halfLifeMs: TIME_DECAY.HALF_LIFE_MS,
  minDecayFactor: TIME_DECAY.MIN_DECAY_FACTOR,
  roundDecay: TIME_DECAY.ROUND_DECAY,
};

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
  private timeDecay: TimeDecayConfig;

  constructor(
    maxTokens: number, 
    responseReserve: number = CONTEXT_BUDGET.RESPONSE_RESERVE,
    timeDecay: Partial<TimeDecayConfig> = {}
  ) {
    this.maxTokens = maxTokens;
    this.responseReserve = responseReserve;
    this.timeDecay = { ...DEFAULT_TIME_DECAY, ...timeDecay };
  }

  /**
   * Calculate token budget for each component
   */
  calculateBudget(systemPromptTokens: number): ContextBudget {
    const available = this.maxTokens - this.responseReserve - systemPromptTokens;

    return {
      total: this.maxTokens,
      systemPrompt: systemPromptTokens,
      notebook: Math.floor(available * CONTEXT_BUDGET.NOTEBOOK),
      interjections: Math.floor(available * CONTEXT_BUDGET.INTERJECTIONS),
      messages: Math.floor(available * CONTEXT_BUDGET.MESSAGES),
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
   * - Time decay (older messages get progressively lower scores)
   * - Round decay (messages from earlier rounds get penalty)
   * 
   * @param messages - All messages to consider
   * @param budget - Token budget for messages
   * @param agentId - Current agent's ID (for relevance scoring)
   * @param currentRound - Current conversation round (for round-based decay)
   */
  selectMessages(
    messages: Message[],
    budget: number,
    agentId: string,
    currentRound: number = 0
  ): Message[] {
    if (budget <= 0 || messages.length === 0) return [];

    const now = Date.now();

    // Calculate importance scores for all messages
    const scoredMessages: ScoredMessage[] = messages.map((message, index) => ({
      message,
      score: this.calculateMessageImportance(message, agentId, index, messages.length, currentRound, now),
      tokens: countTokens(message.content) + TOKEN_ESTIMATION.MESSAGE_OVERHEAD,
    }));

    // Separate critical messages (must include) from regular messages
    const criticalMessages = scoredMessages.filter(sm => sm.score >= MESSAGE_IMPORTANCE.CRITICAL_THRESHOLD);
    const regularMessages = scoredMessages.filter(sm => sm.score < MESSAGE_IMPORTANCE.CRITICAL_THRESHOLD);

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
   * 
   * Time decay applies to regular messages (not critical ones like opening/summary)
   * to progressively reduce the importance of older content.
   */
  private calculateMessageImportance(
    message: Message,
    agentId: string,
    index: number,
    totalMessages: number,
    currentRound: number = 0,
    now: number = Date.now()
  ): number {
    let score = 0;
    let isCritical = false;

    // Message type importance (critical types get 100+ score)
    switch (message.type) {
      case 'opening':
        score += MESSAGE_IMPORTANCE.OPENING;
        isCritical = true;
        break;
      case 'summary':
        score += MESSAGE_IMPORTANCE.SUMMARY;
        isCritical = true;
        break;
      case 'interjection':
        score += MESSAGE_IMPORTANCE.INTERJECTION;
        break;
      case 'system':
        score += MESSAGE_IMPORTANCE.SYSTEM;
        break;
      case 'response':
        score += MESSAGE_IMPORTANCE.RESPONSE;
        break;
    }

    // Relevance to current agent
    if (message.agentId === agentId) {
      score += MESSAGE_IMPORTANCE.OWN_MESSAGE;
    }
    if (message.addressedTo === agentId) {
      score += MESSAGE_IMPORTANCE.ADDRESSED_TO;
    }

    // User weight/votes (each upvote adds 10, downvotes subtract)
    score += message.weight * 10;

    // Recency bonus (newer messages get slight preference)
    const recencyFactor = index / Math.max(totalMessages - 1, 1);
    score += Math.floor(recencyFactor * MESSAGE_IMPORTANCE.RECENCY_BONUS);

    // Position bonuses (preserve conversation structure)
    if (index === 0) {
      score += MESSAGE_IMPORTANCE.FIRST_MESSAGE;
    }
    if (index >= totalMessages - 3) {
      score += MESSAGE_IMPORTANCE.RECENT_CONTEXT;
    }

    // Apply time-based and round-based decay for non-critical messages
    if (this.timeDecay.enabled && !isCritical) {
      const decayFactor = this.calculateTimeDecay(message, currentRound, now);
      score = Math.floor(score * decayFactor);
    }

    return score;
  }

  /**
   * Calculate time decay factor for a message
   * Returns a value between minDecayFactor and 1.0
   */
  private calculateTimeDecay(
    message: Message,
    currentRound: number,
    now: number
  ): number {
    let decayFactor = 1.0;

    // Time-based decay (exponential decay based on age)
    const ageMs = now - message.createdAt;
    if (ageMs > 0 && this.timeDecay.halfLifeMs > 0) {
      // Exponential decay: factor = 2^(-age/halfLife)
      const halfLives = ageMs / this.timeDecay.halfLifeMs;
      const timeFactor = Math.pow(0.5, halfLives);
      decayFactor *= timeFactor;
    }

    // Round-based decay (linear penalty per round old)
    const roundsOld = currentRound - message.round;
    if (roundsOld > 0 && this.timeDecay.roundDecay > 0) {
      const roundFactor = Math.max(0, 1 - (roundsOld * this.timeDecay.roundDecay));
      decayFactor *= roundFactor;
    }

    // Apply minimum decay floor
    return Math.max(this.timeDecay.minDecayFactor, decayFactor);
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
      const tokens = countTokens(interjection.content) + TOKEN_ESTIMATION.MESSAGE_OVERHEAD;

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
   * 
   * @param systemPrompt - The system prompt for the agent
   * @param messages - All conversation messages
   * @param interjections - User interjections
   * @param notebook - Agent's notebook (if any)
   * @param agentId - Current agent's ID
   * @param agents - All agents in the conversation
   * @param currentRound - Current conversation round (for time decay)
   */
  buildOptimizedContext(
    systemPrompt: string,
    messages: Message[],
    interjections: UserInterjection[],
    notebook: Notebook | null,
    agentId: string,
    agents: Agent[],
    currentRound: number = 0
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

    // Messages (with time decay based on current round)
    const selectedMessages = this.selectMessages(messages, budget.messages, agentId, currentRound);
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

