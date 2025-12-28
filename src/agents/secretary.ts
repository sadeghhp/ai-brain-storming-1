// ============================================
// AI Brainstorm - Secretary Agent
// Version: 2.0.0
// ============================================

import { Agent } from './agent';
import { llmRouter } from '../llm/llm-router';
import { buildSummaryPrompt } from '../llm/prompt-builder';
import { resultDraftStorage, messageStorage, agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { Message, ResultDraft, Conversation, Agent as AgentType } from '../types';
import type { LLMMessage } from '../llm/types';

// Secretary neutrality system prompt
const SECRETARY_NEUTRALITY_PROMPT = `You are a NEUTRAL OBSERVER and RECORDER. Your role is to objectively document what was discussed without expressing your own opinions, preferences, or judgments.

CRITICAL RULES:
- Do NOT express opinions or preferences
- Do NOT take sides in disagreements
- Do NOT suggest what "should" be done (unless directly quoting a participant)
- Focus on WHAT was said, not what YOU think should be decided
- Report observations objectively: "Agent A argued that..." rather than "Agent A correctly pointed out..."
- Identify patterns and areas of agreement/disagreement OBJECTIVELY`;

/**
 * Secretary Agent
 * Specialized agent that:
 * - Observes and summarizes discussions neutrally
 * - Generates round-by-round summaries visible to other agents
 * - Produces structured final result documents
 * - Does NOT express opinions or participate in debates
 */
export class SecretaryAgent {
  private agent: Agent;
  private conversationId: string;

  constructor(agent: Agent) {
    if (!agent.isSecretary) {
      throw new Error('Agent is not a secretary');
    }
    this.agent = agent;
    this.conversationId = agent.conversationId;
  }

  get id(): string {
    return this.agent.id;
  }

  get name(): string {
    return this.agent.name;
  }

  /**
   * Generate a summary of the current discussion
   */
  async generateSummary(messages: Message[]): Promise<string> {
    if (messages.length === 0) {
      return 'No discussion to summarize yet.';
    }

    const agents = await agentStorage.getByConversation(this.conversationId);
    const prompt = buildSummaryPrompt(messages, agents);

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3, // Low temperature for accurate summarization
        maxTokens: 1000,
      });

      this.agent.setStatus('idle');
      return response.content;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to generate summary:', error);
      throw error;
    }
  }

  /**
   * Generate a neutral round summary that will be visible to all agents
   * This summary is stored as a system message so agents can reference it
   */
  async generateRoundSummary(round: number): Promise<string> {
    const messages = await messageStorage.getByRound(this.conversationId, round);
    
    if (messages.length === 0) {
      return '';
    }

    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

You are summarizing Round ${round} of a discussion. Create a brief, neutral summary that:
1. Lists the main points each participant made (attribute by name)
2. Notes any areas of agreement observed
3. Notes any areas of disagreement observed
4. Identifies any emerging themes

Keep it concise (2-4 paragraphs). Other participants will see this summary before the next round.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    // Stream into the main conversation UI just like other agents.
    // (Agent.generateStreamingResponse emits: agent:thinking/speaking/idle + stream:chunk/stream:complete)
    // IMPORTANT: Some provider implementations may not reliably send a "done" chunk; we defensively
    // emit stream:complete in finally to ensure the temporary streaming bubble is removed.
    let streamed = '';
    try {
      const response = await this.agent.generateStreamingResponse(prompt, (chunk) => {
        streamed += chunk;
      });

      // Store in round summaries array
      await resultDraftStorage.appendRoundSummary(this.conversationId, response.content || streamed);

      return response.content || streamed;
    } catch (error) {
      console.error('[Secretary] Failed to generate round summary:', error);
      return `Round ${round}: ${messages.length} messages were exchanged.`;
    } finally {
      eventBus.emit('stream:complete', { agentId: this.agent.id });
    }
  }

  /**
   * Update the result draft with the latest summary
   */
  async updateResultDraft(summary: string): Promise<ResultDraft> {
    const draft = await resultDraftStorage.update(this.conversationId, {
      summary,
    });

    eventBus.emit('draft:updated', draft);
    return draft;
  }

  /**
   * Generate and store a complete structured result draft
   * Uses multi-step extraction for themes, consensus, disagreements, etc.
   */
  async generateResultDraft(conversation: Conversation): Promise<ResultDraft> {
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    const existingDraft = await resultDraftStorage.get(this.conversationId);

    this.agent.setStatus('thinking');

    try {
      // Step 1: Generate executive summary
      const executiveSummary = await this.extractExecutiveSummaryLLM(conversation, messages, agents);

      // Step 2: Extract themes
      const themes = await this.extractThemes(messages, agents);

      // Step 3: Identify consensus areas
      const consensusAreas = await this.extractConsensus(messages, agents);

      // Step 4: Identify disagreements
      const disagreements = await this.extractDisagreements(messages, agents);

      // Step 5: Generate recommendations (neutral, based on discussion)
      const recommendations = await this.extractRecommendations(conversation, messages, agents);

      // Step 6: Extract action items
      const actionItems = await this.extractActionItems(messages, agents);

      // Step 7: Identify open questions
      const openQuestions = await this.extractOpenQuestions(messages, agents);

      this.agent.setStatus('idle');

      // Build full content for legacy compatibility
      const content = this.buildFullContent({
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
      });

      const draft = await resultDraftStorage.update(this.conversationId, {
        content,
        summary: executiveSummary,
        keyDecisions: consensusAreas, // Legacy field mapping
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
        roundSummaries: existingDraft?.roundSummaries || [],
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to generate result draft:', error);
      throw error;
    }
  }

  // ----- Multi-Step Extraction Methods -----

  private async extractExecutiveSummaryLLM(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[]
  ): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Write a 2-3 sentence executive summary of the discussion.
Topic: ${conversation.subject}
Goal: ${conversation.goal}

Focus on what was discussed and any conclusions reached. Be factual and neutral.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 300,
    });

    return response.content;
  }

  private async extractThemes(messages: Message[], agents: AgentType[]): Promise<string[]> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify the 3-5 main themes or topics that emerged in this discussion.
