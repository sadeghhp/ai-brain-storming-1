// ============================================
// AI Brainstorm - Turn Executor
// Version: 1.1.0
// ============================================

import { Agent } from '../agents/agent';
import { NotebookManager } from '../agents/notebook';
import { turnStorage, messageStorage, agentStorage, interjectionStorage, notebookStorage } from '../storage/storage-manager';
import { buildConversationMessages, creativityToTemperature } from '../llm/prompt-builder';
import { llmRouter } from '../llm/llm-router';
import { eventBus } from '../utils/event-bus';
// ContextStrategy is used for context management in context-builder
import type { Turn, Message, Conversation } from '../types';
import type { LLMMessage, LLMResponse } from '../llm/types';

export interface TurnResult {
  success: boolean;
  message?: Message;
  error?: string;
  tokensUsed: number;
}

/**
 * Turn Executor - Executes a single agent turn with AbortController support
 */
export class TurnExecutor {
  private conversation: Conversation;
  private abortController: AbortController | null = null;

  constructor(conversation: Conversation) {
    this.conversation = conversation;
  }

  /**
   * Execute a turn for an agent
   */
  async execute(
    turn: Turn,
    agent: Agent,
    onStreamChunk?: (content: string) => void
  ): Promise<TurnResult> {
    // Create abort controller
    this.abortController = new AbortController();

    // #region debug log H2
    (() => { const payload = {location:'src/engine/turn-executor.ts:execute',message:'TurnExecutor.execute() enter',data:{conversationId:this.conversation.id,turnId:turn.id,agentId:agent.id,providerId:agent.llmProviderId,model:agent.modelId,streaming:Boolean(onStreamChunk)},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
    // #endregion

    try {
      // Mark turn as running
      await turnStorage.updateState(turn.id, 'running');
      eventBus.emit('turn:started', turn);

      // Build context
      const messages = await this.buildContext(agent);

      // Store prompt for debugging
      await turnStorage.updateState(turn.id, 'running', {
        promptSent: JSON.stringify(messages),
      });

      // Execute LLM request
      let response: LLMResponse;
      let fullContent = '';
      let chunkCount = 0;

      if (onStreamChunk) {
        // Streaming mode
        response = await llmRouter.stream(
          agent.llmProviderId,
          {
            model: agent.modelId,
            messages,
            temperature: creativityToTemperature(agent.creativityLevel),
            signal: this.abortController.signal,
          },
          (chunk) => {
            fullContent += chunk.content;
            chunkCount++;
            onStreamChunk(chunk.content);
          }
        );
      } else {
        // Non-streaming mode
        response = await llmRouter.complete(agent.llmProviderId, {
          model: agent.modelId,
          messages,
          temperature: creativityToTemperature(agent.creativityLevel),
          signal: this.abortController.signal,
        });
        fullContent = response.content;
      }

      // #region debug log H2
      (() => { const payload = {location:'src/engine/turn-executor.ts:execute',message:'LLM request completed',data:{conversationId:this.conversation.id,turnId:turn.id,agentId:agent.id,streaming:Boolean(onStreamChunk),chunkCount,fullContentLen:fullContent.length,finishReason:response.finishReason ?? null,tokensUsed:response.tokensUsed ?? 0},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
      // #endregion

      // Guard against empty responses
      if (!fullContent.trim()) {
        throw new Error('Empty response from LLM provider');
      }

      // Create message
      const message = await messageStorage.create({
        turnId: turn.id,
        conversationId: this.conversation.id,
        agentId: agent.id,
        content: fullContent,
        round: turn.round,
        type: 'response',
      });

      // Update notebook if agent uses it
      if (agent.notebookUsage > 0) {
        await this.updateNotebook(agent, fullContent);
      }

      // Mark turn as completed
      await turnStorage.updateState(turn.id, 'completed', {
        tokensUsed: response.tokensUsed,
      });

      eventBus.emit('turn:completed', { ...turn, state: 'completed' });
      eventBus.emit('message:created', message);

      return {
        success: true,
        message,
        tokensUsed: response.tokensUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // #region debug log H2
      (() => { const payload = {location:'src/engine/turn-executor.ts:execute',message:'TurnExecutor.execute() error',data:{conversationId:this.conversation.id,turnId:turn.id,agentId:agent.id,error:errorMessage,isAbortError:(error instanceof DOMException && error.name==='AbortError')},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H2'}; try{navigator.sendBeacon?.('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',new Blob([JSON.stringify(payload)],{type:'application/json'}));}catch{} fetch('/ingest/214c24a0-baca-46e5-a480-b608d42ef09d',{method:'POST',keepalive:true,credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{}); })();
      // #endregion
      
      // Check if aborted
      if (error instanceof DOMException && error.name === 'AbortError') {
        await turnStorage.updateState(turn.id, 'cancelled', { error: 'Cancelled by user' });
        return {
          success: false,
          error: 'Turn cancelled',
          tokensUsed: 0,
        };
      }

      // Mark turn as failed
      await turnStorage.updateState(turn.id, 'failed', { error: errorMessage });
      eventBus.emit('turn:failed', { ...turn, state: 'failed', error: errorMessage });

      console.error('[TurnExecutor] Execution failed:', error);

      return {
        success: false,
        error: errorMessage,
        tokensUsed: 0,
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Build context messages for the agent
   */
  private async buildContext(agent: Agent): Promise<LLMMessage[]> {
    // Get all agents
    const allAgents = await agentStorage.getByConversation(this.conversation.id);
    
    // Get messages
    const messages = await messageStorage.getByConversation(this.conversation.id);
    
    // Get unprocessed interjections
    const interjections = await interjectionStorage.getUnprocessed(this.conversation.id);
    
    // Get notebook
    const notebook = await notebookStorage.get(agent.id);

    // Determine if this is the first turn (no agent responses yet)
    const agentResponses = messages.filter(m => m.type === 'response');
    const isFirstTurn = agentResponses.length === 0;

    // Build context using the prompt builder
    const context = buildConversationMessages({
      conversation: this.conversation,
      agent: agent.entityData,
      allAgents,
      messages,
      notebook: notebook || undefined,
      interjections,
      isFirstTurn,
    });

    return context;
  }

  /**
   * Update agent's notebook with key points from the response
   */
  private async updateNotebook(agent: Agent, content: string): Promise<void> {
    // Only extract notes if content is substantial
    if (content.length < 100) return;

    try {
      const notebookManager = NotebookManager.fromAgent(agent.entityData);
      await notebookManager.autoExtractNotes(content);
    } catch (error) {
      console.warn('[TurnExecutor] Failed to update notebook:', error);
      // Don't fail the turn if notebook update fails
    }
  }

  /**
   * Abort the current execution
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if currently executing
   */
  isExecuting(): boolean {
    return this.abortController !== null;
  }

  /**
   * Retry a failed turn
   */
  async retry(turnId: string): Promise<TurnResult> {
    const turn = await turnStorage.getById(turnId);
    if (!turn || turn.state !== 'failed') {
      return {
        success: false,
        error: 'Turn not found or not in failed state',
        tokensUsed: 0,
      };
    }

    const agentEntity = await agentStorage.getById(turn.agentId);
    if (!agentEntity) {
      return {
        success: false,
        error: 'Agent not found',
        tokensUsed: 0,
      };
    }

    const agent = new Agent(agentEntity);
    return this.execute(turn, agent);
  }
}

