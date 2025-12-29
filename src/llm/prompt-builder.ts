// ============================================
// AI Brainstorm - Prompt Builder
// Version: 1.6.0
// ============================================

import type { LLMMessage } from './types';
import type { Agent, Message, Conversation, UserInterjection, Notebook, ConversationDepth } from '../types';
import { countTokens, truncateMessagesToFit } from './token-counter';
import { getStrategyById, getAgentInstructions } from '../strategies/starting-strategies';
import { languageService } from '../prompts/language-service';
import type { PromptTemplates } from '../prompts/types';

// Word limit defaults
const DEFAULT_WORD_LIMIT = 150;
const DEFAULT_EXTENDED_CHANCE = 20; // 20% chance
const DEFAULT_EXTENDED_MULTIPLIER = 3;

// Depth configuration numeric defaults (prompts come from language service)
const DEPTH_NUMERIC_CONFIGS: Record<ConversationDepth, { wordLimit: number; extendedMultiplier: number; extendedChance: number }> = {
  brief: { wordLimit: 40, extendedMultiplier: 2, extendedChance: 10 },
  concise: { wordLimit: 85, extendedMultiplier: 2, extendedChance: 15 },
  standard: { wordLimit: 150, extendedMultiplier: 3, extendedChance: 20 },
  detailed: { wordLimit: 300, extendedMultiplier: 2, extendedChance: 25 },
  deep: { wordLimit: 500, extendedMultiplier: 2, extendedChance: 30 },
};

// ----- Conversation Depth Configuration -----

/**
 * Configuration for a conversation depth level
 */
export interface DepthConfig {
  wordLimit: number;
  extendedMultiplier: number;
  extendedChance: number;
  promptGuidance: string;
  extendedGuidance: string;
}

/**
 * Get depth configuration for a conversation
 * Falls back to 'standard' if no depth is set
 */
export function getDepthConfig(depth?: ConversationDepth, targetLanguage?: string): DepthConfig {
  const depthKey = depth ?? 'standard';
  const numericConfig = DEPTH_NUMERIC_CONFIGS[depthKey];
  const prompts = languageService.getPromptsSync(targetLanguage || '');
  const depthPrompts = prompts.agent.depthConfigs[depthKey];
  
  return {
    ...numericConfig,
    promptGuidance: depthPrompts.promptGuidance,
    extendedGuidance: depthPrompts.extendedGuidance,
  };
}

/**
 * Result of word limit calculation for a turn
 */
export interface WordLimitResult {
  limit: number;
  isExtended: boolean;
  baseLimit: number;
}

interface PromptContext {
  conversation: Conversation;
  agent: Agent;
  allAgents: Agent[];
  messages: Message[];
  notebook?: Notebook;
  interjections: UserInterjection[];
  secretarySummary?: string;
  isFirstTurn?: boolean;
}

/**
 * Calculate the effective word limit for an agent's turn
 * Uses conversationDepth when set, otherwise falls back to legacy settings
 * First turn always gets extended limit, otherwise random chance
 */
export function calculateWordLimit(
  conversation: Conversation,
  agent: Agent,
  isFirstTurn: boolean
): WordLimitResult {
  // Get depth config if conversationDepth is set
  const depthConfig = conversation.conversationDepth 
    ? getDepthConfig(conversation.conversationDepth, conversation.targetLanguage) 
    : null;
  
  // Get base limit: agent override > depth config > conversation default > global default
  const baseLimit = agent.wordLimit 
    ?? (depthConfig?.wordLimit) 
    ?? conversation.defaultWordLimit 
    ?? DEFAULT_WORD_LIMIT;
  
  // Get multiplier and chance from depth config or conversation settings
  const multiplier = depthConfig?.extendedMultiplier 
    ?? conversation.extendedMultiplier 
    ?? DEFAULT_EXTENDED_MULTIPLIER;
  const chance = depthConfig?.extendedChance 
    ?? conversation.extendedSpeakingChance 
    ?? DEFAULT_EXTENDED_CHANCE;
  
  // First speaker always gets extended limit to properly set up the discussion
  if (isFirstTurn) {
    return {
      limit: baseLimit * multiplier,
      isExtended: true,
      baseLimit,
    };
  }
  
  // Random chance for extended speaking
  const roll = Math.random() * 100;
  
  if (roll < chance) {
    return {
      limit: baseLimit * multiplier,
      isExtended: true,
      baseLimit,
    };
  }
  
  return {
    limit: baseLimit,
    isExtended: false,
    baseLimit,
  };
}

