// ============================================
// AI Brainstorm - Secretary Agent
// Version: 1.0.0
// ============================================

import { Agent } from './agent';
import { llmRouter } from '../llm/llm-router';
import { buildSummaryPrompt } from '../llm/prompt-builder';
import { resultDraftStorage, messageStorage, agentStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import type { Message, ResultDraft, Conversation } from '../types';
import type { LLMMessage } from '../llm/types';

/**
 * Secretary Agent
 * Specialized agent that summarizes discussions and maintains the result draft
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
   * Generate and store a complete result draft
   */
  async generateResultDraft(conversation: Conversation): Promise<ResultDraft> {
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);

    // Generate comprehensive summary
    const summaryPrompt: LLMMessage[] = [
      {
        role: 'system',
        content: `You are creating a final result document from a brainstorming session.
Topic: ${conversation.subject}
Goal: ${conversation.goal}

Create a comprehensive document with:
1. Executive Summary (2-3 sentences)
2. Key Points Discussed
3. Decisions Made
4. Recommendations
5. Action Items (if any)
6. Open Questions (if any)

Be clear, concise, and well-organized.`,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: summaryPrompt,
        temperature: 0.3,
        maxTokens: 2000,
      });

      // Extract key decisions
      const decisionsPrompt: LLMMessage[] = [
        {
          role: 'system',
          content: 'Extract only the key decisions from this summary. List them as bullet points. If no clear decisions were made, say "No formal decisions recorded."',
        },
        {
          role: 'user',
          content: response.content,
        },
      ];

      const decisionsResponse = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: decisionsPrompt,
        temperature: 0.2,
        maxTokens: 500,
      });

      this.agent.setStatus('idle');

      const draft = await resultDraftStorage.update(this.conversationId, {
        content: response.content,
        summary: this.extractExecutiveSummary(response.content),
        keyDecisions: decisionsResponse.content,
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to generate result draft:', error);
      throw error;
    }
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
        content: `You are updating a result draft with new discussion content.
        
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
   * Provide a quick status update on the discussion
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
        content: 'Provide a one-sentence summary of this round of discussion.',
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

  private extractExecutiveSummary(content: string): string {
    // Try to extract the executive summary section
    const summaryMatch = content.match(/(?:executive summary|summary)[:\s]*([^#*]+?)(?=\n\n|\n#|\n\*|$)/i);
    if (summaryMatch) {
      return summaryMatch[1].trim();
    }

    // Fallback: take first 2-3 sentences
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').trim();
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

