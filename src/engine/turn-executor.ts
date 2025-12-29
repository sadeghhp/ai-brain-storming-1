// ============================================
// AI Brainstorm - Turn Executor
// ============================================

import { Agent } from '../agents/agent';
import { NotebookManager } from '../agents/notebook';
import { turnStorage, messageStorage, agentStorage, interjectionStorage, notebookStorage, resultDraftStorage, distilledMemoryStorage, contextSnapshotStorage, mcpServerStorage, mcpToolCallStorage } from '../storage/storage-manager';
import { creativityToTemperature } from '../llm/prompt-builder';
import { llmRouter } from '../llm/llm-router';
import { mcpRouter, buildToolDescriptions, parseToolCalls, formatToolResult } from '../mcp';
import { eventBus } from '../utils/event-bus';
import { ContextBuilder, ContextComponents } from './context-builder';
import type { Turn, Message, Conversation, DistilledMemory, CreateContextSnapshot, MCPServer, MCPToolCall } from '../types';
import type { LLMMessage, LLMResponse } from '../llm/types';

export interface TurnResult {
  success: boolean;
  message?: Message;
  error?: string;
  tokensUsed: number;
  toolCallsExecuted?: number;
}

/**
 * Turn Executor - Executes a single agent turn with AbortController support
 */
export class TurnExecutor {
  private conversation: Conversation;
  private abortController: AbortController | null = null;
  private mcpServers: MCPServer[] = [];
  private mcpToolsLoaded: boolean = false;

  constructor(conversation: Conversation) {
    this.conversation = conversation;
  }

  /**
   * Load MCP servers configured for this conversation
   */
  private async loadMCPTools(): Promise<void> {
    if (this.mcpToolsLoaded) return;
    
    const serverIds = this.conversation.mcpServerIds;
    if (!serverIds || serverIds.length === 0) {
      this.mcpServers = [];
      this.mcpToolsLoaded = true;
      return;
    }

    this.mcpServers = await mcpServerStorage.getByIds(serverIds);
    this.mcpToolsLoaded = true;
  }

  /**
   * Get MCP tool descriptions for the context
   */
  private getMCPToolDescriptions(): string {
    if (this.mcpServers.length === 0) return '';

    const toolsWithServers = this.mcpServers.flatMap(server => 
      server.tools.map(tool => ({
        serverId: server.id,
        serverName: server.name,
        tool,
      }))
    );

    if (toolsWithServers.length === 0) return '';

    return buildToolDescriptions(toolsWithServers);
  }