/**
 * Build word limit instruction for the prompt
 * Uses depth-specific guidance when conversationDepth is set
 */
function buildWordLimitInstruction(
  wordLimit: WordLimitResult, 
  thinkingDepth: number, 
  conversationDepth?: ConversationDepth,
  targetLanguage?: string
): string {
  const prompts = languageService.getPromptsSync(targetLanguage || '');
  
  // Get depth config for specialized prompts
  const depthConfig = conversationDepth ? getDepthConfig(conversationDepth, targetLanguage) : null;
  
  // Adjust limit slightly based on thinking depth (deeper thinkers get 10-20% bonus)
  const depthBonus = Math.floor(wordLimit.limit * (thinkingDepth - 1) * 0.05);
  const adjustedLimit = wordLimit.limit + depthBonus;
  
  // Use depth-specific guidance if available
  if (depthConfig) {
    if (wordLimit.isExtended) {
      return `\n${depthConfig.extendedGuidance}`;
    }
    return `\n${depthConfig.promptGuidance}`;
  }
  
  // Fallback to generic instructions (for backward compatibility)
  if (wordLimit.isExtended) {
    return `\n${languageService.interpolate(prompts.agent.wordLimit.extended, { limit: adjustedLimit })}`;
  }
  
  return `\n${languageService.interpolate(prompts.agent.wordLimit.concise, { limit: adjustedLimit })}`;
}

/**
 * Get thinking depth guidance from prompts
 */
function getThinkingDepthGuidance(depth: number, prompts: PromptTemplates): string {
  const key = String(depth) as keyof typeof prompts.agent.thinkingDepth;
  return prompts.agent.thinkingDepth[key] || prompts.agent.thinkingDepth.default;
}

/**
 * Get creativity guidance from prompts
 */
function getCreativityGuidance(level: number, prompts: PromptTemplates): string {
  const key = String(level) as keyof typeof prompts.agent.creativityGuidance;
  return prompts.agent.creativityGuidance[key] || prompts.agent.creativityGuidance.default;
}

/**
 * Build system prompt for an agent
 */
export function buildSystemPrompt(agent: Agent, conversation: Conversation): string {
  const prompts = languageService.getPromptsSync(conversation.targetLanguage || '');
  const parts: string[] = [];

  // Core identity
  parts.push(languageService.interpolate(prompts.agent.coreIdentity, {
    name: agent.name,
    role: agent.role,
    expertise: agent.expertise,
  }));

  // Conversation context
  parts.push(`\n${languageService.interpolate(prompts.agent.conversationContext, { subject: conversation.subject })}`);
  parts.push(languageService.interpolate(prompts.agent.goalTemplate, { goal: conversation.goal }));

  // Role-specific behavior
  if (agent.isSecretary) {
    parts.push(`\n${prompts.agent.secretaryRole}`);
  } else {
    // Thinking depth guidance
    const depthGuidance = getThinkingDepthGuidance(agent.thinkingDepth, prompts);
    parts.push(`\n${depthGuidance}`);

    // Creativity guidance
    const creativityGuidance = getCreativityGuidance(agent.creativityLevel, prompts);
    parts.push(creativityGuidance);

    // Strategy-specific instructions
    if (conversation.startingStrategy) {
      const strategyInstructions = getAgentInstructions(conversation.startingStrategy, conversation.targetLanguage);
      if (strategyInstructions) {
        parts.push(`\n${languageService.interpolate(prompts.agent.strategyApproach, { instructions: strategyInstructions })}`);
      }
    }
  }

  // Ground rules if present
  if (conversation.groundRules) {
    parts.push(`\n${conversation.groundRules}`);
  }

  // Formatting rules
  if (conversation.plainTextOnly) {
    parts.push(`\n${prompts.agent.plainTextRules}`);
  }

  // Target language requirement
  if (conversation.targetLanguage) {
    parts.push(`\n${languageService.interpolate(prompts.agent.languageRequirement, { language: conversation.targetLanguage })}`);
  }

  // Interaction guidelines
  parts.push(`\n${prompts.agent.interactionGuidelines}`);

  return parts.join('\n');
}

/**
 * Build the full conversation messages for an agent
 */
