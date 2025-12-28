// ============================================
// AI Brainstorm - Storage Manager
// Version: 2.0.0
// ============================================

import { v4 as uuidv4 } from 'uuid';
import { db, generateTurnId } from './db';
import type {
  Conversation,
  CreateConversation,
  UpdateConversation,
  Agent,
  CreateAgent,
  UpdateAgent,
  Message,
  CreateMessage,
  Turn,
  TurnState,
  Notebook,
  ResultDraft,
  AgentPreset,
  CreateAgentPreset,
  UpdateAgentPreset,
  LLMProvider,
  CreateLLMProvider,
  UpdateLLMProvider,
  ProviderModel,
  CreateProviderModel,
  UpdateProviderModel,
  ApiFormat,
  UserInterjection,
  UserReaction,
  AppSettings,
  PaginatedResult,
} from '../types';

// ============================================
// Conversations
// ============================================

export const conversationStorage = {
  async create(data: CreateConversation): Promise<Conversation> {
    const now = Date.now();
    const conversation: Conversation = {
      ...data,
      id: uuidv4(),
      status: 'idle',
      currentRound: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.conversations.put(conversation);
    return conversation;
  },

  async getById(id: string): Promise<Conversation | undefined> {
    return db.conversations.get(id);
  },

  async getAll(): Promise<Conversation[]> {
    return db.conversations.orderBy('updatedAt').reverse().toArray();
  },

  async update(id: string, data: UpdateConversation): Promise<Conversation | undefined> {
    const existing = await db.conversations.get(id);
    if (!existing) return undefined;

    const updated: Conversation = {
      ...existing,
      ...data,
      updatedAt: Date.now(),
    };
    await db.conversations.put(updated);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.conversations, db.agents, db.turns, db.messages, db.notebooks, db.resultDrafts, db.userInterjections], async () => {
      // Delete all related data
      const agents = await db.agents.where('conversationId').equals(id).toArray();
      for (const agent of agents) {
        await db.notebooks.delete(agent.id);
      }
      await db.agents.where('conversationId').equals(id).delete();
      await db.turns.where('conversationId').equals(id).delete();
      await db.messages.where('conversationId').equals(id).delete();
      await db.resultDrafts.delete(id);
      await db.userInterjections.where('conversationId').equals(id).delete();
      await db.conversations.delete(id);
    });
  },

  async getPaginated(page: number, pageSize: number): Promise<PaginatedResult<Conversation>> {
    const total = await db.conversations.count();
    const items = await db.conversations
      .orderBy('updatedAt')
      .reverse()
      .offset(page * pageSize)
      .limit(pageSize)
      .toArray();

    return {
      items,
      total,
      page,
      pageSize,
      hasMore: (page + 1) * pageSize < total,
    };
  },
};

// ============================================
// Agents
// ============================================

export const agentStorage = {
  async create(data: CreateAgent): Promise<Agent> {
    const agent: Agent = {
      ...data,
      id: uuidv4(),
    };
    await db.agents.put(agent);

    // Create empty notebook
    await db.notebooks.put({
      agentId: agent.id,
      notes: '',
      updatedAt: Date.now(),
    });

    return agent;
  },

  async getById(id: string): Promise<Agent | undefined> {
    return db.agents.get(id);
  },

  async getByConversation(conversationId: string): Promise<Agent[]> {
    return db.agents.where('conversationId').equals(conversationId).sortBy('order');
  },

  async getSecretary(conversationId: string): Promise<Agent | undefined> {
    return db.agents.where({ conversationId, isSecretary: 1 }).first();
  },

  async update(id: string, data: UpdateAgent): Promise<Agent | undefined> {
    const existing = await db.agents.get(id);
    if (!existing) return undefined;

    const updated: Agent = { ...existing, ...data };
    await db.agents.put(updated);
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.agents, db.notebooks, db.turns, db.messages], async () => {
      await db.notebooks.delete(id);
      await db.turns.where('agentId').equals(id).delete();
      await db.messages.where('agentId').equals(id).delete();
      await db.agents.delete(id);
    });
  },

  async reorder(conversationId: string, agentIds: string[]): Promise<Agent[]> {
    const agents = await db.agents.where('conversationId').equals(conversationId).toArray();
    const agentMap = new Map(agents.map(a => [a.id, a]));
    
    const updatedAgents: Agent[] = [];
    for (let i = 0; i < agentIds.length; i++) {
      const agent = agentMap.get(agentIds[i]);
      if (agent) {
        const updated = { ...agent, order: i };
        await db.agents.put(updated);
        updatedAgents.push(updated);
      }
    }
    
    return updatedAgents.sort((a, b) => a.order - b.order);
  },
};

