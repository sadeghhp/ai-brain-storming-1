// ============================================
// AI Brainstorm - Context Builder
// Version: 1.0.0
// ============================================

import type { Agent, Conversation, Message, UserInterjection, Notebook } from '../types';
import type { LLMMessage } from '../llm/types';
import { buildSystemPrompt } from '../llm/prompt-builder';
import { countTokens } from '../llm/token-counter';
import { ContextStrategy } from './context-strategy';

export interface ContextComponents {
  systemPrompt: string;
  notebook: string;
  interjections: UserInterjection[];
  messages: Message[];
  promptMessages: LLMMessage[];
}

/**
 * Context Builder - Assembles context for LLM requests
 */
export class ContextBuilder {
  private conversation: Conversation;
  private strategy: ContextStrategy;

  constructor(conversation: Conversation) {
    this.conversation = conversation;
    this.strategy = new ContextStrategy(
      conversation.maxContextTokens,
      1000
    );
  }

  /**
   * Build complete context for an agent's turn
   */
  build(
    agent: Agent,
    allAgents: Agent[],
    messages: Message[],
    interjections: UserInterjection[],
    notebook: Notebook | null,
    secretarySummary?: string
  ): ContextComponents {
    // Build system prompt
    const systemPrompt = buildSystemPrompt(agent, this.conversation);
    const systemTokens = countTokens(systemPrompt);

    // Calculate budget
    const budget = this.strategy.calculateBudget(systemTokens);

    // Select and truncate components
    const truncatedNotebook = notebook?.notes 
      ? this.strategy.truncateNotebook(notebook.notes, budget.notebook)
      : '';

    const selectedInterjections = this.strategy.selectInterjections(
      interjections,
      budget.interjections
    );

    const selectedMessages = this.strategy.selectMessages(
      messages,
      budget.messages,
      agent.id
    );

    // Build LLM messages
    const promptMessages = this.buildPromptMessages(
      systemPrompt,
      agent,
      allAgents,
      selectedMessages,
      selectedInterjections,
      truncatedNotebook,
      secretarySummary
    );

    return {
      systemPrompt,
      notebook: truncatedNotebook,
      interjections: selectedInterjections,
      messages: selectedMessages,
      promptMessages,
    };
  }

  /**
   * Build the array of LLM messages
   */
  private buildPromptMessages(
    systemPrompt: string,
    agent: Agent,
    allAgents: Agent[],
    messages: Message[],
    interjections: UserInterjection[],
    notebook: string,
    secretarySummary?: string
  ): LLMMessage[] {
    const result: LLMMessage[] = [];

    // System prompt
    result.push({ role: 'system', content: systemPrompt });

    // Secretary summary (if available)
    if (secretarySummary) {
      result.push({
        role: 'system',
        content: `Current discussion summary:\n${secretarySummary}`,
      });
    }

    // Notebook
    if (notebook) {
      result.push({
        role: 'system',
        content: `Your notes:\n${notebook}`,
      });
    }

    // User interjections (high priority)
    for (const interjection of interjections) {
      result.push({
        role: 'user',
        content: `[USER GUIDANCE]: ${interjection.content}`,
      });
    }

    // Conversation messages
    for (const message of messages) {
      result.push(this.formatMessage(message, agent, allAgents));
    }

    // Final prompt
    result.push(this.buildFinalPrompt(agent, allAgents));

    return result;
  }

  /**
   * Format a single message for the LLM
   */
  private formatMessage(
    message: Message,
    currentAgent: Agent,
    allAgents: Agent[]
  ): LLMMessage {
    const sender = allAgents.find(a => a.id === message.agentId);

    // Own messages are assistant role
    if (message.agentId === currentAgent.id) {
      return { role: 'assistant', content: message.content };
    }

    // User interjections
    if (message.type === 'interjection') {
      return { role: 'user', content: `[USER]: ${message.content}` };
    }

    // System messages
    if (message.type === 'system') {
      return { role: 'system', content: message.content };
    }

    // Other agents' messages
    const senderName = sender?.name || 'Unknown';
    let prefix = `[${senderName}]`;

    // Add addressing info
    if (message.addressedTo) {
      const addressee = allAgents.find(a => a.id === message.addressedTo);
      prefix += ` (to ${addressee?.name || 'someone'})`;
    }

    // Add weight indicator if significant
    if (message.weight >= 3) {
      prefix += ' ⭐'; // Highly rated message
    }

    return {
      role: 'user',
      content: `${prefix}: ${message.content}`,
    };
  }

  /**
   * Build the final prompt asking for the agent's response
   */
  private buildFinalPrompt(agent: Agent, allAgents: Agent[]): LLMMessage {
    const otherAgents = allAgents
      .filter(a => a.id !== agent.id && !a.isSecretary)
      .map(a => a.name);

    if (agent.isSecretary) {
      return {
        role: 'user',
        content: `As the secretary, provide a brief update on the key points discussed. Focus on decisions, insights, and any emerging consensus.`,
      };
    }

    const prompt = otherAgents.length > 0
      ? `It's your turn, ${agent.name}. Share your perspective. You can address others (${otherAgents.join(', ')}) using @name if you'd like them to respond.`
      : `It's your turn, ${agent.name}. Share your perspective on the topic.`;

    return { role: 'user', content: prompt };
  }

  /**
   * Get estimated token usage for the context
   */
  estimateTokens(components: ContextComponents): number {
    let total = 0;

    for (const message of components.promptMessages) {
      total += countTokens(message.content) + 4; // 4 tokens overhead per message
    }

    return total;
  }

  /**
   * Check if context needs summarization
   */
  needsSummarization(messages: Message[]): boolean {
    return this.strategy.needsSummarization(messages);
  }

  /**
   * Get messages that should be summarized to save context
   */
  getMessagesForSummarization(messages: Message[]): Message[] {
    return this.strategy.getMessagesForSummarization(messages);
  }
}