export function buildConversationMessages(context: PromptContext): LLMMessage[] {
  const prompts = languageService.getPromptsSync(context.conversation.targetLanguage || '');
  const messages: LLMMessage[] = [];
  const isFirstTurn = context.isFirstTurn ?? (context.messages.length === 0);

  // Calculate word limit for this turn
  const wordLimit = calculateWordLimit(
    context.conversation,
    context.agent,
    isFirstTurn
  );

  // Build system prompt with word limit instruction
  let systemPrompt = buildSystemPrompt(context.agent, context.conversation);
  
  // Add word limit instruction (skip for secretary as they have different requirements)
  if (!context.agent.isSecretary) {
    systemPrompt += buildWordLimitInstruction(
      wordLimit, 
      context.agent.thinkingDepth,
      context.conversation.conversationDepth,
      context.conversation.targetLanguage
    );
  }

  // System prompt
  messages.push({
    role: 'system',
    content: systemPrompt,
  });

  // Add opening statement for first turn (high visibility context)
  if (isFirstTurn && context.conversation.openingStatement) {
    messages.push({
      role: 'system',
      content: languageService.interpolate(prompts.context.discussionContext, { 
        openingStatement: context.conversation.openingStatement 
      }),
    });
  }

  // Add notebook context if available and agent uses it
  if (context.notebook && context.notebook.notes && context.agent.notebookUsage > 0) {
    const notebookContent = truncateNotebook(
      context.notebook.notes,
      context.agent.notebookUsage,
      context.conversation.maxContextTokens
    );
    if (notebookContent) {
      messages.push({
        role: 'system',
        content: languageService.interpolate(prompts.context.notebookHeader, { notes: notebookContent }),
      });
    }
  }

  // Add secretary summary if available
  if (context.secretarySummary) {
    messages.push({
      role: 'system',
      content: languageService.interpolate(prompts.context.secretarySummary, { summary: context.secretarySummary }),
    });
  }

  // Add user interjections as high-priority context
  for (const interjection of context.interjections) {
    messages.push({
      role: 'user',
      content: `${prompts.context.userGuidancePrefix}${interjection.content}`,
    });
  }

  // Add conversation messages (including opening messages)
  for (const message of context.messages) {
    const sender = context.allAgents.find(a => a.id === message.agentId);
    const senderName = sender?.name || 'Unknown';

    // Handle opening messages (system-generated from strategy)
    if (message.type === 'opening') {
      messages.push({
        role: 'system',
        content: `${prompts.context.discussionOpeningPrefix}${message.content}`,
      });
    } else if (message.agentId === context.agent.id) {
      // This agent's own messages
      messages.push({
        role: 'assistant',
        content: message.content,
      });
    } else if (message.type === 'interjection') {
      // User interjections within the conversation
      messages.push({
        role: 'user',
        content: `${prompts.context.messagePrefixes.user}${message.content}`,
      });
    } else {
      // Other agents' messages
      const addressedTo = message.addressedTo
        ? languageService.interpolate(prompts.context.messagePrefixes.addressedTo, {
            addresseeName: context.allAgents.find(a => a.id === message.addressedTo)?.name || 'someone'
          })
        : '';
      messages.push({
        role: 'user',
        content: `[${senderName}]${addressedTo}: ${message.content}`,
      });
    }
  }

  // Add prompt for next response
  const otherAgentNames = context.allAgents
    .filter(a => a.id !== context.agent.id && !a.isSecretary)
    .map(a => a.name);

  if (context.agent.isSecretary) {
    messages.push({
      role: 'user',
      content: prompts.context.turnPrompts.secretary,
    });
  } else if (isFirstTurn) {
    // Special prompt for first speaker
    const strategy = context.conversation.startingStrategy 
      ? getStrategyById(context.conversation.startingStrategy) 
      : null;
    
    let firstTurnPrompt = languageService.interpolate(prompts.context.turnPrompts.firstTurnOpening, {
      agentName: context.agent.name,
    });
    
    if (strategy && strategy.id in prompts.strategies) {
      // Get strategy-specific first turn prompt from language service
      // Strategy IDs are valid keys in strategies (excluding defaultFirstTurnPrompt)
      type StrategyKey = 'open-brainstorm' | 'structured-debate' | 'decision-matrix' | 'problem-first' | 'expert-deep-dive' | 'devils-advocate';
      const strategyPrompts = prompts.strategies[strategy.id as StrategyKey];
      firstTurnPrompt += strategyPrompts.firstTurnPrompt;
    } else {
      firstTurnPrompt += prompts.strategies.defaultFirstTurnPrompt;
    }
    
    if (otherAgentNames.length > 0) {
      firstTurnPrompt += languageService.interpolate(prompts.context.turnPrompts.firstTurnParticipants, {
        participants: otherAgentNames.join(', '),
      });
    }
    
    messages.push({
      role: 'user',
      content: firstTurnPrompt,
    });
  } else if (otherAgentNames.length > 0) {
    messages.push({
      role: 'user',
      content: languageService.interpolate(prompts.context.turnPrompts.regularTurn, {
        agentName: context.agent.name,
        participants: otherAgentNames.join(', '),
      }),
    });
  } else {
    messages.push({
      role: 'user',
      content: languageService.interpolate(prompts.context.turnPrompts.regularTurnAlone, {
        agentName: context.agent.name,
      }),
    });
  }

  // Truncate to fit context window
  return truncateMessagesToFit(
    messages,
    context.conversation.maxContextTokens,
    1000 // Reserve for response
  );
}

