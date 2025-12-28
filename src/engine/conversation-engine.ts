// ============================================
// AI Brainstorm - Conversation Engine
// Version: 2.1.0
// ============================================

import { Agent } from '../agents/agent';
import { AgentFactory } from '../agents/agent-factory';
import { SecretaryAgent } from '../agents/secretary';
import { TurnManager, TurnSchedule } from './turn-manager';
import { TurnExecutor, TurnResult } from './turn-executor';
import { ResultManager } from './result-manager';
import { UserInterjectionHandler } from './user-interjection';
import { ConversationStateMachine } from './state-machine';
import { conversationStorage, turnStorage, messageStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { sleep } from '../utils/helpers';
import type { Conversation, Turn, Message, ConversationStatus, ConversationMode } from '../types';

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

    await this.updateConversationStatus('running');
    eventBus.emit('conversation:started', this.conversation.id);

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
   * Reset the conversation
   */
  async reset(): Promise<void> {
    this.turnExecutor?.abort();
    this.stateMachine.reset();

    // Clear turns and messages
    const turns = await turnStorage.getByConversation(this.conversation.id);
    for (const turn of turns) {
      await turnStorage.updateState(turn.id, 'cancelled');
    }

    // Reset conversation state
    await conversationStorage.update(this.conversation.id, {
      status: 'idle',
      currentRound: 0,
    });

    this.conversation.status = 'idle';
    this.conversation.currentRound = 0;

    // Reset managers
    await this.interjectionHandler.clear();
    await this.resultManager.clear();
    this.turnManager?.setCurrentRound(0);

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
    
    // Update round in database
    this.conversation.currentRound++;
    await conversationStorage.update(this.conversation.id, {
      currentRound: this.conversation.currentRound,
    });

    // Update turn manager
    this.turnManager?.advanceRound();
    this.interjectionHandler.setCurrentRound(this.conversation.currentRound);

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
    } = {}
  ): Promise<ConversationEngine> {
    // Create conversation
    const conversation = await conversationStorage.create({
      subject,
      goal,
      mode,
      speedMs: options.speedMs ?? 2000,
      maxContextTokens: options.maxContextTokens ?? 8000,
      plainTextOnly: options.plainTextOnly ?? false,
      maxRounds: options.maxRounds,
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

    return engine;
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

