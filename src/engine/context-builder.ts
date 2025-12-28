// ============================================
// AI Brainstorm - Context Builder
// Version: 1.2.0
// ============================================

import type { Agent, Conversation, Message, UserInterjection, Notebook, DistilledMemory } from '../types';
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
  distilledMemoryUsed: boolean;
}

export interface BuildOptions {
  isFirstTurn?: boolean;
  currentRound?: number;
  distilledMemory?: DistilledMemory | null;
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
   * 
   * @param agent - The agent to build context for
   * @param allAgents - All agents in the conversation
   * @param messages - All conversation messages
   * @param interjections - User interjections
   * @param notebook - Agent's notebook (if any)
   * @param secretarySummary - Secretary's current summary (if available)
   * @param options - Build options including distilled memory
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
    const distilledMemory = options.distilledMemory;

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

    // Determine if we should use distilled memory
    // Use it if we have one and there are messages beyond the last distilled point
    const useDistilledMemory = this.shouldUseDistilledMemory(distilledMemory, messages);

    // Filter messages based on distillation status
    // If using distilled memory, only include messages after the last distilled message
    let messagesToSelect = messages;
    if (useDistilledMemory && distilledMemory) {
      const lastDistilledIdx = messages.findIndex(m => m.id === distilledMemory.lastDistilledMessageId);
      if (lastDistilledIdx >= 0) {
        messagesToSelect = messages.slice(lastDistilledIdx + 1);
      }
    }

    // Adjust message budget if using distilled memory (reserve space for distilled content)
    const distilledMemoryTokens = useDistilledMemory && distilledMemory 
      ? this.estimateDistilledMemoryTokens(distilledMemory)
      : 0;
    const adjustedMessageBudget = budget.messages - distilledMemoryTokens;

    // Select and truncate components
    const truncatedNotebook = notebook?.notes 
      ? this.strategy.truncateNotebook(notebook.notes, budget.notebook)
      : '';

    const selectedInterjections = this.strategy.selectInterjections(
      interjections,
      budget.interjections
    );

    // Pass currentRound for time decay scoring
    const selectedMessages = this.strategy.selectMessages(
      messagesToSelect,
      adjustedMessageBudget,
      agent.id,
      currentRound
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
      currentRound,
      useDistilledMemory ? distilledMemory : null
    );

    return {
      systemPrompt,
      notebook: truncatedNotebook,
      interjections: selectedInterjections,
      messages: selectedMessages,
      promptMessages,
      distilledMemoryUsed: useDistilledMemory,
    };
  }

  /**
   * Determine if we should use distilled memory
   */
  private shouldUseDistilledMemory(
    distilledMemory: DistilledMemory | null | undefined,
    messages: Message[]
  ): boolean {
    if (!distilledMemory) return false;
    if (!distilledMemory.distilledSummary) return false;
    if (distilledMemory.totalMessagesDistilled === 0) return false;
    
    // Only use if we have messages beyond the distillation point
    if (distilledMemory.lastDistilledMessageId) {
      const lastIdx = messages.findIndex(m => m.id === distilledMemory.lastDistilledMessageId);
      // Use distillation if there are newer messages
      return lastIdx >= 0 && lastIdx < messages.length - 1;
    }
    
    return true;
  }

  /**
   * Estimate token usage for distilled memory content
   */
  private estimateDistilledMemoryTokens(memory: DistilledMemory): number {
    let tokens = 0;
    
    // Distilled summary
    if (memory.distilledSummary) {
      tokens += countTokens(memory.distilledSummary) + 20; // overhead for formatting
    }
    
    // Pinned facts (estimate ~20 tokens per fact)
    tokens += memory.pinnedFacts.length * 20;
    
    // Current stance
    if (memory.currentStance) {
      tokens += countTokens(memory.currentStance) + 10;
    }
    
    return tokens;
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
    currentRound: number = 0,
    distilledMemory: DistilledMemory | null = null
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

    // Distilled memory context (provides compressed history of earlier rounds)
    // This goes before secretary summary as it provides foundational context
    if (distilledMemory && distilledMemory.distilledSummary) {
      result.push({
        role: 'system',
        content: this.formatDistilledMemory(distilledMemory),
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
   * Format distilled memory into a context block
   */
  private formatDistilledMemory(memory: DistilledMemory): string {
    const parts: string[] = [];
    
    parts.push('DISCUSSION HISTORY (summarized from earlier rounds):');
    
    // Main distilled summary
    if (memory.distilledSummary) {
      parts.push(memory.distilledSummary);
    }
    
    // Current stance
    if (memory.currentStance) {
      parts.push(`\nCurrent discussion state: ${memory.currentStance}`);
    }
    
    // Key decisions (if any)
    if (memory.keyDecisions && memory.keyDecisions.length > 0) {
      parts.push(`\nKey decisions made: ${memory.keyDecisions.join('; ')}`);
    }
    
    // Open questions (if any)
    if (memory.openQuestions && memory.openQuestions.length > 0) {
      parts.push(`\nOpen questions: ${memory.openQuestions.join('; ')}`);
    }
    
    // Pinned facts (important anchors - show top importance facts)
    const importantFacts = memory.pinnedFacts
      .filter(f => f.importance >= 7)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5);
    
    if (importantFacts.length > 0) {
      const factsList = importantFacts.map(f => {
        const source = f.source ? ` (${f.source})` : '';
        return `- [${f.category}]${source}: ${f.content}`;
      }).join('\n');
      parts.push(`\nKey facts/decisions:\n${factsList}`);
    }
    
    return parts.join('\n');
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