function truncateNotebook(notes: string, usagePercent: number, maxTokens: number): string {
  const maxNotebookTokens = Math.floor(maxTokens * (usagePercent / 100) * 0.1); // 10% of allocated
  const tokens = countTokens(notes);

  if (tokens <= maxNotebookTokens) {
    return notes;
  }

  // Take the most recent notes (from the end)
  const lines = notes.split('\n---\n');
  let result = '';
  let currentTokens = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const lineTokens = countTokens(lines[i]);
    if (currentTokens + lineTokens <= maxNotebookTokens) {
      result = lines[i] + (result ? '\n---\n' + result : '');
      currentTokens += lineTokens;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Build a summary prompt for the secretary
 */
export function buildSummaryPrompt(messages: Message[], agents: Agent[], targetLanguage?: string): LLMMessage[] {
  const prompts = languageService.getPromptsSync(targetLanguage || '');
  
  let systemPrompt = targetLanguage 
    ? languageService.interpolate(prompts.secretary.summarySystemWithLanguage, { language: targetLanguage })
    : prompts.secretary.summarySystem;

  const conversationText = messages.map(m => {
    const sender = agents.find(a => a.id === m.agentId);
    return `[${sender?.name || 'Unknown'}]: ${m.content}`;
  }).join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: languageService.interpolate(prompts.secretary.summaryUser, { conversation: conversationText }) },
  ];
}

/**
 * Build a note extraction prompt
 */
export function buildNotePrompt(message: string, existingNotes: string, targetLanguage?: string): LLMMessage[] {
  const prompts = languageService.getPromptsSync(targetLanguage || '');
  
  return [
    {
      role: 'system',
      content: prompts.secretary.noteExtractionSystem,
    },
    {
      role: 'user',
      content: languageService.interpolate(prompts.secretary.noteExtractionUser, {
        message,
        existingNotes: existingNotes || 'None',
      }),
    },
  ];
}

/**
 * Map creativity level to temperature
 */
export function creativityToTemperature(level: number): number {
  // Map 1-5 scale to 0.3-1.0 temperature
  return 0.3 + ((level - 1) / 4) * 0.7;
}

// ============================================
// Context Distillation Prompts
// ============================================

/**
 * JSON schema for distillation output
 */
export interface DistillationOutput {
  distilledSummary: string;
  currentStance: string;
  keyDecisions: string[];
  openQuestions: string[];
  constraints: string[];
  actionItems: string[];
  pinnedFacts: {
    content: string;
    category: 'decision' | 'constraint' | 'definition' | 'consensus' | 'disagreement' | 'action';
    source?: string;
    importance: number;
  }[];
}

/**
 * Build a distillation prompt for compressing older conversation messages
 * into a compact, structured summary while preserving key context.
 * 
 * @param messages - Messages to distill (older messages that will be replaced by summary)
 * @param agents - All agents in the conversation
 * @param existingDistillation - Previous distillation to merge with
 * @param conversationSubject - The subject/topic of the conversation
 * @param targetLanguage - Optional target language for the distillation
 */
