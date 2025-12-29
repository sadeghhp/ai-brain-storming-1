// ============================================
// AI Brainstorm - Database Layer (Dexie/IndexedDB)
// Version: 2.3.0
// ============================================

import Dexie, { type Table } from 'dexie';
import type {
  Conversation,
  Turn,
  Agent,
  Message,
  Notebook,
  ResultDraft,
  DistilledMemory,
  ContextSnapshot,
  AgentPreset,
  LLMProvider,
  MCPServer,
  MCPToolCall,
  UserInterjection,
  UserReaction,
  AppSettings,
} from '../types';

export class BrainstormDB extends Dexie {
  conversations!: Table<Conversation, string>;
  turns!: Table<Turn, string>;
  agents!: Table<Agent, string>;
  messages!: Table<Message, string>;
  notebooks!: Table<Notebook, string>;
  resultDrafts!: Table<ResultDraft, string>;
  distilledMemories!: Table<DistilledMemory, string>;
  contextSnapshots!: Table<ContextSnapshot, string>;
  agentPresets!: Table<AgentPreset, string>;
  llmProviders!: Table<LLMProvider, string>;
  mcpServers!: Table<MCPServer, string>;
  mcpToolCalls!: Table<MCPToolCall, string>;
  userInterjections!: Table<UserInterjection, string>;
  userReactions!: Table<UserReaction, string>;
  appSettings!: Table<AppSettings, string>;

  constructor() {
    super('BrainstormDB');

    // Version 1: Original schema
    this.version(1).stores({
      // Primary key is first, then indexed fields
      conversations: 'id, status, createdAt, updatedAt',
      turns: 'id, conversationId, agentId, [conversationId+round], [conversationId+round+sequence], state',
      agents: 'id, conversationId, [conversationId+order], isSecretary',
      messages: 'id, conversationId, turnId, agentId, [conversationId+round], createdAt, type',
      notebooks: 'agentId',
      resultDrafts: 'conversationId',
      agentPresets: 'id, category, isBuiltIn, name',
      llmProviders: 'id, type, isActive',
      userInterjections: 'id, conversationId, [conversationId+afterRound], processed',
      userReactions: 'id, messageId',
      appSettings: 'id',
    });

    // Version 2: LLM Provider refactoring - apiFormat, models array
    this.version(2).stores({
      conversations: 'id, status, createdAt, updatedAt',
      turns: 'id, conversationId, agentId, [conversationId+round], [conversationId+round+sequence], state',
      agents: 'id, conversationId, [conversationId+order], isSecretary',
      messages: 'id, conversationId, turnId, agentId, [conversationId+round], createdAt, type',
      notebooks: 'agentId',
      resultDrafts: 'conversationId',
      agentPresets: 'id, category, isBuiltIn, name',
      llmProviders: 'id, apiFormat, isActive', // Changed: type -> apiFormat
      userInterjections: 'id, conversationId, [conversationId+afterRound], processed',
      userReactions: 'id, messageId',
      appSettings: 'id',
    }).upgrade(async (tx) => {
      // Migrate existing providers to new format
      const providers = await tx.table('llmProviders').toArray();
      for (const provider of providers) {
        // Convert old 'type' to new 'apiFormat'
        const oldType = (provider as any).type;
        let apiFormat: 'openai' | 'anthropic' | 'ollama' = 'openai';
        
        if (oldType === 'openrouter') {
          apiFormat = 'openai';
        } else if (oldType === 'ollama') {
          apiFormat = 'ollama';
        }
        
        // Update provider with new fields
        await tx.table('llmProviders').update(provider.id, {
          apiFormat,
          autoFetchModels: true,
          models: [],
        });
        
        // Remove old 'type' field
        await tx.table('llmProviders').update(provider.id, {
          type: undefined,
        });
      }
      console.log('[DB] Migrated LLM providers to v2 format');
    });

    // Version 3: Add compound index for userInterjections query patterns
    // (Fixes Dexie warning: compound index [conversationId+processed])
    this.version(3).stores({
      conversations: 'id, status, createdAt, updatedAt',
      turns: 'id, conversationId, agentId, [conversationId+round], [conversationId+round+sequence], state',
      agents: 'id, conversationId, [conversationId+order], isSecretary',
      messages: 'id, conversationId, turnId, agentId, [conversationId+round], createdAt, type',
      notebooks: 'agentId',
      resultDrafts: 'conversationId',
      agentPresets: 'id, category, isBuiltIn, name',
      llmProviders: 'id, apiFormat, isActive',
      userInterjections: 'id, conversationId, [conversationId+afterRound], processed, [conversationId+processed]',
      userReactions: 'id, messageId',
      appSettings: 'id',
    });

    // Version 4: Add distilledMemories table for context distillation
    this.version(4).stores({
      conversations: 'id, status, createdAt, updatedAt',
      turns: 'id, conversationId, agentId, [conversationId+round], [conversationId+round+sequence], state',
      agents: 'id, conversationId, [conversationId+order], isSecretary',
      messages: 'id, conversationId, turnId, agentId, [conversationId+round], createdAt, type',
      notebooks: 'agentId',
      resultDrafts: 'conversationId',
      distilledMemories: 'conversationId, lastDistilledRound', // Indexed by conversation and round
      agentPresets: 'id, category, isBuiltIn, name',
      llmProviders: 'id, apiFormat, isActive',
      userInterjections: 'id, conversationId, [conversationId+afterRound], processed, [conversationId+processed]',
      userReactions: 'id, messageId',
      appSettings: 'id',
    });

    // Version 5: Add contextSnapshots table for displaying distillation context per message
    this.version(5).stores({
      conversations: 'id, status, createdAt, updatedAt',
      turns: 'id, conversationId, agentId, [conversationId+round], [conversationId+round+sequence], state',
      agents: 'id, conversationId, [conversationId+order], isSecretary',
      messages: 'id, conversationId, turnId, agentId, [conversationId+round], createdAt, type',
      notebooks: 'agentId',
      resultDrafts: 'conversationId',
      distilledMemories: 'conversationId, lastDistilledRound',
      contextSnapshots: 'turnId, conversationId', // Indexed by turnId (primary) and conversationId
      agentPresets: 'id, category, isBuiltIn, name',
      llmProviders: 'id, apiFormat, isActive',
      userInterjections: 'id, conversationId, [conversationId+afterRound], processed, [conversationId+processed]',
      userReactions: 'id, messageId',
      appSettings: 'id',
    });

    // Version 6: Add MCP (Model Context Protocol) support
    // - mcpServers: Store MCP server configurations
    // - mcpToolCalls: Track tool calls made by agents
    this.version(6).stores({
      conversations: 'id, status, createdAt, updatedAt',
      turns: 'id, conversationId, agentId, [conversationId+round], [conversationId+round+sequence], state',
      agents: 'id, conversationId, [conversationId+order], isSecretary',
      messages: 'id, conversationId, turnId, agentId, [conversationId+round], createdAt, type',
      notebooks: 'agentId',
      resultDrafts: 'conversationId',
      distilledMemories: 'conversationId, lastDistilledRound',
      contextSnapshots: 'turnId, conversationId',
      agentPresets: 'id, category, isBuiltIn, name',
      llmProviders: 'id, apiFormat, isActive',
      mcpServers: 'id, transport, isActive',           // MCP server configurations
      mcpToolCalls: 'id, conversationId, turnId, [conversationId+status], status, createdAt', // Tool call tracking
      userInterjections: 'id, conversationId, [conversationId+afterRound], processed, [conversationId+processed]',
      userReactions: 'id, messageId',
      appSettings: 'id',
    });
  }
}