Return ONLY a JSON array of strings, e.g.: ["theme 1", "theme 2", "theme 3"]
No other text.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.2,
        maxTokens: 200,
      });

      // Parse JSON array
      const match = response.content.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [];
    } catch {
      return [];
    }
  }

  private async extractConsensus(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify areas where participants AGREED or reached consensus.
List each area of agreement as a bullet point.
If no clear consensus was reached, say "No clear consensus areas identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  private async extractDisagreements(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify areas where participants DISAGREED or had conflicting views.
For each disagreement, briefly note the different positions without judging which is correct.
If no significant disagreements occurred, say "No significant disagreements identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  private async extractRecommendations(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[]
  ): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Based on the discussion, compile recommendations that were suggested by participants.
Goal of discussion: ${conversation.goal}

List recommendations as bullet points, attributing them to who suggested them where possible.
Only include recommendations that were actually discussed - do NOT add your own suggestions.
If no clear recommendations emerged, say "No specific recommendations were proposed."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 500,
    });

    return response.content;
  }

  private async extractActionItems(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Extract any specific action items or next steps that were mentioned in the discussion.
Format as bullet points with the action and who mentioned it (if applicable).
If no action items were discussed, say "No specific action items identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 400,
    });

    return response.content;
  }

  private async extractOpenQuestions(messages: Message[], agents: AgentType[]): Promise<string> {
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Identify any questions or issues that were raised but NOT resolved in the discussion.
List them as bullet points.
If all questions were addressed, say "No unresolved questions identified."`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    const response = await llmRouter.complete(this.agent.llmProviderId, {
      model: this.agent.modelId,
      messages: prompt,
      temperature: 0.3,
      maxTokens: 400,
    });

    return response.content;
  }

  private buildFullContent(sections: {
    executiveSummary: string;
    themes: string[];
    consensusAreas: string;
    disagreements: string;
    recommendations: string;
    actionItems: string;
    openQuestions: string;
  }): string {
    const parts: string[] = [];

    parts.push('# Discussion Result\n');
    parts.push('## Executive Summary\n');
    parts.push(sections.executiveSummary + '\n');

    if (sections.themes.length > 0) {
      parts.push('## Main Themes\n');
      sections.themes.forEach(theme => parts.push(`- ${theme}`));
      parts.push('');
    }

    parts.push('## Areas of Consensus\n');
    parts.push(sections.consensusAreas + '\n');

    parts.push('## Areas of Disagreement\n');
    parts.push(sections.disagreements + '\n');

    parts.push('## Recommendations\n');
    parts.push(sections.recommendations + '\n');

    parts.push('## Action Items\n');
    parts.push(sections.actionItems + '\n');

    parts.push('## Open Questions\n');
    parts.push(sections.openQuestions + '\n');

    return parts.join('\n');
  }

  /**
   * Generate an incremental update to the result draft
   */
  async incrementalUpdate(newMessages: Message[]): Promise<ResultDraft> {
    const existingDraft = await resultDraftStorage.get(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

You are updating a result draft with new discussion content.
        
Current draft summary: ${existingDraft?.summary || 'No summary yet.'}

Add any new key points or decisions from the latest messages. Keep the update concise.`,
      },
      {
        role: 'user',
        content: `New messages:\n${this.formatMessagesForSummary(newMessages, agents)}\n\nProvide a brief update to add to the existing summary:`,
      },
    ];

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3,
        maxTokens: 500,
      });

      this.agent.setStatus('idle');

      // Append to existing content
      const newContent = existingDraft?.content
        ? `${existingDraft.content}\n\n---\n\n**Update:**\n${response.content}`
        : response.content;

      const draft = await resultDraftStorage.update(this.conversationId, {
        content: newContent,
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      throw error;
    }
  }

  /**
   * Get the current result draft
   */
  async getResultDraft(): Promise<ResultDraft | undefined> {
    return resultDraftStorage.get(this.conversationId);
  }

  /**
   * Provide a quick status update on the discussion (legacy method)
   */
  async generateStatusUpdate(round: number): Promise<string> {
    const messages = await messageStorage.getByRound(this.conversationId, round);
    
    if (messages.length === 0) {
      return `Round ${round}: No messages yet.`;
    }

    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${SECRETARY_NEUTRALITY_PROMPT}

Provide a one-sentence summary of this round of discussion.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: prompt,
        temperature: 0.3,
        maxTokens: 100,
      });

      return `Round ${round}: ${response.content}`;
    } catch (error) {
      console.error('[Secretary] Failed to generate status update:', error);
      return `Round ${round}: ${messages.length} messages exchanged.`;
    }
  }

  /**
   * Update extracted themes in the draft
   */
  async updateThemes(themes: string[]): Promise<ResultDraft> {
    const draft = await resultDraftStorage.updateThemes(this.conversationId, themes);
    eventBus.emit('draft:updated', draft);
    return draft;
  }

  // ----- Private Helper Methods -----

  private formatMessagesForSummary(
    messages: Message[],
    agents: Array<{ id: string; name: string }>
  ): string {
    return messages
      .map(m => {
        const sender = agents.find(a => a.id === m.agentId);
        const senderName = sender?.name || 'Unknown';
        return `[${senderName}]: ${m.content}`;
      })
      .join('\n\n');
  }

  // ----- Static Factory -----

  static async load(conversationId: string): Promise<SecretaryAgent | null> {
    const agents = await agentStorage.getByConversation(conversationId);
    const secretaryEntity = agents.find(a => a.isSecretary);
    
    if (!secretaryEntity) {
      return null;
    }

    const agent = new Agent(secretaryEntity);
    return new SecretaryAgent(agent);
  }
}

