// ============================================
// AI Brainstorm - Conversation Engine
// ============================================

import { Agent } from '../agents/agent';
import { AgentFactory } from '../agents/agent-factory';
import { SecretaryAgent } from '../agents/secretary';
import { TurnManager, TurnSchedule } from './turn-manager';
import { TurnExecutor, TurnResult } from './turn-executor';
import { ResultManager } from './result-manager';
import { UserInterjectionHandler } from './user-interjection';
import { ConversationStateMachine } from './state-machine';
import { conversationStorage, turnStorage, messageStorage, notebookStorage, interjectionStorage, reactionStorage, distilledMemoryStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { sleep } from '../utils/helpers';
import { selectFirstSpeaker, getStrategyById } from '../strategies/starting-strategies';
import { acquireLock, releaseLock, isLockedByOtherTab } from '../utils/conversation-lock';
import { languageService } from '../prompts/language-service';
import type { Conversation, Turn, Message, ConversationStatus, ConversationMode, StartingStrategyId, ConversationDepth, TurnQueueState, TurnQueueItem } from '../types';

export interface ConversationEngineOptions {
  onAgentThinking?: (agentId: string) => void;
  onAgentSpeaking?: (agentId: string, content: string) => void;
  onStreamChunk?: (agentId: string, chunk: string) => void;
  onTurnComplete?: (turn: Turn, message: Message) => void;
  onRoundComplete?: (round: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Conversation Engine
 * Main orchestrator for multi-agent discussions
 */
export class ConversationEngine {
  private static getActiveConversationSet(): Set<string> {
    const key = '__brainstormActiveConversationIds';
    const g = globalThis as any;
    if (!g[key]) g[key] = new Set<string>();
    return g[key] as Set<string>;
  }

  private conversation: Conversation;
  private agents: Agent[] = [];
  private secretary: SecretaryAgent | null = null;
  private turnManager: TurnManager | null = null;
  private turnExecutor: TurnExecutor | null = null;
  private resultManager: ResultManager;
  private interjectionHandler: UserInterjectionHandler;
  private stateMachine: ConversationStateMachine;
  private options: ConversationEngineOptions;
  private streamingContent: Map<string, string> = new Map();
  private completedAgentsInRound: Set<string> = new Set();
  private currentTurnAgentId: string | null = null;

  constructor(conversation: Conversation, options: ConversationEngineOptions = {}) {
    this.conversation = conversation;
    this.options = options;
    this.resultManager = new ResultManager(conversation.id);
    this.interjectionHandler = new UserInterjectionHandler(conversation.id, conversation.currentRound);
    this.stateMachine = new ConversationStateMachine(conversation.status);
    this.turnExecutor = new TurnExecutor(conversation);
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    // Load agents
    this.agents = await Agent.loadForConversation(this.conversation.id);
    
    // Initialize turn manager
    const agentEntities = this.agents.map(a => a.entityData);
    this.turnManager = new TurnManager(
      this.conversation.id,
      this.conversation.mode,
      agentEntities,
      this.conversation.currentRound
    );

    // Load secretary
    this.secretary = await SecretaryAgent.load(this.conversation.id);
    
    // Initialize result manager
    await this.resultManager.initialize();

    console.log(`[Engine] Initialized with ${this.agents.length} agents`);
  }

  /**
   * Start the conversation
   */
  async start(): Promise<void> {
    const conversationId = this.conversation.id;

    // Try to acquire lock first (multi-tab safety)
    const lockAcquired = await acquireLock(conversationId);
    if (!lockAcquired) {
      console.warn('[Engine] Cannot start - conversation is running in another tab');
      this.options.onError?.(new Error('This conversation is running in another tab'));
      eventBus.emit('conversation:lock-denied', conversationId);
      return;
    }

     let enteredRunningState = false;
    try {
      if (!this.stateMachine.transition('running')) {
        console.warn('[Engine] Cannot start - invalid state');
        return;
      }
       enteredRunningState = true;

      // Reset tracking for new run
      this.completedAgentsInRound.clear();
      this.currentTurnAgentId = null;

      ConversationEngine.getActiveConversationSet().add(conversationId);
      await this.updateConversationStatus('running');
      eventBus.emit('conversation:started', conversationId);

      // Emit initial turn queue state
      this.emitTurnQueueState();

      await this.runLoop();
    } catch (err) {
      // If runLoop (or any pre-loop work) throws, we MUST release the Web Lock.
      // Otherwise the conversation can be permanently blocked in this tab.
      this.turnExecutor?.abort();

      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[Engine] Fatal error in start():', error);
      this.options.onError?.(error);
    } finally {
       // If we actually entered running state and the loop exited unexpectedly while still
       // marked as running, reconcile state (covers `break` exits too).
       if (enteredRunningState && this.stateMachine.isRunning()) {
        this.stateMachine.transition('paused');
        await this.updateConversationStatus('paused');
        eventBus.emit('conversation:paused', conversationId);
      }

      ConversationEngine.getActiveConversationSet().delete(conversationId);
      releaseLock(conversationId);
    }
  }

  /**
   * Pause the conversation
   */
  async pause(): Promise<void> {
    if (!this.stateMachine.transition('paused')) {
      return;
    }

    this.turnExecutor?.abort();
    ConversationEngine.getActiveConversationSet().delete(this.conversation.id);
    releaseLock(this.conversation.id);
    await this.updateConversationStatus('paused');
    eventBus.emit('conversation:paused', this.conversation.id);
  }

  /**
   * Resume the conversation
   */
  async resume(): Promise<void> {
    const conversationId = this.conversation.id;

    // Try to acquire lock first (multi-tab safety)
    const lockAcquired = await acquireLock(conversationId);
    if (!lockAcquired) {
      console.warn('[Engine] Cannot resume - conversation is running in another tab');
      this.options.onError?.(new Error('This conversation is running in another tab'));
      eventBus.emit('conversation:lock-denied', conversationId);
      return;
    }

     let enteredRunningState = false;
    try {
      if (!this.stateMachine.transition('running')) {
        return;
      }
       enteredRunningState = true;

      ConversationEngine.getActiveConversationSet().add(conversationId);
      await this.updateConversationStatus('running');
      eventBus.emit('conversation:resumed', conversationId);

      await this.runLoop();
    } catch (err) {
      this.turnExecutor?.abort();

      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[Engine] Fatal error in resume():', error);
      this.options.onError?.(error);
    } finally {
       if (enteredRunningState && this.stateMachine.isRunning()) {
        this.stateMachine.transition('paused');
        await this.updateConversationStatus('paused');
        eventBus.emit('conversation:paused', conversationId);
      }

      ConversationEngine.getActiveConversationSet().delete(conversationId);
      releaseLock(conversationId);
    }
  }

  /**
   * Stop and complete the conversation
   */
  async stop(): Promise<void> {
    this.turnExecutor?.abort();
    
    if (this.stateMachine.transition('completed')) {
      ConversationEngine.getActiveConversationSet().delete(this.conversation.id);
      releaseLock(this.conversation.id);
      await this.updateConversationStatus('completed');
      
      // Generate final result draft
      await this.resultManager.generateFinalDraft(this.conversation);
      
      eventBus.emit('conversation:stopped', this.conversation.id);
    }
  }

  /**
   * Finish the conversation gracefully with a final wrap-up round.
   * 1. Broadcasts a "finishing" message to all agents
   * 2. Each agent gets one brief final turn for closing thoughts
   * 3. Secretary generates the comprehensive final result
   */
  async finish(): Promise<void> {
    const conversationId = this.conversation.id;
    
    // Transition to finishing state
    if (!this.stateMachine.transition('finishing')) {
      console.warn('[Engine] Cannot finish - invalid state');
      return;
    }

    // Try to acquire lock if not already held
    const lockAcquired = await acquireLock(conversationId);
    if (!lockAcquired) {
      console.warn('[Engine] Cannot finish - conversation is running in another tab');
      this.options.onError?.(new Error('This conversation is running in another tab'));
      eventBus.emit('conversation:lock-denied', conversationId);
      return;
    }

    try {
      ConversationEngine.getActiveConversationSet().add(conversationId);
      await this.updateConversationStatus('finishing');
      eventBus.emit('conversation:finishing', conversationId);

      // Create a system message broadcasting the finish signal
      const finishMessage = await messageStorage.create({
        conversationId: this.conversation.id,
        content: this.getFinishBroadcastMessage(),
        round: this.conversation.currentRound,
        type: 'system',
      });
      eventBus.emit('message:created', finishMessage);

      // Run the final wrap-up round
      await this.runFinishingRound();

      // Generate the final comprehensive result
      await this.generateFinalResult();

      console.log(`[Engine] Conversation ${conversationId} finished successfully`);
    } catch (error) {
      this.turnExecutor?.abort();
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[Engine] Error during finish:', err);
      this.options.onError?.(err);
      
      // Fall back to paused state on error
      if (this.stateMachine.canTransition('completed')) {
        this.stateMachine.transition('completed');
        await this.updateConversationStatus('completed');
      }
    } finally {
      ConversationEngine.getActiveConversationSet().delete(conversationId);
      releaseLock(conversationId);
    }
  }

  /**
   * Get the finish broadcast message in the appropriate language
   */
  private getFinishBroadcastMessage(): string {
    const prompts = languageService.getPromptsSync(this.conversation.targetLanguage || '');
    return prompts.context.finishingPhase?.broadcastMessage || 
      'The discussion is now wrapping up. Each participant will have one final opportunity to share brief closing thoughts before the secretary compiles the final result.';
  }

  /**
   * Run a final wrap-up round where each agent gets one brief turn
   */
  private async runFinishingRound(): Promise<void> {
    // Reset round tracking for the finishing round
    this.completedAgentsInRound.clear();
    
    // Get non-secretary agents
    const participantAgents = this.agents.filter(a => !a.entityData.isSecretary);
    
    if (participantAgents.length === 0) {
      return;
    }

    // Execute brief final turn for each agent
    for (const agent of participantAgents) {
      if (!this.stateMachine.isFinishing()) {
        break; // State changed, stop processing
      }

      try {
        // Create a simplified turn schedule for the finishing round
        const finishingSchedule: TurnSchedule = {
          round: this.conversation.currentRound,
          sequence: this.completedAgentsInRound.size,
          agentId: agent.id,
        };

        // Execute the turn (the context builder will detect finishing state)
        await this.executeTurn(finishingSchedule);

        // Brief pause between agents
        if (this.conversation.speedMs > 0) {
          await sleep(Math.min(this.conversation.speedMs, 1000));
        }
      } catch (error) {
        console.warn(`[Engine] Finishing turn failed for agent ${agent.id}:`, error);
        // Continue with other agents even if one fails
      }
    }

    // Mark finishing round as complete
    this.completedAgentsInRound.clear();
  }

  /**
   * Reset the conversation - clears all messages, turns, notebooks, and result drafts
   * to allow re-running the conversation from the beginning
   */
  async reset(): Promise<void> {
    this.turnExecutor?.abort();
    this.stateMachine.reset();
    ConversationEngine.getActiveConversationSet().delete(this.conversation.id);
    releaseLock(this.conversation.id);

    // Delete reactions tied to this conversation's messages (prevents orphaned reactions)
    const existingMessages = await messageStorage.getByConversation(this.conversation.id);
    await reactionStorage.deleteByMessageIds(existingMessages.map(m => m.id));

    // Delete all turns (not just mark as cancelled)
    await turnStorage.deleteByConversation(this.conversation.id);

    // Delete all messages
    await messageStorage.deleteByConversation(this.conversation.id);

    // Delete user interjections for this conversation
    await interjectionStorage.deleteByConversation(this.conversation.id);

    // Clear all agent notebooks
    await notebookStorage.clearAllForConversation(this.conversation.id);

    // Clear distilled memory
    await distilledMemoryStorage.delete(this.conversation.id);

    // Reset conversation state (including dynamic round decision)
    await conversationStorage.update(this.conversation.id, {
      status: 'idle',
      currentRound: 0,
      recommendedRounds: undefined,
      roundDecisionReasoning: undefined,
    });

    this.conversation.status = 'idle';
    this.conversation.currentRound = 0;
    this.conversation.recommendedRounds = undefined;
    this.conversation.roundDecisionReasoning = undefined;

    // Reset tracking state
    this.completedAgentsInRound.clear();
    this.currentTurnAgentId = null;
    this.streamingContent.clear();

    // Reset managers
    await this.interjectionHandler.clear();
    await this.resultManager.clear();
    this.turnManager?.setCurrentRound(0);

    console.log(`[Engine] Conversation ${this.conversation.id} reset - all data cleared`);
    eventBus.emit('conversation:updated', this.conversation);
    eventBus.emit('conversation:reset', this.conversation.id);
  }

  /**
   * Add user interjection
   */
  async addInterjection(content: string, immediate: boolean = false): Promise<void> {
    const mode = immediate ? 'immediate' : 'next_round';
    await this.interjectionHandler.addInterjection(content, mode);
  }

  /**
   * Force a specific agent to speak next
   */
  forceNextSpeaker(agentId: string): void {
    this.turnManager?.queueAgent(agentId, 'User requested');
  }

  /**
   * Get current status
   */
  getStatus(): ConversationStatus {
    return this.stateMachine.currentStatus;
  }

  /**
   * Get current round
   */
  getCurrentRound(): number {
    return this.conversation.currentRound;
  }

  /**
   * Get agents
   */
  getAgents(): Agent[] {
    return this.agents;
  }

  /**
   * Set conversation speed (delay between turns)
   */
  async setSpeedMs(speedMs: number): Promise<void> {
    this.conversation.speedMs = Math.max(500, speedMs);
    await conversationStorage.update(this.conversation.id, { speedMs: this.conversation.speedMs });
  }

  /**
   * Main run loop
   */
  private async runLoop(): Promise<void> {
    while (this.stateMachine.isRunning()) {
      // Check round limit - use recommendedRounds if set, otherwise maxRounds
      const effectiveMaxRounds = this.conversation.recommendedRounds || this.conversation.maxRounds || Infinity;
      if (this.conversation.currentRound >= effectiveMaxRounds) {
        // Final round reached - this will be handled by onRoundComplete
        // which generates the final result and stops the conversation
        break;
      }

      // Check for immediate interjections
      if (this.interjectionHandler.hasImmediateInterjections()) {
        const interjections = this.interjectionHandler.getImmediateInterjections();
        for (const interjection of interjections) {
          await this.interjectionHandler.markProcessed(interjection.id);
        }
      }

      // Get next turn
      const schedule = await this.turnManager?.getNextAgent();
      if (!schedule) {
        console.log('[Engine] No more agents to schedule');
        break;
      }

      // Execute the turn
      const result = await this.executeTurn(schedule);

      if (!result.success) {
        this.options.onError?.(new Error(result.error || 'Turn failed'));
        
        // Wait before retrying on error
        await sleep(2000);
        continue;
      }

      // Check if round is complete
      if (this.turnManager?.isRoundComplete()) {
        await this.onRoundComplete();
      }

      // Wait between turns
      if (this.conversation.speedMs > 0 && this.stateMachine.isRunning()) {
        await sleep(this.conversation.speedMs);
      }
    }
  }

  /**
   * Execute a single turn
   */
  private async executeTurn(schedule: TurnSchedule): Promise<TurnResult> {
    // Check idempotency - skip if already completed
    const isCompleted = await this.turnManager?.isTurnCompleted(schedule.round, schedule.sequence);
    if (isCompleted) {
      console.log(`[Engine] Skipping completed turn: round=${schedule.round}, seq=${schedule.sequence}`);
      return { success: true, tokensUsed: 0 };
    }

    // Find the agent
    const agent = this.agents.find(a => a.id === schedule.agentId);
    if (!agent) {
      return { success: false, error: 'Agent not found', tokensUsed: 0 };
    }

    // Track current turn agent
    this.currentTurnAgentId = agent.id;

    // Emit updated turn queue state
    this.emitTurnQueueState();

    // Create turn record
    const turn = await this.turnManager!.createTurn(schedule);

    // Notify thinking - emit event for UI components
    this.options.onAgentThinking?.(agent.id);
    eventBus.emit('agent:thinking', agent.id);

    // Initialize streaming content
    this.streamingContent.set(agent.id, '');

    // Execute with streaming
    const result = await this.turnExecutor!.execute(turn, agent, (chunk) => {
      const current = this.streamingContent.get(agent.id) || '';
      this.streamingContent.set(agent.id, current + chunk);
      this.options.onStreamChunk?.(agent.id, chunk);
      // Emit stream chunk event for UI components
      eventBus.emit('stream:chunk', { agentId: agent.id, content: chunk });
    });

    // Clear streaming content and emit completion
    this.streamingContent.delete(agent.id);
    eventBus.emit('stream:complete', { agentId: agent.id });

    // Mark agent as completed in this round
    this.completedAgentsInRound.add(agent.id);
    this.currentTurnAgentId = null;

    // Emit updated turn queue state
    this.emitTurnQueueState();

    // Set agent back to idle
    eventBus.emit('agent:idle', agent.id);

    if (result.success && result.message) {
      this.options.onAgentSpeaking?.(agent.id, result.message.content);
      this.options.onTurnComplete?.(turn, result.message);
    }

    return result;
  }

  /**
   * Handle round completion
   */
  private async onRoundComplete(): Promise<void> {
    const round = this.conversation.currentRound;
    
    // Reset completed agents tracking for next round
    this.completedAgentsInRound.clear();
    
    // Update round in database
    this.conversation.currentRound++;
    await conversationStorage.update(this.conversation.id, {
      currentRound: this.conversation.currentRound,
    });

    // Update turn manager
    this.turnManager?.advanceRound();
    this.interjectionHandler.setCurrentRound(this.conversation.currentRound);

    // Emit updated turn queue for new round
    this.emitTurnQueueState();

    // Generate secretary round summary (if exists)
    // This summary is stored as a visible system message so agents can reference it
    if (this.secretary) {
      try {
        const roundSummary = await this.secretary.generateRoundSummary(round);
        
        if (roundSummary) {
          // Store the summary as a system message so it appears in the conversation
          // and is visible to all agents in subsequent turns
          const summaryMessage = await messageStorage.create({
            conversationId: this.conversation.id,
            agentId: this.secretary.id,
            // Store the secretary summary as-is to avoid hardcoded English headers
            // when the conversation has a target language.
            content: roundSummary,
            round: round,
            type: 'summary',
          });
          
          eventBus.emit('message:created', summaryMessage);
          console.log(`[Engine] Secretary generated round ${round} summary`);
        }

        // After round 1 completes, secretary analyzes and decides total rounds
        // Only do this if maxRounds hasn't been set yet (or was not user-defined)
        // NOTE: In this codebase, the first agent round is round 0.
        if (round === 0 && !this.conversation.recommendedRounds) {
          await this.decideRoundsAfterFirstRound(round);
        }
      } catch (error) {
        console.warn('[Engine] Secretary round summary failed:', error);
      }
    }

    // Check if this is the final round - if so, generate comprehensive result
    const effectiveMaxRounds = this.conversation.recommendedRounds || this.conversation.maxRounds;
    if (effectiveMaxRounds && this.conversation.currentRound >= effectiveMaxRounds) {
      console.log(`[Engine] Reached final round (${effectiveMaxRounds}), generating comprehensive result...`);
      await this.generateFinalResult();
      return; // Stop processing, conversation will be completed
    }

    // Trigger context distillation if secretary is available
    // This compresses older messages into a summary to manage context window
    if (this.secretary) {
      await this.triggerDistillationIfNeeded(round);
    }

    // Update result draft incrementally
    await this.resultManager.incrementalUpdate(round);

    // Mark interjections as processed
    await this.interjectionHandler.markAllProcessed();

    this.options.onRoundComplete?.(round);
  }

  /**
   * Secretary analyzes round 1 and decides total rounds needed
   */
  private async decideRoundsAfterFirstRound(completedRound: number): Promise<void> {
    if (!this.secretary) return;

    try {
      const decision = await this.secretary.analyzeAndDecideRounds(this.conversation, completedRound);
      
      // Update conversation with recommended rounds
      this.conversation.recommendedRounds = decision.recommendedRounds;
      this.conversation.roundDecisionReasoning = decision.reasoning;
      this.conversation.maxRounds = decision.recommendedRounds;
      
      await conversationStorage.update(this.conversation.id, {
        recommendedRounds: decision.recommendedRounds,
        roundDecisionReasoning: decision.reasoning,
        maxRounds: decision.recommendedRounds,
      });

      // Emit event for UI notification
      eventBus.emit('conversation:rounds-decided', {
        conversationId: this.conversation.id,
        recommendedRounds: decision.recommendedRounds,
        reasoning: decision.reasoning,
      });

      // Create a system message to announce the decision
      const decisionMessage = await messageStorage.create({
        conversationId: this.conversation.id,
        agentId: this.secretary.id,
        // Keep this message language-neutral to avoid injecting English when targetLanguage is set.
        // The secretary already writes the reasoning in targetLanguage when configured.
        content: (decision.reasoning || `${decision.recommendedRounds}`).trim(),
        round: completedRound,
        type: 'system',
      });

      eventBus.emit('message:created', decisionMessage);
      console.log(`[Engine] Secretary decided ${decision.recommendedRounds} rounds: ${decision.reasoning}`);
    } catch (error) {
      console.error('[Engine] Failed to decide rounds:', error);
      // Fallback to default 5 rounds if decision fails
      this.conversation.recommendedRounds = 5;
      this.conversation.maxRounds = 5;
      await conversationStorage.update(this.conversation.id, {
        recommendedRounds: 5,
        maxRounds: 5,
      });
    }
  }

  /**
   * Trigger context distillation if conditions are met
   * Distillation compresses older messages into a summary to manage context window
   */
  private async triggerDistillationIfNeeded(completedRound: number): Promise<void> {
    if (!this.secretary) return;

    try {
      // Check if distillation is needed
      const shouldDistill = await this.secretary.shouldDistill();
      
      if (shouldDistill) {
        console.log(`[Engine] Triggering context distillation after round ${completedRound}`);
        
        // Distill up to the completed round (leave current round raw)
        await this.secretary.distillConversation(completedRound);
        
        console.log(`[Engine] Context distillation completed`);
      }
    } catch (error) {
      // Log but don't fail the round completion
      console.warn('[Engine] Context distillation failed:', error);
    }
  }

  /**
   * Generate final comprehensive result and complete conversation
   */
  private async generateFinalResult(): Promise<void> {
    if (this.secretary) {
      try {
        // Generate comprehensive final result using secretary
        await this.secretary.generateFinalComprehensiveResult(this.conversation);
        console.log('[Engine] Secretary generated final comprehensive result');
      } catch (error) {
        console.error('[Engine] Failed to generate final result:', error);
        // Fallback to regular final draft
        await this.resultManager.generateFinalDraft(this.conversation);
      }
    } else {
      // No secretary, use regular final draft
      await this.resultManager.generateFinalDraft(this.conversation);
    }

    // Complete the conversation
    if (this.stateMachine.transition('completed')) {
      ConversationEngine.getActiveConversationSet().delete(this.conversation.id);
      releaseLock(this.conversation.id);
      await this.updateConversationStatus('completed');
      eventBus.emit('conversation:stopped', this.conversation.id);
    }
  }

  /**
   * Update conversation status in database
   */
  private async updateConversationStatus(status: ConversationStatus): Promise<void> {
    this.conversation.status = status;
    await conversationStorage.update(this.conversation.id, { status });
  }

  /**
   * Get streaming content for an agent
   */
  getStreamingContent(agentId: string): string {
    return this.streamingContent.get(agentId) || '';
  }

  /**
   * Get result manager
   */
  getResultManager(): ResultManager {
    return this.resultManager;
  }

  /**
   * Get conversation
   */
  getConversation(): Conversation {
    return this.conversation;
  }

  /**
   * Build and emit turn queue state
   */
  private emitTurnQueueState(): void {
    const nonSecretaryAgents = this.agents.filter(a => !a.entityData.isSecretary);
    
    // Build queue items
    const queue: TurnQueueItem[] = nonSecretaryAgents.map((agent, index) => {
      let status: 'completed' | 'current' | 'waiting';
      
      if (this.completedAgentsInRound.has(agent.id)) {
        status = 'completed';
      } else if (this.currentTurnAgentId === agent.id) {
        status = 'current';
      } else {
        status = 'waiting';
      }

      return {
        agentId: agent.id,
        agentName: agent.entityData.name,
        agentColor: agent.entityData.color,
        status,
        order: index,
      };
    });

    const state: TurnQueueState = {
      conversationId: this.conversation.id,
      round: this.conversation.currentRound,
      currentIndex: this.completedAgentsInRound.size,
      totalAgents: nonSecretaryAgents.length,
      queue,
    };

    // Emit the appropriate event
    if (this.currentTurnAgentId) {
      eventBus.emit('turn:queued', state);
    } else {
      eventBus.emit('turn:order-updated', state);
    }
  }

  /**
   * Get current turn queue state (for initial load)
   */
  async getTurnQueueState(): Promise<TurnQueueState | null> {
    const nonSecretaryAgents = this.agents.filter(a => !a.entityData.isSecretary);
    if (nonSecretaryAgents.length === 0) return null;

    // For display, we treat "running/paused" as being inside the current round,
    // and "idle/completed" as showing the last completed round (if any).
    const status = this.conversation.status;
    const displayRound =
      status === 'running' || status === 'paused'
        ? this.conversation.currentRound
        : Math.max(0, this.conversation.currentRound - 1);

    const turnsInRound = await turnStorage.getByRound(this.conversation.id, displayRound);
    const completedAgentIds = new Set(
      turnsInRound.filter(t => t.state === 'completed').map(t => t.agentId)
    );

    // If a turn is currently running, highlight that agent as "current"
    const runningTurn = turnsInRound
      .filter(t => t.state === 'running')
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    const runningAgentId = runningTurn?.agentId ?? null;

    const queue: TurnQueueItem[] = nonSecretaryAgents.map((agent, index) => {
      let itemStatus: 'completed' | 'current' | 'waiting';

      if (completedAgentIds.has(agent.id)) {
        itemStatus = 'completed';
      } else if (runningAgentId && runningAgentId === agent.id) {
        itemStatus = 'current';
      } else {
        itemStatus = 'waiting';
      }

      return {
        agentId: agent.id,
        agentName: agent.entityData.name,
        agentColor: agent.entityData.color,
        status: itemStatus,
        order: index,
      };
    });

    return {
      conversationId: this.conversation.id,
      round: displayRound,
      currentIndex: Math.min(completedAgentIds.size, nonSecretaryAgents.length),
      totalAgents: nonSecretaryAgents.length,
      queue,
    };
  }

  // ----- Static Factory Methods -----

  /**
   * Create a new conversation and engine
   */
  static async create(
    subject: string,
    goal: string,
    mode: ConversationMode,
    agentConfigs: Array<{
      presetId?: string;
      name?: string;
      role?: string;
      expertise?: string;
      llmProviderId: string;
      modelId: string;
      thinkingDepth?: number;
      creativityLevel?: number;
    }>,
    options: {
      speedMs?: number;
      maxContextTokens?: number;
      plainTextOnly?: boolean;
      maxRounds?: number;
      includeSecretary?: boolean;
      // Strategy configuration
      startingStrategy?: StartingStrategyId;
      openingStatement?: string;
      groundRules?: string;
      // Word limit configuration
      defaultWordLimit?: number;
      extendedSpeakingChance?: number;
      extendedMultiplier?: 3 | 5;
      // Conversation depth (controls response verbosity)
      conversationDepth?: ConversationDepth;
      // Target language for agent responses
      targetLanguage?: string;
      // MCP (Model Context Protocol) settings
      mcpServerIds?: string[];
      mcpToolApprovalMode?: 'auto' | 'approval';
    } = {}
  ): Promise<ConversationEngine> {
    // Create conversation with strategy config and word limits
    const conversation = await conversationStorage.create({
      subject,
      goal,
      mode,
      speedMs: options.speedMs ?? 2000,
      maxContextTokens: options.maxContextTokens ?? 8000,
      plainTextOnly: options.plainTextOnly ?? false,
      maxRounds: options.maxRounds,
      startingStrategy: options.startingStrategy,
      openingStatement: options.openingStatement,
      groundRules: options.groundRules,
      // Word limit defaults
      defaultWordLimit: options.defaultWordLimit ?? 150,
      extendedSpeakingChance: options.extendedSpeakingChance ?? 20,
      extendedMultiplier: options.extendedMultiplier ?? 3,
      // Conversation depth (defaults to 'standard' if not set)
      conversationDepth: options.conversationDepth,
      // Target language for agent responses
      targetLanguage: options.targetLanguage,
      // MCP settings
      mcpServerIds: options.mcpServerIds,
      mcpToolApprovalMode: options.mcpToolApprovalMode ?? 'auto',
    });

    // Create agents
    await AgentFactory.createTeam(
      conversation.id,
      agentConfigs,
      options.includeSecretary ?? true
    );

    eventBus.emit('conversation:created', conversation);

    // Create and initialize engine
    const engine = new ConversationEngine(conversation);
    await engine.initialize();

    // If strategy defines first speaker selection, apply it
    if (options.startingStrategy) {
      await engine.applyStrategyFirstSpeaker(subject);
    }

    // Create opening message if opening statement is provided
    if (options.openingStatement) {
      await engine.createOpeningMessage(options.openingStatement);
    }

    return engine;
  }

  /**
   * Apply strategy-based first speaker selection
   */
  private async applyStrategyFirstSpeaker(subject: string): Promise<void> {
    if (!this.conversation.startingStrategy) return;

    const strategy = getStrategyById(this.conversation.startingStrategy);
    if (!strategy) return;

    // Get non-secretary agents for first speaker selection
    const participantAgents = this.agents
      .filter(a => !a.entityData.isSecretary)
      .map(a => ({
        id: a.id,
        expertise: a.entityData.expertise,
        order: a.entityData.order,
      }));

    if (participantAgents.length === 0) return;

    // Select first speaker based on strategy
    const firstSpeakerId = selectFirstSpeaker(
      strategy.firstSpeakerMethod,
      participantAgents,
      subject
    );

    if (firstSpeakerId && this.turnManager) {
      // Queue the selected agent to speak first
      this.turnManager.queueAgent(firstSpeakerId, `Strategy: ${strategy.name}`);
      console.log(`[Engine] First speaker set by strategy: ${firstSpeakerId}`);
    }
  }

  /**
   * Create the opening system message for the conversation
   */
  private async createOpeningMessage(openingStatement: string): Promise<void> {
    const message = await messageStorage.create({
      conversationId: this.conversation.id,
      content: openingStatement,
      round: 0,
      type: 'opening',
    });

    eventBus.emit('message:created', message);
    console.log('[Engine] Opening message created');
  }

  /**
   * Load an existing conversation
   * If the conversation was interrupted (status === 'running' but no active engine),
   * it will be recovered to 'paused' state so it can be resumed.
   * 
   * Multi-tab safety: If another tab holds the lock, we skip recovery
   * and return the engine in read-only mode (conversation status unchanged).
   */
  static async load(conversationId: string): Promise<ConversationEngine | null> {
    const conversation = await conversationStorage.getById(conversationId);
    if (!conversation) {
      return null;
    }

    // Recovery: If conversation status is 'running' but we're loading fresh,
    // it means the page was refreshed mid-run. Recover to 'paused' state.
    // UNLESS another tab holds the lock (multi-tab safety).
    const activeIds = ConversationEngine.getActiveConversationSet();
    if (conversation.status === 'running' && !activeIds.has(conversationId)) {
      // Check if another tab is running this conversation
      const lockedByOther = await isLockedByOtherTab(conversationId);
      
      if (lockedByOther) {
        // Another tab is running this conversation - don't recover, just load
        console.log(`[Engine] Conversation ${conversationId} is running in another tab, loading as read-only`);
      } else {
        // No other tab holds the lock - this was a refresh/crash, recover to paused
        console.log(`[Engine] Recovering interrupted conversation ${conversationId}`);
        
        // Mark any running turns as failed (they will be retried on resume)
        const failedCount = await turnStorage.markRunningAsFailed(
          conversationId,
          'Interrupted by page refresh'
        );
        if (failedCount > 0) {
          console.log(`[Engine] Marked ${failedCount} running turn(s) as failed for retry`);
        }
        
        // Update conversation status to paused
        await conversationStorage.update(conversationId, { status: 'paused' });
        conversation.status = 'paused';
        
        console.log(`[Engine] Conversation ${conversationId} recovered to paused state`);
      }
    }

    const engine = new ConversationEngine(conversation);
    await engine.initialize();

    return engine;
  }

  /**
   * Check if this conversation is locked by another tab
   */
  async isLockedByOtherTab(): Promise<boolean> {
    return isLockedByOtherTab(this.conversation.id);
  }
}

