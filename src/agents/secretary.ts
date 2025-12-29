// ============================================
// AI Brainstorm - Secretary Agent
// ============================================

import { Agent } from './agent';
import { llmRouter } from '../llm/llm-router';
import { buildSummaryPrompt, buildDistillationPrompt, parseDistillationResponse } from '../llm/prompt-builder';
import { resultDraftStorage, messageStorage, agentStorage, conversationStorage, distilledMemoryStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { languageService } from '../prompts/language-service';
import type { Message, ResultDraft, Conversation, Agent as AgentType, DistilledMemory, PinnedFact } from '../types';
import type { LLMMessage } from '../llm/types';

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
   * Get round decision fallback reasoning in the appropriate language
   */
  private getRoundDecisionFallbackReasoning(params: {
    targetLanguage?: string;
    kind: 'noMessages' | 'analysisComplete' | 'parseFail' | 'analysisFailed';
    completedRound?: number;
    rounds: number;
  }): string {
    const prompts = languageService.getPromptsSync(params.targetLanguage || '');
    const fallbacks = prompts.secretary.roundDecisionFallbacks;

    switch (params.kind) {
      case 'noMessages': {
        const round = params.completedRound ?? 1;
        return languageService.interpolate(fallbacks.noMessages, { round, rounds: params.rounds });
      }
      case 'analysisComplete':
        return fallbacks.analysisComplete;
      case 'parseFail':
        return languageService.interpolate(fallbacks.parseFail, { rounds: params.rounds });
      case 'analysisFailed':
        return languageService.interpolate(fallbacks.analysisFailed, { rounds: params.rounds });
      default:
        return languageService.interpolate(fallbacks.analysisFailed, { rounds: params.rounds });
    }
  }

  /**
   * Generate a summary of the current discussion
   */
  async generateSummary(messages: Message[]): Promise<string> {
    const conversation = await conversationStorage.getById(this.conversationId);
    const prompts = languageService.getPromptsSync(conversation?.targetLanguage || '');
    
    if (messages.length === 0) {
      return prompts.secretary.defaults.noDiscussion;
    }

    const agents = await agentStorage.getByConversation(this.conversationId);
    const prompt = buildSummaryPrompt(messages, agents, conversation?.targetLanguage);

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

    const conversation = await conversationStorage.getById(this.conversationId);
    const targetLanguage = conversation?.targetLanguage;
    const agents = await agentStorage.getByConversation(this.conversationId);
    const prompts = languageService.getPromptsSync(targetLanguage || '');

    let systemContent = prompts.secretary.neutralityPrompt;
    
    if (targetLanguage) {
      systemContent += `\n\n${languageService.interpolate(prompts.agent.languageRequirement, { language: targetLanguage })}`;
    }
    
    systemContent += `\n\n${languageService.interpolate(prompts.secretary.roundSummarySystem, { round })}`;

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: this.formatMessagesForSummary(messages, agents),
      },
    ];

    // Stream into the main conversation UI just like other agents.
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
      return '';
    } finally {
      eventBus.emit('stream:complete', { agentId: this.agent.id });
    }
  }

  /**
   * Analyze the first round and decide how many total rounds are needed
   * Returns the recommended number of rounds (2-10) and reasoning
   */
  async analyzeAndDecideRounds(
    conversation: Conversation,
    completedRound: number
  ): Promise<{ recommendedRounds: number; reasoning: string }> {
    const targetLanguage = conversation.targetLanguage;
    const messages = await messageStorage.getByRound(this.conversationId, completedRound);
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    
    if (messages.length === 0) {
      const recommendedRounds = 3;
      return { 
        recommendedRounds,
        reasoning: this.getRoundDecisionFallbackReasoning({
          targetLanguage,
          kind: 'noMessages',
          completedRound,
          rounds: recommendedRounds,
        }),
      };
    }

    const agents = await agentStorage.getByConversation(this.conversationId);

    let systemContent = prompts.secretary.neutralityPrompt;
    systemContent += `\n\n${languageService.interpolate(prompts.secretary.roundAnalysisSystem, {
      subject: conversation.subject,
      goal: conversation.goal,
    })}`;
    
    if (targetLanguage) {
      systemContent += `\n\nLANGUAGE REQUIREMENT: Write the "reasoning" value in ${targetLanguage}.`;
    }

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: systemContent,
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
        messages: prompt,
        temperature: 0.3,
        maxTokens: 300,
      });

      this.agent.setStatus('idle');

      // Parse JSON response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const rounds = Math.min(10, Math.max(2, parseInt(parsed.recommendedRounds, 10) || 5));
        const reasoning =
          typeof parsed.reasoning === 'string' && parsed.reasoning.trim()
            ? parsed.reasoning.trim()
            : this.getRoundDecisionFallbackReasoning({
                targetLanguage,
                kind: 'analysisComplete',
                completedRound,
                rounds,
              });
        return {
          recommendedRounds: rounds,
          reasoning,
        };
      }

      // Fallback if parsing fails
      const recommendedRounds = 5;
      return {
        recommendedRounds,
        reasoning: this.getRoundDecisionFallbackReasoning({
          targetLanguage,
          kind: 'parseFail',
          completedRound,
          rounds: recommendedRounds,
        }),
      };
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to analyze and decide rounds:', error);
      const recommendedRounds = 5;
      return {
        recommendedRounds,
        reasoning: this.getRoundDecisionFallbackReasoning({
          targetLanguage,
          kind: 'analysisFailed',
          completedRound,
          rounds: recommendedRounds,
        }),
      };
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
      const themes = await this.extractThemes(messages, agents, conversation.targetLanguage);

      // Step 3: Identify consensus areas
      const consensusAreas = await this.extractConsensus(messages, agents, conversation.targetLanguage);

      // Step 4: Identify disagreements
      const disagreements = await this.extractDisagreements(messages, agents, conversation.targetLanguage);

      // Step 5: Generate recommendations (neutral, based on discussion)
      const recommendations = await this.extractRecommendations(conversation, messages, agents);

      // Step 6: Extract action items
      const actionItems = await this.extractActionItems(messages, agents, conversation.targetLanguage);

      // Step 7: Identify open questions
      const openQuestions = await this.extractOpenQuestions(messages, agents, conversation.targetLanguage);

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
      }, conversation.targetLanguage);

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

  /**
   * Generate a comprehensive final result after all rounds complete
   */
  async generateFinalComprehensiveResult(conversation: Conversation): Promise<ResultDraft> {
    const messages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    const existingDraft = await resultDraftStorage.get(this.conversationId);
    const roundSummaries = existingDraft?.roundSummaries || [];
    const prompts = languageService.getPromptsSync(conversation.targetLanguage || '');

    this.agent.setStatus('thinking');
    eventBus.emit('agent:thinking', this.agent.id);

    try {
      const roundSummariesText = roundSummaries.length > 0
        ? roundSummaries.join('\n\n---\n\n')
        : prompts.secretary.defaults.noRoundSummaries;

      // Step 1: Generate comprehensive executive summary incorporating all rounds
      const executiveSummary = await this.extractFinalExecutiveSummary(
        conversation,
        messages,
        agents,
        roundSummariesText
      );

      // Step 2: Extract final themes across all rounds
      const themes = await this.extractThemes(messages, agents, conversation.targetLanguage);

      // Step 3: Identify final consensus areas
      const consensusAreas = await this.extractConsensus(messages, agents, conversation.targetLanguage);

      // Step 4: Identify final disagreements
      const disagreements = await this.extractDisagreements(messages, agents, conversation.targetLanguage);

      // Step 5: Generate final recommendations
      const recommendations = await this.extractRecommendations(conversation, messages, agents);

      // Step 6: Extract action items
      const actionItems = await this.extractActionItems(messages, agents, conversation.targetLanguage);

      // Step 7: Identify remaining open questions
      const openQuestions = await this.extractOpenQuestions(messages, agents, conversation.targetLanguage);

      this.agent.setStatus('idle');
      eventBus.emit('agent:idle', this.agent.id);

      // Build comprehensive final content
      const content = this.buildFinalComprehensiveContent({
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
        roundSummaries,
        totalRounds: conversation.currentRound,
        participantCount: agents.filter(a => !a.isSecretary).length,
      }, conversation.targetLanguage);

      const draft = await resultDraftStorage.update(this.conversationId, {
        content,
        summary: executiveSummary,
        keyDecisions: consensusAreas,
        executiveSummary,
        themes,
        consensusAreas,
        disagreements,
        recommendations,
        actionItems,
        openQuestions,
        roundSummaries,
      });

      eventBus.emit('draft:updated', draft);
      return draft;
    } catch (error) {
      this.agent.setStatus('idle');
      eventBus.emit('agent:idle', this.agent.id);
      console.error('[Secretary] Failed to generate final comprehensive result:', error);
      throw error;
    }
  }

  /**
   * Extract a comprehensive executive summary for the final result
   */
  private async extractFinalExecutiveSummary(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[],
    roundSummariesText: string
  ): Promise<string> {
    const prompts = languageService.getPromptsSync(conversation.targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${languageService.interpolate(
          prompts.secretary.finalExecutiveSummarySystem,
          {
            subject: conversation.subject,
            goal: conversation.goal,
            totalRounds: conversation.currentRound,
          }
        )}`,
      },
      {
        role: 'user',
        content: `Round Summaries:\n${roundSummariesText}\n\nFull Discussion:\n${this.formatMessagesForSummary(messages, agents)}`,
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

  /**
   * Build comprehensive final content including round-by-round progress
   */
  private buildFinalComprehensiveContent(sections: {
    executiveSummary: string;
    themes: string[];
    consensusAreas: string;
    disagreements: string;
    recommendations: string;
    actionItems: string;
    openQuestions: string;
    roundSummaries: string[];
    totalRounds: number;
    participantCount: number;
  }, targetLanguage?: string): string {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    const doc = prompts.secretary.resultDocument;
    const parts: string[] = [];

    parts.push(doc.finalTitle);
    
    parts.push(doc.overview);
    parts.push(languageService.interpolate(doc.totalRounds, { rounds: sections.totalRounds }));
    parts.push(languageService.interpolate(doc.participants, { count: sections.participantCount }));
    parts.push('');

    parts.push(doc.executiveSummary);
    parts.push(sections.executiveSummary + '\n');

    if (sections.themes.length > 0) {
      parts.push(doc.mainThemes);
      sections.themes.forEach(theme => parts.push(`- ${theme}`));
      parts.push('');
    }

    parts.push(doc.areasOfConsensus);
    parts.push(sections.consensusAreas + '\n');

    parts.push(doc.areasOfDisagreement);
    parts.push(sections.disagreements + '\n');

    parts.push(doc.recommendations);
    parts.push(sections.recommendations + '\n');

    parts.push(doc.actionItems);
    parts.push(sections.actionItems + '\n');

    parts.push(doc.openQuestions);
    parts.push(sections.openQuestions + '\n');

    // Add round-by-round summary section
    if (sections.roundSummaries.length > 0) {
      parts.push(doc.roundByRoundProgress);
      sections.roundSummaries.forEach((summary, index) => {
        parts.push(languageService.interpolate(doc.roundLabel, { round: index + 1 }));
        parts.push(summary + '\n');
      });
    }

    return parts.join('\n');
  }

  // ----- Multi-Step Extraction Methods -----

  private async extractExecutiveSummaryLLM(
    conversation: Conversation,
    messages: Message[],
    agents: AgentType[]
  ): Promise<string> {
    const prompts = languageService.getPromptsSync(conversation.targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${languageService.interpolate(
          prompts.secretary.executiveSummarySystem,
          {
            subject: conversation.subject,
            goal: conversation.goal,
          }
        )}`,
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

  private async extractThemes(messages: Message[], agents: AgentType[], targetLanguage?: string): Promise<string[]> {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${prompts.secretary.themeExtractionSystem}`,
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

  private async extractConsensus(messages: Message[], agents: AgentType[], targetLanguage?: string): Promise<string> {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${prompts.secretary.consensusExtractionSystem}`,
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

  private async extractDisagreements(messages: Message[], agents: AgentType[], targetLanguage?: string): Promise<string> {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${prompts.secretary.disagreementExtractionSystem}`,
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
    const prompts = languageService.getPromptsSync(conversation.targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${languageService.interpolate(
          prompts.secretary.recommendationsExtractionSystem,
          { goal: conversation.goal }
        )}`,
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

  private async extractActionItems(messages: Message[], agents: AgentType[], targetLanguage?: string): Promise<string> {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${prompts.secretary.actionItemsExtractionSystem}`,
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

  private async extractOpenQuestions(messages: Message[], agents: AgentType[], targetLanguage?: string): Promise<string> {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    
    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${prompts.secretary.openQuestionsExtractionSystem}`,
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
  }, targetLanguage?: string): string {
    const prompts = languageService.getPromptsSync(targetLanguage || '');
    const doc = prompts.secretary.resultDocument;
    const parts: string[] = [];

    parts.push(doc.title);
    parts.push(doc.executiveSummary);
    parts.push(sections.executiveSummary + '\n');

    if (sections.themes.length > 0) {
      parts.push(doc.mainThemes);
      sections.themes.forEach(theme => parts.push(`- ${theme}`));
      parts.push('');
    }

    parts.push(doc.areasOfConsensus);
    parts.push(sections.consensusAreas + '\n');

    parts.push(doc.areasOfDisagreement);
    parts.push(sections.disagreements + '\n');

    parts.push(doc.recommendations);
    parts.push(sections.recommendations + '\n');

    parts.push(doc.actionItems);
    parts.push(sections.actionItems + '\n');

    parts.push(doc.openQuestions);
    parts.push(sections.openQuestions + '\n');

    return parts.join('\n');
  }

  /**
   * Generate an incremental update to the result draft
   */
  async incrementalUpdate(newMessages: Message[]): Promise<ResultDraft> {
    const existingDraft = await resultDraftStorage.get(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    const conversation = await conversationStorage.getById(this.conversationId);
    const prompts = languageService.getPromptsSync(conversation?.targetLanguage || '');

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${languageService.interpolate(
          prompts.secretary.incrementalUpdateSystem,
          { existingSummary: existingDraft?.summary || prompts.secretary.defaults.noDiscussion }
        )}`,
      },
      {
        role: 'user',
        content: languageService.interpolate(prompts.secretary.incrementalUpdateUser, {
          messages: this.formatMessagesForSummary(newMessages, agents),
        }),
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
      const doc = prompts.secretary.resultDocument;
      const newContent = existingDraft?.content
        ? `${existingDraft.content}\n\n---\n\n${doc.updateLabel}${response.content}`
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
    const conversation = await conversationStorage.getById(this.conversationId);
    const prompts = languageService.getPromptsSync(conversation?.targetLanguage || '');
    
    if (messages.length === 0) {
      return languageService.interpolate(prompts.secretary.defaults.noRoundMessages, { round });
    }

    const agents = await agentStorage.getByConversation(this.conversationId);

    const prompt: LLMMessage[] = [
      {
        role: 'system',
        content: `${prompts.secretary.neutralityPrompt}\n\n${prompts.secretary.statusUpdateSystem}`,
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

  // ----- Context Distillation Methods -----

  /**
   * Distill older conversation messages into a compact summary
   */
  async distillConversation(upToRound?: number): Promise<DistilledMemory> {
    const conversation = await conversationStorage.getById(this.conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const targetRound = upToRound ?? Math.max(0, conversation.currentRound - 1);
    const existingDistillation = await distilledMemoryStorage.getOrCreate(this.conversationId);
    
    if (existingDistillation.lastDistilledRound >= targetRound) {
      console.log(`[Secretary] Already distilled up to round ${existingDistillation.lastDistilledRound}, skipping`);
      return existingDistillation;
    }

    const allMessages = await messageStorage.getByConversation(this.conversationId);
    const agents = await agentStorage.getByConversation(this.conversationId);
    
    const lastDistilledIdx = existingDistillation.lastDistilledMessageId
      ? allMessages.findIndex(m => m.id === existingDistillation.lastDistilledMessageId)
      : -1;
    
    const messagesToDistill = allMessages.filter((m, idx) => {
      if (idx <= lastDistilledIdx) return false;
      if (m.round > targetRound) return false;
      if (m.type !== 'response' && m.type !== 'interjection' && m.type !== 'opening') return false;
      return true;
    });

    if (messagesToDistill.length === 0) {
      console.log('[Secretary] No new messages to distill');
      return existingDistillation;
    }

    console.log(`[Secretary] Distilling ${messagesToDistill.length} messages from round ${existingDistillation.lastDistilledRound + 1} to ${targetRound}`);

    const distillationPrompt = buildDistillationPrompt(
      messagesToDistill,
      agents,
      {
        distilledSummary: existingDistillation.distilledSummary || undefined,
        currentStance: existingDistillation.currentStance || undefined,
        keyDecisions: existingDistillation.keyDecisions?.length ? existingDistillation.keyDecisions : undefined,
        openQuestions: existingDistillation.openQuestions?.length ? existingDistillation.openQuestions : undefined,
        pinnedFacts: existingDistillation.pinnedFacts?.length ? existingDistillation.pinnedFacts : undefined,
      },
      conversation.subject,
      conversation.targetLanguage
    );

    this.agent.setStatus('thinking');

    try {
      const response = await llmRouter.complete(this.agent.llmProviderId, {
        model: this.agent.modelId,
        messages: distillationPrompt,
        temperature: 0.2,
        maxTokens: 2000,
      });

      this.agent.setStatus('idle');

      const distillation = parseDistillationResponse(response.content);
      
      if (!distillation) {
        console.error('[Secretary] Failed to parse distillation response');
        throw new Error('Failed to parse distillation response');
      }

      const pinnedFacts: PinnedFact[] = distillation.pinnedFacts.map((f, idx) => ({
        id: `pf-${targetRound}-${idx}`,
        content: f.content,
        category: f.category,
        source: f.source,
        round: targetRound,
        importance: f.importance,
      }));

      const updatedMemory = await distilledMemoryStorage.update(this.conversationId, {
        distilledSummary: distillation.distilledSummary,
        currentStance: distillation.currentStance,
        keyDecisions: distillation.keyDecisions,
        openQuestions: distillation.openQuestions,
        constraints: distillation.constraints,
        actionItems: distillation.actionItems,
        pinnedFacts,
        lastDistilledRound: targetRound,
        lastDistilledMessageId: messagesToDistill[messagesToDistill.length - 1].id,
        totalMessagesDistilled: existingDistillation.totalMessagesDistilled + messagesToDistill.length,
      });

      console.log(`[Secretary] Distillation complete. Distilled ${messagesToDistill.length} messages into ${distillation.distilledSummary.length} chars summary with ${pinnedFacts.length} pinned facts`);

      return updatedMemory;
    } catch (error) {
      this.agent.setStatus('idle');
      console.error('[Secretary] Failed to distill conversation:', error);
      throw error;
    }
  }

  /**
   * Check if context distillation is needed
   */
  async shouldDistill(): Promise<boolean> {
    const conversation = await conversationStorage.getById(this.conversationId);
    if (!conversation) return false;

    const existingDistillation = await distilledMemoryStorage.get(this.conversationId);
    
    if (!existingDistillation && conversation.currentRound >= 2) {
      return true;
    }

    if (existingDistillation && conversation.currentRound > existingDistillation.lastDistilledRound + 1) {
      return true;
    }

    const allMessages = await messageStorage.getByConversation(this.conversationId);
    const lastDistilledRound = existingDistillation?.lastDistilledRound ?? 0;
    const undistilledMessages = allMessages.filter(m => m.round > lastDistilledRound);
    
    if (undistilledMessages.length > 10) {
      return true;
    }

    return false;
  }

  /**
   * Get the current distilled memory for this conversation
   */
  async getDistilledMemory(): Promise<DistilledMemory | undefined> {
    return distilledMemoryStorage.get(this.conversationId);
  }

  /**
   * Clear distilled memory (e.g., when resetting conversation)
   */
  async clearDistilledMemory(): Promise<void> {
    await distilledMemoryStorage.delete(this.conversationId);
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
