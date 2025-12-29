// ============================================
// AI Brainstorm - Agent Class
// ============================================

import type { Agent as AgentEntity, Notebook, Message } from '../types';
import { agentStorage, notebookStorage, messageStorage } from '../storage/storage-manager';
import { llmRouter } from '../llm/llm-router';
import { creativityToTemperature } from '../llm/prompt-builder';
import { eventBus } from '../utils/event-bus';
import type { LLMMessage, LLMStreamChunk, LLMResponse } from '../llm/types';

export type AgentStatus = 'idle' | 'thinking' | 'speaking';

/**
 * Agent runtime instance
 * Wraps the stored agent entity with runtime capabilities
 */
export class Agent {
  private entity: AgentEntity;
  private notebook: Notebook | null = null;
  private status: AgentStatus = 'idle';
  private currentAbortController: AbortController | null = null;

  constructor(entity: AgentEntity) {
    this.entity = entity;
  }

  // ----- Getters -----

  get id(): string {
    return this.entity.id;
  }

  get conversationId(): string {
    return this.entity.conversationId;
  }

  get name(): string {
    return this.entity.name;
  }

  get role(): string {
    return this.entity.role;
  }

  get expertise(): string {
    return this.entity.expertise;
  }

  get color(): string {
    return this.entity.color;
  }

  get isSecretary(): boolean {
    return this.entity.isSecretary;
  }

  get llmProviderId(): string {
    return this.entity.llmProviderId;
  }

  get modelId(): string {
    return this.entity.modelId;
  }

  get thinkingDepth(): number {
    return this.entity.thinkingDepth;
  }

  get creativityLevel(): number {
    return this.entity.creativityLevel;
  }

  get notebookUsage(): number {
    return this.entity.notebookUsage;
  }

  get order(): number {
    return this.entity.order;
  }

  get currentStatus(): AgentStatus {
    return this.status;
  }

  get entityData(): AgentEntity {
    return { ...this.entity };
  }

  // ----- Status Management -----

  setStatus(status: AgentStatus): void {
    this.status = status;
    
    switch (status) {
      case 'thinking':
        eventBus.emit('agent:thinking', this.id);
        break;
      case 'speaking':
        eventBus.emit('agent:speaking', this.id);
        break;
      case 'idle':
        eventBus.emit('agent:idle', this.id);
        break;
    }
  }

  // ----- Notebook Management -----

  async loadNotebook(): Promise<void> {
    this.notebook = await notebookStorage.get(this.id) || null;
  }

  async getNotebook(): Promise<Notebook | null> {
    if (!this.notebook) {
      await this.loadNotebook();
    }
    return this.notebook;
  }

  async updateNotes(notes: string): Promise<void> {
    this.notebook = await notebookStorage.update(this.id, notes);
  }

  async appendNote(note: string): Promise<void> {
    this.notebook = await notebookStorage.append(this.id, note);
  }

  async clearNotes(): Promise<void> {
    await notebookStorage.clear(this.id);
    this.notebook = null;
  }

  // ----- Response Generation -----

  /**
   * Generate a response (non-streaming)
   */
  async generateResponse(messages: LLMMessage[]): Promise<LLMResponse> {
    this.setStatus('thinking');
    this.currentAbortController = new AbortController();

    try {
      const response = await llmRouter.complete(this.llmProviderId, {
        model: this.modelId,
        messages,
        temperature: creativityToTemperature(this.creativityLevel),
        signal: this.currentAbortController.signal,
      });

      this.setStatus('idle');
      return response;
    } catch (error) {
      this.setStatus('idle');
      throw error;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Generate a streaming response
   */
  async generateStreamingResponse(
    messages: LLMMessage[],
    onChunk: (content: string) => void
  ): Promise<LLMResponse> {
    this.setStatus('thinking');
    this.currentAbortController = new AbortController();

    try {
      // Emit first chunk to indicate speaking
      let firstChunk = true;

      const response = await llmRouter.stream(
        this.llmProviderId,
        {
          model: this.modelId,
          messages,
          temperature: creativityToTemperature(this.creativityLevel),
          signal: this.currentAbortController.signal,
        },
        (chunk: LLMStreamChunk) => {
          if (firstChunk && chunk.content) {
            this.setStatus('speaking');
            firstChunk = false;
          }

          if (chunk.content) {
            onChunk(chunk.content);
            eventBus.emit('stream:chunk', { agentId: this.id, content: chunk.content });
          }

          if (chunk.done) {
            eventBus.emit('stream:complete', { agentId: this.id });
          }
        }
      );

      this.setStatus('idle');
      return response;
    } catch (error) {
      this.setStatus('idle');
      throw error;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Abort any ongoing generation
   */
  abort(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    llmRouter.abort(this.llmProviderId);
    this.setStatus('idle');
  }

  // ----- Persistence -----

  /**
   * Update agent entity in storage
   */
  async update(data: Partial<AgentEntity>): Promise<void> {
    const updated = await agentStorage.update(this.id, data);
    if (updated) {
      this.entity = updated;
    }
  }

  /**
   * Get messages sent by this agent
   */
  async getMessages(): Promise<Message[]> {
    const allMessages = await messageStorage.getByConversation(this.conversationId);
    return allMessages.filter(m => m.agentId === this.id);
  }

  // ----- Static Methods -----

  /**
   * Load an agent from storage
   */
  static async load(id: string): Promise<Agent | null> {
    const entity = await agentStorage.getById(id);
    if (!entity) return null;

    const agent = new Agent(entity);
    await agent.loadNotebook();
    return agent;
  }

  /**
   * Load all agents for a conversation
   */
  static async loadForConversation(conversationId: string): Promise<Agent[]> {
    const entities = await agentStorage.getByConversation(conversationId);
    const agents = entities.map(e => new Agent(e));
    
    // Load notebooks in parallel
    await Promise.all(agents.map(a => a.loadNotebook()));
    
    return agents;
  }
}