// ============================================
// Turns
// ============================================

export const turnStorage = {
  async create(conversationId: string, agentId: string, round: number, sequence: number): Promise<Turn> {
    const id = generateTurnId(conversationId, round, sequence);
    const turn: Turn = {
      id,
      conversationId,
      agentId,
      round,
      sequence,
      state: 'planned',
    };
    await db.turns.put(turn);
    return turn;
  },

  async getById(id: string): Promise<Turn | undefined> {
    return db.turns.get(id);
  },

  async getByConversation(conversationId: string): Promise<Turn[]> {
    return db.turns.where('conversationId').equals(conversationId).toArray();
  },

  async getByRound(conversationId: string, round: number): Promise<Turn[]> {
    return db.turns.where({ conversationId, round }).sortBy('sequence');
  },

  async updateState(id: string, state: TurnState, extra?: Partial<Turn>): Promise<Turn | undefined> {
    const existing = await db.turns.get(id);
    if (!existing) return undefined;

    const updated: Turn = {
      ...existing,
      ...extra,
      state,
      ...(state === 'running' ? { startedAt: Date.now() } : {}),
      ...(state === 'completed' || state === 'failed' || state === 'cancelled' ? { endedAt: Date.now() } : {}),
    };
    await db.turns.put(updated);
    return updated;
  },

  async exists(id: string): Promise<boolean> {
    const turn = await db.turns.get(id);
    return !!turn;
  },

  async isCompleted(id: string): Promise<boolean> {
    const turn = await db.turns.get(id);
    return turn?.state === 'completed';
  },

  async getLastCompletedRound(conversationId: string): Promise<number> {
    const turns = await db.turns
      .where('conversationId')
      .equals(conversationId)
      .filter(t => t.state === 'completed')
      .toArray();

    if (turns.length === 0) return 0;
    return Math.max(...turns.map(t => t.round));
  },
};

// ============================================
// Messages
// ============================================

export const messageStorage = {
  async create(data: CreateMessage): Promise<Message> {
    const message: Message = {
      ...data,
      id: uuidv4(),
      weight: 0,
      createdAt: Date.now(),
    };
    await db.messages.put(message);
    return message;
  },

  async getById(id: string): Promise<Message | undefined> {
    return db.messages.get(id);
  },

  async getByConversation(conversationId: string): Promise<Message[]> {
    return db.messages.where('conversationId').equals(conversationId).sortBy('createdAt');
  },

  async getByRound(conversationId: string, round: number): Promise<Message[]> {
    return db.messages.where({ conversationId, round }).sortBy('createdAt');
  },

  async getRecent(conversationId: string, limit: number): Promise<Message[]> {
    return db.messages
      .where('conversationId')
      .equals(conversationId)
      .reverse()
      .limit(limit)
      .toArray()
      .then(messages => messages.reverse());
  },

  async updateWeight(id: string, delta: number): Promise<Message | undefined> {
    const existing = await db.messages.get(id);
    if (!existing) return undefined;

    const updated: Message = { ...existing, weight: existing.weight + delta };
    await db.messages.put(updated);

    // Store reaction
    await db.userReactions.put({
      id: uuidv4(),
      messageId: id,
      delta,
      createdAt: Date.now(),
    });

    return updated;
  },

  async getByTurn(turnId: string): Promise<Message | undefined> {
    return db.messages.where('turnId').equals(turnId).first();
  },
};

// ============================================
// Notebooks
// ============================================

export const notebookStorage = {
  async get(agentId: string): Promise<Notebook | undefined> {
    return db.notebooks.get(agentId);
  },

  async update(agentId: string, notes: string): Promise<Notebook> {
    const notebook: Notebook = {
      agentId,
      notes,
      updatedAt: Date.now(),
    };
    await db.notebooks.put(notebook);
    return notebook;
  },

  async append(agentId: string, note: string): Promise<Notebook> {
    const existing = await db.notebooks.get(agentId);
    const currentNotes = existing?.notes || '';
    const newNotes = currentNotes ? `${currentNotes}\n---\n${note}` : note;
    return this.update(agentId, newNotes);
  },

  async clear(agentId: string): Promise<void> {
    await this.update(agentId, '');
  },
};

// ============================================
// Result Drafts
// ============================================