// Singleton instance
export const db: BrainstormDB = new BrainstormDB();

// Initialize default settings if not exists
export async function initializeDatabase(): Promise<void> {
  const settings = await db.appSettings.get('app-settings');
  if (!settings) {
    await db.appSettings.put({
      id: 'app-settings',
      theme: 'dark',
      defaultSpeedMs: 2000,
      defaultMaxContextTokens: 8000,
      defaultPlainTextOnly: false,
      showKeyboardShortcuts: true,
      autoScrollMessages: true,
      enabledLanguages: ['', 'Persian'],
      hiddenCategories: [],
      hiddenPresets: [],
    });
  }

  // Initialize default LLM providers if none exist
  const providersCount = await db.llmProviders.count();
  if (providersCount === 0) {
    await db.llmProviders.bulkPut([
      {
        id: 'openrouter-default',
        name: 'OpenRouter',
        apiFormat: 'openai',
        baseUrl: 'https://openrouter.ai/api/v1',
        isActive: false,
        autoFetchModels: true,
        models: [],
      },
      {
        id: 'ollama-default',
        name: 'Ollama (Local)',
        apiFormat: 'ollama',
        baseUrl: 'http://localhost:11434',
        isActive: false,
        autoFetchModels: true,
        models: [],
      },
    ]);
  }

  console.log('[DB] Database initialized successfully');
}

// Utility to generate deterministic turn ID
export function generateTurnId(conversationId: string, round: number, sequence: number): string {
  return `${conversationId}-r${round}-s${sequence}`;
}

// Database health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.conversations.count();
    return true;
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return false;
  }
}

// Clear all data (for reset)
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      // Preserve settings, providers, presets, and MCP servers
      if (table.name !== 'appSettings' && table.name !== 'llmProviders' && table.name !== 'agentPresets' && table.name !== 'mcpServers') {
        await table.clear();
      }
    }
  });
  console.log('[DB] All conversation data cleared');
}

// Export database for backup
export async function exportDatabase(): Promise<object> {
  const data: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    data[table.name] = await table.toArray();
  }
  return data;
}

// Import database from backup
export async function importDatabase(data: Record<string, unknown[]>): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const [tableName, records] of Object.entries(data)) {
      const table = db.tables.find(t => t.name === tableName);
      if (table && Array.isArray(records)) {
        await table.clear();
        await table.bulkPut(records);
      }
    }
  });
  console.log('[DB] Database imported successfully');
}