  /**
   * Process tool calls found in agent response
   */
  private async processToolCalls(
    content: string,
    turn: Turn,
    agent: Agent
  ): Promise<{ toolResults: string; toolCallsExecuted: number }> {
    const toolCalls = parseToolCalls(content);
    if (toolCalls.length === 0) {
      return { toolResults: '', toolCallsExecuted: 0 };
    }

    const results: string[] = [];
    let executedCount = 0;
    const approvalMode = this.conversation.mcpToolApprovalMode || 'auto';

    for (const call of toolCalls) {
      // Find which server provides this tool
      const serverInfo = this.mcpServers.find(s => 
        s.tools.some(t => t.name === call.tool)
      );

      if (!serverInfo) {
        results.push(`**Tool Error: ${call.tool}**\nTool not found in any configured MCP server.`);
        continue;
      }

      // Create tool call record
      const toolCallRecord = await mcpToolCallStorage.create({
        conversationId: this.conversation.id,
        turnId: turn.id,
        agentId: agent.id,
        serverId: serverInfo.id,
        toolName: call.tool,
        arguments: call.arguments,
        status: approvalMode === 'auto' ? 'approved' : 'pending',
      });

      if (approvalMode === 'approval') {
        // LIMITATION: Async approval flow not yet implemented.
        // In approval mode, tool calls are recorded as "pending" and the conversation
        // continues without the tool result. Users can view pending tools in the UI.
        // 
        // Future enhancement: Implement pause-and-wait mechanism where the turn
        // executor pauses, waits for user approval via eventBus, then resumes.
        // This would require:
        // 1. A Promise-based wait mechanism with timeout
        // 2. UI to approve/reject pending tool calls
        // 3. Resume logic to execute approved tools and inject results
        eventBus.emit('mcp:tool-call-pending', toolCallRecord);
        results.push(`**⏳ Tool Pending Approval: ${call.tool}**\n` +
          `Arguments: ${JSON.stringify(call.arguments, null, 2)}\n` +
          `_This tool call requires manual approval before execution. ` +
          `The conversation will continue without the tool result._`);
        continue;
      }

      // Execute the tool (auto mode)
      try {
        // Check if server is connected
        if (!mcpRouter.isConnected(serverInfo.id)) {
          // Try to connect
          await mcpRouter.connect(serverInfo.id);
        }

        const result = await mcpRouter.callTool(serverInfo.id, call.tool, call.arguments);
        
        // Update tool call record
        const resultText = result.content.map(c => c.text || '').join('\n');
        await mcpToolCallStorage.markExecuted(toolCallRecord.id, resultText);
        
        results.push(formatToolResult(call.tool, result));
        executedCount++;

        eventBus.emit('mcp:tool-call-executed', {
          ...toolCallRecord,
          status: 'executed',
          result: resultText,
        } as MCPToolCall);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await mcpToolCallStorage.markFailed(toolCallRecord.id, errorMessage);
        results.push(`**Tool Error: ${call.tool}**\n${errorMessage}`);

        eventBus.emit('mcp:tool-call-failed', {
          ...toolCallRecord,
          status: 'failed',
          error: errorMessage,
        } as MCPToolCall);
      }
    }

    return { 
      toolResults: results.join('\n\n'), 
      toolCallsExecuted: executedCount 
    };
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

    try {
      // Mark turn as running
      await turnStorage.updateState(turn.id, 'running');
      eventBus.emit('turn:started', turn);

      // Load MCP tools if configured
      await this.loadMCPTools();
      const mcpToolDescriptions = this.getMCPToolDescriptions();

      // Build context and get context components for snapshot
      const { messages, contextComponents, distilledMemory, notebookUsed } = await this.buildContextWithSnapshot(agent);

      // Inject MCP tool descriptions into the system prompt if available
      if (mcpToolDescriptions && messages.length > 0 && messages[0].role === 'system') {
        messages[0].content += '\n\n' + mcpToolDescriptions;
      }

      // Save context snapshot for this turn (for distillation viewer)
      await this.saveContextSnapshot(turn.id, contextComponents, distilledMemory, notebookUsed);

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

      // Guard against empty responses
      if (!fullContent.trim()) {
        throw new Error('Empty response from LLM provider');
      }

      // Process any MCP tool calls in the response
      let finalContent = fullContent;
      let toolCallsExecuted = 0;

      if (this.mcpServers.length > 0) {
        const { toolResults, toolCallsExecuted: executed } = await this.processToolCalls(
          fullContent,
          turn,
          agent
        );
        toolCallsExecuted = executed;

        // Append tool results to the message if any were executed
        if (toolResults) {
          finalContent += '\n\n---\n\n' + toolResults;
        }
      }

      // Create message
      const message = await messageStorage.create({
        turnId: turn.id,
        conversationId: this.conversation.id,
        agentId: agent.id,
        content: finalContent,
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
        toolCallsExecuted,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
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
   * Build context messages for the agent using ContextBuilder
   * Returns both messages and context components for snapshot saving
   */
  private async buildContextWithSnapshot(agent: Agent): Promise<{
    messages: LLMMessage[];
    contextComponents: ContextComponents;
    distilledMemory: DistilledMemory | undefined;
    notebookUsed: boolean;
  }> {
    // Get all agents
    const allAgents = await agentStorage.getByConversation(this.conversation.id);
    
    // Get messages
    const messages = await messageStorage.getByConversation(this.conversation.id);
    
    // Get unprocessed interjections
    const interjections = await interjectionStorage.getUnprocessed(this.conversation.id);
    
    // Get notebook
    const notebook = await notebookStorage.get(agent.id);

    // Get secretary summary from result draft (if available)
    const resultDraft = await resultDraftStorage.get(this.conversation.id);
    const secretarySummary = resultDraft?.summary || undefined;

    // Get distilled memory for context compression
    const distilledMemory = await distilledMemoryStorage.get(this.conversation.id);

    // Determine if this is the first turn (no agent responses yet)
    const agentResponses = messages.filter(m => m.type === 'response');
    const isFirstTurn = agentResponses.length === 0;

    // Determine if we're in the finishing phase
    const isFinishing = this.conversation.status === 'finishing';

    // Use ContextBuilder for better token management and message prioritization
    const contextBuilder = new ContextBuilder(this.conversation);
    const contextComponents = contextBuilder.build(
      agent.entityData,
      allAgents,
      messages,
      interjections,
      notebook || null,
      secretarySummary,
      {
        isFirstTurn,
        currentRound: this.conversation.currentRound,
        distilledMemory: distilledMemory || null,
        isFinishing,
      }
    );

    // Log if distilled memory was used
    if (contextComponents.distilledMemoryUsed) {
      console.log(`[TurnExecutor] Using distilled memory (${distilledMemory?.totalMessagesDistilled || 0} messages distilled)`);
    }

    return {
      messages: contextComponents.promptMessages,
      contextComponents,
      distilledMemory,
      notebookUsed: !!notebook?.notes,
    };
  }

  /**
   * Save a context snapshot for the turn (for distillation viewer)
   */
  private async saveContextSnapshot(
    turnId: string,
    contextComponents: ContextComponents,
    distilledMemory: DistilledMemory | undefined,
    notebookUsed: boolean
  ): Promise<void> {
    try {
      // Only store distilled-memory fields if they were actually included in the prompt.
      const distilledMemoryUsed = contextComponents.distilledMemoryUsed;
      const distilled = distilledMemoryUsed ? distilledMemory : undefined;

      const snapshotData: CreateContextSnapshot = {
        turnId,
        conversationId: this.conversation.id,
        distilledMemoryUsed,
        distilledSummary: distilled?.distilledSummary || undefined,
        pinnedFacts: distilled?.pinnedFacts || undefined,
        currentStance: distilled?.currentStance || undefined,
        keyDecisions: distilled?.keyDecisions || undefined,
        openQuestions: distilled?.openQuestions || undefined,
        messagesIncludedCount: contextComponents.messages.length,
        notebookUsed,
      };
      
      await contextSnapshotStorage.create(snapshotData);
    } catch (error) {
      // Don't fail the turn if snapshot save fails
      console.warn('[TurnExecutor] Failed to save context snapshot:', error);
    }
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

