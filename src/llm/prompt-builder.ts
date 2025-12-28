// ============================================
// AI Brainstorm - Prompt Builder
// Version: 1.4.0
// ============================================

import type { LLMMessage } from './types';
import type { Agent, Message, Conversation, UserInterjection, Notebook, ConversationDepth } from '../types';
import { countTokens, truncateMessagesToFit } from './token-counter';
import { getStrategyById, getAgentInstructions } from '../strategies/starting-strategies';

// Word limit defaults
const DEFAULT_WORD_LIMIT = 150;
const DEFAULT_EXTENDED_CHANCE = 20; // 20% chance
const DEFAULT_EXTENDED_MULTIPLIER = 3;

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
 * Depth configuration presets
 */
const DEPTH_CONFIGS: Record<ConversationDepth, DepthConfig> = {
  brief: {
    wordLimit: 40,
    extendedMultiplier: 2,
    extendedChance: 10,
    promptGuidance: 'RESPONSE LENGTH: Respond in 1-2 sentences only. Be extremely concise and direct. No elaboration.',
    extendedGuidance: 'RESPONSE LENGTH: You may use 2-3 sentences this turn if needed, but stay very brief.',
  },
  concise: {
    wordLimit: 85,
    extendedMultiplier: 2,
    extendedChance: 15,
    promptGuidance: 'RESPONSE LENGTH: Keep your response to a short paragraph (~85 words). Focus on your key point only.',
    extendedGuidance: 'RESPONSE LENGTH: You may expand slightly this turn (~150 words), but remain focused.',
  },
  standard: {
    wordLimit: 150,
    extendedMultiplier: 3,
    extendedChance: 20,
    promptGuidance: 'RESPONSE LENGTH: Keep your response concise, around 150 words. Be focused and substantive.',
    extendedGuidance: 'RESPONSE LENGTH: You may elaborate more this turn (~400 words). Develop your ideas fully.',
  },
  detailed: {
    wordLimit: 300,
    extendedMultiplier: 2,
    extendedChance: 25,
    promptGuidance: 'RESPONSE LENGTH: Provide a detailed response (~300 words). Include reasoning and examples.',
    extendedGuidance: 'RESPONSE LENGTH: Take your time this turn (~600 words). Provide comprehensive analysis with examples.',
  },
  deep: {
    wordLimit: 500,
    extendedMultiplier: 2,
    extendedChance: 30,
    promptGuidance: 'RESPONSE LENGTH: Provide comprehensive analysis (~500 words). Explore all angles, give detailed reasoning.',
    extendedGuidance: 'RESPONSE LENGTH: This is your turn to go deep (~1000 words). Exhaustive exploration is encouraged.',
  },
};

/**
 * Get depth configuration for a conversation
 * Falls back to 'standard' if no depth is set
 */
export function getDepthConfig(depth?: ConversationDepth): DepthConfig {
  return DEPTH_CONFIGS[depth ?? 'standard'];
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
    ? getDepthConfig(conversation.conversationDepth) 
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
  conversationDepth?: ConversationDepth
): string {
  // Get depth config for specialized prompts
  const depthConfig = conversationDepth ? getDepthConfig(conversationDepth) : null;
  
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
    return `\nRESPONSE LENGTH: You may elaborate more this turn. Aim for around ${adjustedLimit} words, but prioritize quality over hitting the exact count. This is a good opportunity to develop your ideas more fully.`;
  }
  
  return `\nRESPONSE LENGTH: Keep your response concise, around ${adjustedLimit} words. Be focused and get to the point quickly while still being substantive.`;
}

/**
 * Build system prompt for an agent
 */
export function buildSystemPrompt(agent: Agent, conversation: Conversation): string {
  const parts: string[] = [];

  // Core identity
  parts.push(`You are ${agent.name}, a ${agent.role} with expertise in ${agent.expertise}.`);

  // Conversation context
  parts.push(`\nYou are participating in a collaborative discussion about: "${conversation.subject}"`);
  parts.push(`The goal is: ${conversation.goal}`);

  // Role-specific behavior
  if (agent.isSecretary) {
    parts.push(`
Your role is the SECRETARY. Your responsibilities:
- Listen carefully to all participants
- Identify and capture key insights, decisions, and action items
- Maintain an objective summary of the discussion
- Do NOT participate in the debate itself
- Provide periodic summaries when asked
- Update the result draft with important conclusions`);
  } else {
    // Thinking depth guidance
    const depthGuidance = getThinkingDepthGuidance(agent.thinkingDepth);
    parts.push(`\n${depthGuidance}`);

    // Creativity guidance
    const creativityGuidance = getCreativityGuidance(agent.creativityLevel);
    parts.push(creativityGuidance);

    // Strategy-specific instructions
    if (conversation.startingStrategy) {
      const strategyInstructions = getAgentInstructions(conversation.startingStrategy);
      if (strategyInstructions) {
        parts.push(`\nDiscussion approach: ${strategyInstructions}`);
      }
    }
  }

  // Ground rules if present
  if (conversation.groundRules) {
    parts.push(`\n${conversation.groundRules}`);
  }

  // Formatting rules
  if (conversation.plainTextOnly) {
    parts.push(`
IMPORTANT: Respond in plain text only. Do NOT use:
- Markdown formatting (no **, *, #, etc.)
- Code blocks
- Bullet points or numbered lists
Keep your response as natural prose.`);
  }

  // Target language requirement
  if (conversation.targetLanguage) {
    parts.push(`
LANGUAGE REQUIREMENT: You MUST respond entirely in ${conversation.targetLanguage}.
All your responses, explanations, and contributions must be written in ${conversation.targetLanguage}.
Do not use any other language unless specifically quoting or referencing terms that have no equivalent.`);
  }

  // Interaction guidelines
  parts.push(`
When responding:
- Be concise but thorough
- Build on others' ideas or respectfully challenge them
- If addressing someone specific, mention them by name
- Consider the goal of the discussion
- Contribute your unique perspective based on your expertise`);

  return parts.join('\n');
}

