// ============================================
// AI Brainstorm - Conversation Engine
// Version: 2.4.0
// ============================================

import { Agent } from '../agents/agent';
import { AgentFactory } from '../agents/agent-factory';
import { SecretaryAgent } from '../agents/secretary';
import { TurnManager, TurnSchedule } from './turn-manager';
import { TurnExecutor, TurnResult } from './turn-executor';
import { ResultManager } from './result-manager';
import { UserInterjectionHandler } from './user-interjection';
import { ConversationStateMachine } from './state-machine';
import { conversationStorage, turnStorage, messageStorage, notebookStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { sleep } from '../utils/helpers';
import { selectFirstSpeaker, getStrategyById } from '../strategies/starting-strategies';
import type { Conversation, Turn, Message, ConversationStatus, ConversationMode, StartingStrategyId, TurnQueueState, TurnQueueItem } from '../types';

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
    if (!this.stateMachine.transition('running')) {
      console.warn('[Engine] Cannot start - invalid state');
      return;
    }

    // #region debug log H0
    (() => { const payload = {location:'src/engine/conversation-engine.ts:start',message:'start() called',data:{conversationId:this.conversation.id,status:this.stateMachine.currentStatus,currentRound:this.conversation.currentRound,speedMs:this.conversation.speedMs,maxRounds:this.conversation.maxRounds ?? null},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H0'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
    // #endregion

    // Reset tracking for new run
    this.completedAgentsInRound.clear();
    this.currentTurnAgentId = null;

    await this.updateConversationStatus('running');
    eventBus.emit('conversation:started', this.conversation.id);

    // Emit initial turn queue state
    this.emitTurnQueueState();

    await this.runLoop();
  }

  /**
   * Pause the conversation
   */
  async pause(): Promise<void> {
    if (!this.stateMachine.transition('paused')) {
      return;
    }

    this.turnExecutor?.abort();
    await this.updateConversationStatus('paused');
    eventBus.emit('conversation:paused', this.conversation.id);
  }

  /**
   * Resume the conversation
   */
  async resume(): Promise<void> {
    if (!this.stateMachine.transition('running')) {
      return;
    }

    await this.updateConversationStatus('running');
    eventBus.emit('conversation:resumed', this.conversation.id);

    await this.runLoop();
  }

  /**
   * Stop and complete the conversation
   */
  async stop(): Promise<void> {
    this.turnExecutor?.abort();
    
    if (this.stateMachine.transition('completed')) {
      await this.updateConversationStatus('completed');
      
      // Generate final result draft
      await this.resultManager.generateFinalDraft(this.conversation);
      
      eventBus.emit('conversation:stopped', this.conversation.id);
    }
  }

  /**
   * Reset the conversation - clears all messages, turns, notebooks, and result drafts
   * to allow re-running the conversation from the beginning
   */
  async reset(): Promise<void> {
    this.turnExecutor?.abort();
    this.stateMachine.reset();

    // Delete all turns (not just mark as cancelled)
    await turnStorage.deleteByConversation(this.conversation.id);

    // Delete all messages
    await messageStorage.deleteByConversation(this.conversation.id);

    // Clear all agent notebooks
    await notebookStorage.clearAllForConversation(this.conversation.id);

    // Reset conversation state
    await conversationStorage.update(this.conversation.id, {
      status: 'idle',
      currentRound: 0,
    });

    this.conversation.status = 'idle';
    this.conversation.currentRound = 0;

    // Reset tracking state
    this.completedAgentsInRound.clear();
    this.currentTurnAgentId = null;
    this.streamingContent.clear();

    // Reset managers
    await this.interjectionHandler.clear();
    await this.resultManager.clear();
    this.turnManager?.setCurrentRound(0);

    console.log(`[Engine] Conversation ${this.conversation.id} reset - all data cleared`);
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
    const maxRounds = this.conversation.maxRounds || Infinity;

    while (this.stateMachine.isRunning()) {
      // Check round limit
      if (this.conversation.currentRound >= maxRounds) {
        await this.stop();
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
    // #region debug log H1
    (() => { const payload = {location:'src/engine/conversation-engine.ts:executeTurn',message:'executeTurn() enter',data:{conversationId:this.conversation.id,round:schedule.round,sequence:schedule.sequence,agentId:schedule.agentId,engineRound:this.conversation.currentRound,completedAgentsInRoundSize:this.completedAgentsInRound.size},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
    // #endregion

    // Check idempotency - skip if already completed
    const isCompleted = await this.turnManager?.isTurnCompleted(schedule.round, schedule.sequence);
    if (isCompleted) {
      // #region debug log H1
      (() => { const payload = {location:'src/engine/conversation-engine.ts:executeTurn',message:'executeTurn() skipping completed turn',data:{conversationId:this.conversation.id,round:schedule.round,sequence:schedule.sequence,agentId:schedule.agentId},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
      // #endregion
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

    // #region debug log H2
    (() => { const payload = {location:'src/engine/conversation-engine.ts:executeTurn',message:'executeTurn() got TurnExecutor result',data:{conversationId:this.conversation.id,round:schedule.round,sequence:schedule.sequence,agentId:agent.id,success:result.success,tokensUsed:result.tokensUsed,messageLen:result.message?.content?.length ?? 0},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
    // #endregion

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
            content: `**Round ${round} Summary:**\n\n${roundSummary}`,
            round: round,
            type: 'summary',
          });
          
          eventBus.emit('message:created', summaryMessage);
          console.log(`[Engine] Secretary generated round ${round} summary`);
        }
      } catch (error) {
        console.warn('[Engine] Secretary round summary failed:', error);
      }
    }

    // Update result draft incrementally
    await this.resultManager.incrementalUpdate(round);

    // Mark interjections as processed
    await this.interjectionHandler.markAllProcessed();

    this.options.onRoundComplete?.(round);
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
  getTurnQueueState(): TurnQueueState | null {
    const nonSecretaryAgents = this.agents.filter(a => !a.entityData.isSecretary);
    if (nonSecretaryAgents.length === 0) return null;

    const queue: TurnQueueItem[] = nonSecretaryAgents.map((agent, index) => ({
      agentId: agent.id,
      agentName: agent.entityData.name,
      agentColor: agent.entityData.color,
      status: 'waiting' as const,
      order: index,
    }));

    return {
      conversationId: this.conversation.id,
      round: this.conversation.currentRound,
      currentIndex: 0,
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
   */
  static async load(conversationId: string): Promise<ConversationEngine | null> {
    const conversation = await conversationStorage.getById(conversationId);
    if (!conversation) {
      return null;
    }

    const engine = new ConversationEngine(conversation);
    await engine.initialize();

    return engine;
  }
}