export const resultDraftStorage = {
  async get(conversationId: string): Promise<ResultDraft | undefined> {
    return db.resultDrafts.get(conversationId);
  },

  async update(conversationId: string, data: Partial<ResultDraft>): Promise<ResultDraft> {
    const existing = await db.resultDrafts.get(conversationId);
    const draft: ResultDraft = {
      conversationId,
      // Legacy fields
      content: existing?.content || '',
      summary: existing?.summary || '',
      keyDecisions: existing?.keyDecisions || '',
      // New structured fields
      executiveSummary: existing?.executiveSummary || '',
      themes: existing?.themes || [],
      consensusAreas: existing?.consensusAreas || '',
      disagreements: existing?.disagreements || '',
      recommendations: existing?.recommendations || '',
      actionItems: existing?.actionItems || '',
      openQuestions: existing?.openQuestions || '',
      roundSummaries: existing?.roundSummaries || [],
      ...data,
      updatedAt: Date.now(),
    };
    await db.resultDrafts.put(draft);
    return draft;
  },

  async appendContent(conversationId: string, content: string): Promise<ResultDraft> {
    const existing = await db.resultDrafts.get(conversationId);
    const currentContent = existing?.content || '';
    return this.update(conversationId, {
      content: currentContent ? `${currentContent}\n\n${content}` : content,
    });
  },

  async appendRoundSummary(conversationId: string, summary: string): Promise<ResultDraft> {
    const existing = await db.resultDrafts.get(conversationId);
    const roundSummaries = existing?.roundSummaries || [];
    return this.update(conversationId, {
      roundSummaries: [...roundSummaries, summary],
    });
  },

  async updateThemes(conversationId: string, themes: string[]): Promise<ResultDraft> {
    return this.update(conversationId, { themes });
  },
};

// ============================================
// Agent Presets
// ============================================

export const presetStorage = {
  async create(data: CreateAgentPreset): Promise<AgentPreset> {
    const preset: AgentPreset = {
      ...data,
      id: uuidv4(),
      isBuiltIn: false,
    };
    await db.agentPresets.put(preset);
    return preset;
  },

  async getById(id: string): Promise<AgentPreset | undefined> {
    return db.agentPresets.get(id);
  },

  async getAll(): Promise<AgentPreset[]> {
    return db.agentPresets.orderBy('name').toArray();
  },

  async getByCategory(category: string): Promise<AgentPreset[]> {
    return db.agentPresets.where('category').equals(category).sortBy('name');
  },

  async getBuiltIn(): Promise<AgentPreset[]> {
    return db.agentPresets.where('isBuiltIn').equals(1).sortBy('name');
  },

  async getCustom(): Promise<AgentPreset[]> {
    return db.agentPresets.where('isBuiltIn').equals(0).sortBy('name');
  },

  async update(id: string, data: UpdateAgentPreset): Promise<AgentPreset | undefined> {
    const existing = await db.agentPresets.get(id);
    if (!existing || existing.isBuiltIn) return undefined;

    const updated: AgentPreset = { ...existing, ...data };
    await db.agentPresets.put(updated);
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existing = await db.agentPresets.get(id);
    if (!existing || existing.isBuiltIn) return false;

    await db.agentPresets.delete(id);
    return true;
  },

  async bulkPut(presets: AgentPreset[]): Promise<void> {
    await db.agentPresets.bulkPut(presets);
  },
};

// ============================================
// LLM Providers
// ============================================

