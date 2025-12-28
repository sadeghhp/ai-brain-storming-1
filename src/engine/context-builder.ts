// ============================================
// AI Brainstorm - Context Builder
// Version: 1.1.0
// ============================================

import type { Agent, Conversation, Message, UserInterjection, Notebook } from '../types';
import type { LLMMessage } from '../llm/types';
import { buildSystemPrompt, calculateWordLimit, getDepthConfig } from '../llm/prompt-builder';
import { countTokens } from '../llm/token-counter';
import { ContextStrategy } from './context-strategy';
import { getStrategyById } from '../strategies/starting-strategies';

export interface ContextComponents {
  systemPrompt: string;
  notebook: string;
  interjections: UserInterjection[];
  messages: Message[];
  promptMessages: LLMMessage[];
}

export interface BuildOptions {
  isFirstTurn?: boolean;
  currentRound?: number;
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
    secretarySummary?: string,
    options: BuildOptions = {}
  ): ContextComponents {
    const isFirstTurn = options.isFirstTurn ?? (messages.filter(m => m.type === 'response').length === 0);
    const currentRound = options.currentRound ?? this.conversation.currentRound;

    // Build system prompt with word limit instruction
    let systemPrompt = buildSystemPrompt(agent, this.conversation);
    
    // Add word limit instruction (skip for secretary)
    if (!agent.isSecretary) {
      const wordLimit = calculateWordLimit(this.conversation, agent, isFirstTurn);
      systemPrompt += this.buildWordLimitInstruction(wordLimit, agent.thinkingDepth);
    }

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
      secretarySummary,
      isFirstTurn,
      currentRound
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
   * Build word limit instruction based on conversation depth
   */
  private buildWordLimitInstruction(
    wordLimit: { limit: number; isExtended: boolean; baseLimit: number },
    thinkingDepth: number
  ): string {
    const depthConfig = this.conversation.conversationDepth 
      ? getDepthConfig(this.conversation.conversationDepth) 
      : null;
    
    // Adjust limit slightly based on thinking depth
    const depthBonus = Math.floor(wordLimit.limit * (thinkingDepth - 1) * 0.05);
    const adjustedLimit = wordLimit.limit + depthBonus;
    
    if (depthConfig) {
      return wordLimit.isExtended 
        ? `\n${depthConfig.extendedGuidance}`
        : `\n${depthConfig.promptGuidance}`;
    }
    
    // Fallback to generic instructions
    if (wordLimit.isExtended) {
      return `\nRESPONSE LENGTH: You may elaborate more this turn. Aim for around ${adjustedLimit} words, but prioritize quality over hitting the exact count.`;
    }
    
    return `\nRESPONSE LENGTH: Keep your response concise, around ${adjustedLimit} words. Be focused and get to the point quickly while still being substantive.`;
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
    secretarySummary?: string,
    isFirstTurn: boolean = false,
    currentRound: number = 0
  ): LLMMessage[] {
    const result: LLMMessage[] = [];

    // System prompt
    result.push({ role: 'system', content: systemPrompt });

    // Opening statement for first turn (high visibility context)
    if (isFirstTurn && this.conversation.openingStatement) {
      result.push({
        role: 'system',
        content: `DISCUSSION CONTEXT:\n${this.conversation.openingStatement}`,
      });
    }

    // Current state context (helps agents understand where they are in the discussion)
    if (currentRound > 0 || !isFirstTurn) {
      const effectiveMaxRounds = this.conversation.recommendedRounds || this.conversation.maxRounds;
      const displayRound = currentRound + 1;
      
      let stateContent = '';
      
      if (effectiveMaxRounds) {
        stateContent = `CURRENT STATE: Round ${displayRound} of ${effectiveMaxRounds}.`;
        
        // Add phase guidance based on conversation progress
        const progress = displayRound / effectiveMaxRounds;
        if (progress <= 0.33) {
          stateContent += ' PHASE: Exploration - share initial thoughts and explore different perspectives.';
        } else if (progress <= 0.66) {
          stateContent += ' PHASE: Development - build on ideas, address disagreements, find common ground.';
        } else {
          stateContent += ' PHASE: Convergence - work toward conclusions and actionable outcomes.';
        }
      } else {
        stateContent = `CURRENT STATE: Round ${displayRound}. Continue building on the discussion.`;
      }
      
      // Add round decision reasoning if available (helps agents understand why this many rounds)
      if (this.conversation.roundDecisionReasoning && displayRound === 2) {
        stateContent += `\nDiscussion scope: ${this.conversation.roundDecisionReasoning}`;
      }
      
      result.push({
        role: 'system',
        content: stateContent,
      });
    }

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
        content: `Your personal notes from this conversation:\n${notebook}`,
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
    result.push(this.buildFinalPrompt(agent, allAgents, isFirstTurn));

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

    // Opening messages (system-generated from strategy)
    if (message.type === 'opening') {
      return {
        role: 'system',
        content: `[DISCUSSION OPENING]: ${message.content}`,
      };
    }

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

    // Summary messages from secretary
    if (message.type === 'summary') {
      const senderName = sender?.name || 'Secretary';
      return { 
        role: 'system', 
        content: `[${senderName} Summary]: ${message.content}` 
      };
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
  private buildFinalPrompt(agent: Agent, allAgents: Agent[], isFirstTurn: boolean = false): LLMMessage {
    const otherAgents = allAgents
      .filter(a => a.id !== agent.id && !a.isSecretary)
      .map(a => a.name);

    if (agent.isSecretary) {
      return {
        role: 'user',
        content: `As the secretary, provide a brief update on the key points discussed. Focus on decisions, insights, and any emerging consensus.`,
      };
    }

    // Special prompt for first speaker with strategy-specific instructions
    if (isFirstTurn) {
      let firstTurnPrompt = `You are opening this discussion, ${agent.name}. `;
      
      if (this.conversation.startingStrategy) {
        const strategy = getStrategyById(this.conversation.startingStrategy);
        if (strategy) {
          switch (strategy.id) {
            case 'open-brainstorm':
              firstTurnPrompt += 'Start by sharing your initial ideas and thoughts freely. Encourage creative exploration.';
              break;
            case 'structured-debate':
              firstTurnPrompt += 'Present your initial position on the topic with clear reasoning.';
              break;
            case 'decision-matrix':
              firstTurnPrompt += 'Begin by identifying the key options or alternatives we should consider.';
              break;
            case 'problem-first':
              firstTurnPrompt += 'Start by analyzing and defining the problem clearly before jumping to solutions.';
              break;
            case 'expert-deep-dive':
              firstTurnPrompt += 'Provide your expert analysis and insights on the topic.';
              break;
            case 'devils-advocate':
              firstTurnPrompt += 'Challenge the assumptions and conventional thinking around this topic.';
              break;
            default:
              firstTurnPrompt += 'Share your perspective to kick off the discussion.';
          }
        }
      } else {
        firstTurnPrompt += 'Share your perspective to kick off the discussion.';
      }
      
      if (otherAgents.length > 0) {
        firstTurnPrompt += ` Other participants (${otherAgents.join(', ')}) will respond after you.`;
      }
      
      return { role: 'user', content: firstTurnPrompt };
    }

    // Regular turn prompt
    const prompt = otherAgents.length > 0
      ? `It's your turn to contribute, ${agent.name}. Consider what others have said and share your perspective. You can address specific participants (${otherAgents.join(', ')}) or respond to the group.`
      : `It's your turn to contribute, ${agent.name}. Share your perspective on the topic.`;

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

