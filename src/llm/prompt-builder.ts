// ============================================
// AI Brainstorm - Prompt Builder
// Version: 1.0.0
// ============================================

import type { LLMMessage } from './types';
import type { Agent, Message, Conversation, UserInterjection, Notebook } from '../types';
import { countTokens, truncateMessagesToFit } from './token-counter';

interface PromptContext {
  conversation: Conversation;
  agent: Agent;
  allAgents: Agent[];
  messages: Message[];
  notebook?: Notebook;
  interjections: UserInterjection[];
  secretarySummary?: string;
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

  // System prompt
  messages.push({
    role: 'system',
    content: buildSystemPrompt(context.agent, context.conversation),
  });

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

  // Add conversation messages
  for (const message of context.messages) {
    const sender = context.allAgents.find(a => a.id === message.agentId);
    const senderName = sender?.name || 'Unknown';

    if (message.agentId === context.agent.id) {
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
export function buildSummaryPrompt(messages: Message[], agents: Agent[]): LLMMessage[] {
  const systemPrompt = `You are a skilled summarizer. Your task is to extract the key points, decisions, and insights from a discussion. Be concise and objective.`;

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