export function buildDistillationPrompt(
  messages: Message[],
  agents: Agent[],
  existingDistillation: {
    distilledSummary?: string;
    currentStance?: string;
    keyDecisions?: string[];
    openQuestions?: string[];
    constraints?: string[];
    actionItems?: string[];
    pinnedFacts?: { content: string; category: string; source?: string; importance: number }[];
  } | null,
  conversationSubject: string,
  targetLanguage?: string
): LLMMessage[] {
  const prompts = languageService.getPromptsSync(targetLanguage || '');
  const agentMap = new Map(agents.map(a => [a.id, a.name]));
  
  // Format messages for distillation
  const conversationText = messages.map(m => {
    const senderName = m.agentId ? agentMap.get(m.agentId) || 'Unknown' : 'System';
    return `[${senderName}]: ${m.content}`;
  }).join('\n\n');

  // Build context about existing distillation
  let existingContext = '';
  if (existingDistillation) {
    const parts: string[] = [];
    
    if (existingDistillation.distilledSummary) {
      parts.push(`Previous Summary:\n${existingDistillation.distilledSummary}`);
    }
    if (existingDistillation.currentStance) {
      parts.push(`Previous Stance:\n${existingDistillation.currentStance}`);
    }
    if (existingDistillation.keyDecisions?.length) {
      parts.push(`Previous Decisions:\n- ${existingDistillation.keyDecisions.join('\n- ')}`);
    }
    if (existingDistillation.openQuestions?.length) {
      parts.push(`Previous Open Questions:\n- ${existingDistillation.openQuestions.join('\n- ')}`);
    }
    if (existingDistillation.pinnedFacts?.length) {
      parts.push(`Previous Pinned Facts:\n${existingDistillation.pinnedFacts.map(f => `- [${f.category}] ${f.content}`).join('\n')}`);
    }
    
    if (parts.length > 0) {
      existingContext = `\n\nEXISTING DISTILLATION (merge with new insights):\n${parts.join('\n\n')}`;
    }
  }

  let systemPrompt = languageService.interpolate(prompts.secretary.distillationSystem, { subject: conversationSubject });

  if (targetLanguage) {
    systemPrompt += `\n\nIMPORTANT: Write ALL content in ${targetLanguage}. The JSON keys remain in English, but all string values must be in ${targetLanguage}.`;
  }

  const userPrompt = languageService.interpolate(prompts.secretary.distillationUser, {
    existingContext,
    messages: conversationText,
  });

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Parse the distillation response from the LLM
 * Returns null if parsing fails
 */
export function parseDistillationResponse(response: string): DistillationOutput | null {
  try {
    // Try to extract JSON from the response (handle potential markdown code blocks)
    let jsonString = response.trim();
    
    // Remove markdown code block if present
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.slice(7);
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.slice(3);
    }
    if (jsonString.endsWith('```')) {
      jsonString = jsonString.slice(0, -3);
    }
    jsonString = jsonString.trim();

    // First attempt: parse as-is
    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      // Second attempt: extract the first JSON object block (handles extra commentary)
      const match = jsonString.match(/\{[\s\S]*\}/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    }
    
    // Validate required fields
    if (typeof parsed.distilledSummary !== 'string') {
      console.error('[Distillation] Invalid response: missing distilledSummary');
      return null;
    }
    
    // Normalize and validate the output
    const output: DistillationOutput = {
      distilledSummary: parsed.distilledSummary || '',
      currentStance: parsed.currentStance || '',
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions.filter((d: unknown) => typeof d === 'string') : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.filter((q: unknown) => typeof q === 'string') : [],
      constraints: Array.isArray(parsed.constraints) ? parsed.constraints.filter((c: unknown) => typeof c === 'string') : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.filter((a: unknown) => typeof a === 'string') : [],
      pinnedFacts: [],
    };
    
    // Parse pinned facts with validation
    if (Array.isArray(parsed.pinnedFacts)) {
      for (const fact of parsed.pinnedFacts) {
        if (fact && typeof fact.content === 'string') {
          const validCategories = ['decision', 'constraint', 'definition', 'consensus', 'disagreement', 'action'];
          output.pinnedFacts.push({
            content: fact.content,
            category: validCategories.includes(fact.category) ? fact.category : 'definition',
            source: typeof fact.source === 'string' ? fact.source : undefined,
            importance: typeof fact.importance === 'number' ? Math.min(10, Math.max(1, fact.importance)) : 5,
          });
        }
      }
    }
    
    return output;
  } catch (error) {
    console.error('[Distillation] Failed to parse response:', error);
    return null;
  }
}