export const providerStorage = {
  async create(data: CreateLLMProvider): Promise<LLMProvider> {
    const provider: LLMProvider = {
      ...data,
      id: uuidv4(),
      isActive: false,
      models: data.models || [],
    };
    await db.llmProviders.put(provider);
    return provider;
  },

  async getById(id: string): Promise<LLMProvider | undefined> {
    return db.llmProviders.get(id);
  },

  async getAll(): Promise<LLMProvider[]> {
    return db.llmProviders.toArray();
  },

  async getActive(): Promise<LLMProvider[]> {
    return db.llmProviders.where('isActive').equals(1).toArray();
  },

  async getByFormat(apiFormat: ApiFormat): Promise<LLMProvider[]> {
    return db.llmProviders.where('apiFormat').equals(apiFormat).toArray();
  },

  async update(id: string, data: UpdateLLMProvider): Promise<LLMProvider | undefined> {
    const existing = await db.llmProviders.get(id);
    if (!existing) return undefined;

    const updated: LLMProvider = { ...existing, ...data } as LLMProvider;
    await db.llmProviders.put(updated);
    return updated;
  },

  async setActive(id: string, isActive: boolean): Promise<LLMProvider | undefined> {
    return this.update(id, { isActive, lastTestedAt: isActive ? Date.now() : undefined });
  },

  async delete(id: string): Promise<void> {
    await db.llmProviders.delete(id);
  },

  // Model management methods
  async addModel(providerId: string, model: CreateProviderModel): Promise<LLMProvider | undefined> {
    const provider = await db.llmProviders.get(providerId);
    if (!provider) return undefined;

    const newModel: ProviderModel = {
      ...model,
      isCustom: true,
    };

    // Check if model with same ID already exists
    const existingIndex = provider.models.findIndex(m => m.id === model.id);
    if (existingIndex >= 0) {
      // Update existing model
      provider.models[existingIndex] = newModel;
    } else {
      // Add new model
      provider.models.push(newModel);
    }

    await db.llmProviders.put(provider);
    return provider;
  },

  async updateModel(providerId: string, modelId: string, data: UpdateProviderModel): Promise<LLMProvider | undefined> {
    const provider = await db.llmProviders.get(providerId);
    if (!provider) return undefined;

    const modelIndex = provider.models.findIndex(m => m.id === modelId);
    if (modelIndex < 0) return undefined;

    provider.models[modelIndex] = {
      ...provider.models[modelIndex],
      ...data,
    };

    await db.llmProviders.put(provider);
    return provider;
  },

  async removeModel(providerId: string, modelId: string): Promise<LLMProvider | undefined> {
    const provider = await db.llmProviders.get(providerId);
    if (!provider) return undefined;

    provider.models = provider.models.filter(m => m.id !== modelId);
    await db.llmProviders.put(provider);
    return provider;
  },

  async setModels(providerId: string, models: ProviderModel[]): Promise<LLMProvider | undefined> {
    const provider = await db.llmProviders.get(providerId);
    if (!provider) return undefined;

    provider.models = models;
    await db.llmProviders.put(provider);
    return provider;
  },

  async getModels(providerId: string): Promise<ProviderModel[]> {
    const provider = await db.llmProviders.get(providerId);
    return provider?.models || [];
  },

  async clearAutoFetchedModels(providerId: string): Promise<LLMProvider | undefined> {
    const provider = await db.llmProviders.get(providerId);
    if (!provider) return undefined;

    // Keep only custom models
    provider.models = provider.models.filter(m => m.isCustom);
    await db.llmProviders.put(provider);
    return provider;
  },
};

// ============================================
// User Interjections
// ============================================

export const interjectionStorage = {
  async create(conversationId: string, content: string, afterRound: number): Promise<UserInterjection> {
    const interjection: UserInterjection = {
      id: uuidv4(),
      conversationId,
      content,
      afterRound,
      processed: false,
      createdAt: Date.now(),
    };
    await db.userInterjections.put(interjection);
    return interjection;
  },

  async getUnprocessed(conversationId: string): Promise<UserInterjection[]> {
    return db.userInterjections
      .where({ conversationId, processed: 0 })
      .sortBy('createdAt');
  },

  async markProcessed(id: string): Promise<void> {
    const existing = await db.userInterjections.get(id);
    if (existing) {
      await db.userInterjections.put({ ...existing, processed: true });
    }
  },

  async getByConversation(conversationId: string): Promise<UserInterjection[]> {
    return db.userInterjections.where('conversationId').equals(conversationId).sortBy('createdAt');
  },
};

// ============================================
// App Settings
// ============================================

export const settingsStorage = {
  async get(): Promise<AppSettings> {
    const settings = await db.appSettings.get('app-settings');
    if (!settings) {
      // Return defaults if not found
      return {
        id: 'app-settings',
        theme: 'dark',
        defaultSpeedMs: 2000,
        defaultMaxContextTokens: 8000,
        defaultPlainTextOnly: false,
        showKeyboardShortcuts: true,
        autoScrollMessages: true,
      };
    }
    return settings;
  },

  async update(data: Partial<AppSettings>): Promise<AppSettings> {
    const existing = await this.get();
    const updated: AppSettings = { ...existing, ...data };
    await db.appSettings.put(updated);
    return updated;
  },
};

// ============================================
// User Reactions
// ============================================

export const reactionStorage = {
  async getByMessage(messageId: string): Promise<UserReaction[]> {
    return db.userReactions.where('messageId').equals(messageId).toArray();
  },

  async getTotalWeight(messageId: string): Promise<number> {
    const reactions = await this.getByMessage(messageId);
    return reactions.reduce((sum, r) => sum + r.delta, 0);
  },
};