function getThinkingDepthGuidance(depth: number): string {
  switch (depth) {
    case 1:
      return 'Keep your responses brief and high-level. Focus on quick insights.';
    case 2:
      return 'Provide moderate analysis. Balance depth with conciseness.';
    case 3:
      return 'Give thorough analysis with supporting reasoning. Explore implications.';
    case 4:
      return 'Provide deep, comprehensive analysis. Consider edge cases and nuances.';
    case 5:
      return 'Give exhaustive analysis. Explore every angle, provide detailed reasoning, and consider all implications.';
    default:
      return 'Provide balanced, thoughtful analysis.';
  }
}

function getCreativityGuidance(level: number): string {
  switch (level) {
    case 1:
      return 'Stick to conventional approaches and established best practices.';
    case 2:
      return 'Primarily conventional but open to slight variations.';
    case 3:
      return 'Balance conventional wisdom with creative alternatives.';
    case 4:
      return 'Lean toward creative and innovative approaches. Challenge assumptions.';
    case 5:
      return 'Think outside the box. Propose unconventional solutions and challenge established norms.';
    default:
      return 'Balance practicality with innovation.';
  }
}

/**
 * Build the full conversation messages for an agent
 */
export function buildConversationMessages(context: PromptContext): LLMMessage[] {
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
      context.conversation.conversationDepth
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
      content: `DISCUSSION CONTEXT:\n${context.conversation.openingStatement}`,
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
        content: `Your personal notes from this conversation:\n${notebookContent}`,
      });
    }
  }

  // Add secretary summary if available
  if (context.secretarySummary) {
    messages.push({
      role: 'system',
      content: `Current discussion summary:\n${context.secretarySummary}`,
    });
  }

  // Add user interjections as high-priority context
  for (const interjection of context.interjections) {
    messages.push({
      role: 'user',
      content: `[USER GUIDANCE]: ${interjection.content}`,
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
        content: `[DISCUSSION OPENING]: ${message.content}`,
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
        content: `[USER]: ${message.content}`,
      });
    } else {
      // Other agents' messages
      const addressedTo = message.addressedTo
        ? ` (addressed to ${context.allAgents.find(a => a.id === message.addressedTo)?.name || 'someone'})`
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
      content: 'Provide a brief summary of the key points discussed so far. Focus on decisions, insights, and action items.',
    });
  } else if (isFirstTurn) {
    // Special prompt for first speaker
    const strategy = context.conversation.startingStrategy 
      ? getStrategyById(context.conversation.startingStrategy) 
      : null;
    
    let firstTurnPrompt = `You are opening this discussion, ${context.agent.name}. `;
    
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
    } else {
      firstTurnPrompt += 'Share your perspective to kick off the discussion.';
    }
    
    if (otherAgentNames.length > 0) {
      firstTurnPrompt += ` Other participants (${otherAgentNames.join(', ')}) will respond after you.`;
    }
    
    messages.push({
      role: 'user',
      content: firstTurnPrompt,
    });
  } else if (otherAgentNames.length > 0) {
    messages.push({
      role: 'user',
      content: `It's your turn to contribute, ${context.agent.name}. Consider what others have said and share your perspective. You can address specific participants (${otherAgentNames.join(', ')}) or respond to the group.`,
    });
  } else {
    messages.push({
      role: 'user',
      content: `It's your turn to contribute, ${context.agent.name}. Share your perspective on the topic.`,
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
  let systemPrompt = `You are a skilled summarizer. Your task is to extract the key points, decisions, and insights from a discussion. Be concise and objective.`;
  
  if (targetLanguage) {
    systemPrompt += `\n\nIMPORTANT: Write your summary entirely in ${targetLanguage}.`;
  }

  const conversationText = messages.map(m => {
    const sender = agents.find(a => a.id === m.agentId);
    return `[${sender?.name || 'Unknown'}]: ${m.content}`;
  }).join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Summarize the following discussion:\n\n${conversationText}\n\nProvide:\n1. Key Points\n2. Decisions Made\n3. Open Questions\n4. Action Items (if any)` },
  ];
}

/**
 * Build a note extraction prompt
 */
export function buildNotePrompt(message: string, existingNotes: string): LLMMessage[] {
  return [
    {
      role: 'system',
      content: 'Extract 1-2 key points from this message that might be useful to remember. Be extremely concise (max 50 words total).',
    },
    {
      role: 'user',
      content: `Message: ${message}\n\nExisting notes: ${existingNotes || 'None'}\n\nExtract any new important points not already in the notes:`,
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

