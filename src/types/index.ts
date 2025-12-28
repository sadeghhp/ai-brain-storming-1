// ============================================
// AI Brainstorm - Type Definitions
// Version: 1.1.0
// ============================================

// ----- Enums -----

export type ConversationMode = 'round-robin' | 'moderator' | 'dynamic';
export type ConversationStatus = 'idle' | 'running' | 'paused' | 'completed';
export type TurnState = 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';
export type MessageType = 'response' | 'summary' | 'interjection' | 'system' | 'opening';
export type ApiFormat = 'openai' | 'anthropic' | 'ollama';

// Starting strategy types
export type StartingStrategyId = 
  | 'open-brainstorm'
  | 'structured-debate'
  | 'decision-matrix'
  | 'problem-first'
  | 'expert-deep-dive'
  | 'devils-advocate';

// Legacy type for backwards compatibility during migration
export type LLMProviderType = 'openrouter' | 'ollama';

// ----- Core Entities -----

export interface Conversation {
  id: string;
  subject: string;
  goal: string;
  mode: ConversationMode;
  status: ConversationStatus;
  speedMs: number;
  maxContextTokens: number;
  plainTextOnly: boolean;
  currentRound: number;
  maxRounds?: number;
  // Starting strategy configuration
  startingStrategy?: StartingStrategyId;
  openingStatement?: string;
  groundRules?: string;
  // Archive status
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Turn {
  id: string;
  conversationId: string;
  agentId: string;
  round: number;
  sequence: number;
  state: TurnState;
  promptSent?: string;
  tokensUsed?: number;
  error?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface Agent {
  id: string;
  conversationId: string;
  name: string;
  role: string;
  expertise: string;
  presetId?: string;
  llmProviderId: string;
  modelId: string;
  thinkingDepth: number; // 1-5 scale
  creativityLevel: number; // 1-5 scale (temperature mapping)
  notebookUsage: number; // 0-100% of context to use for notebook
  isSecretary: boolean;
  color: string;
  order: number; // Position in turn order
}

export interface Message {
  id: string;
  turnId?: string;
  conversationId: string;
  agentId?: string; // null for system/user messages
  content: string;
  addressedTo?: string; // Agent ID or null for broadcast
  round: number;
  weight: number; // User can upvote/downvote
  type: MessageType;
  createdAt: number;
}

export interface Notebook {
  agentId: string;
  notes: string;
  updatedAt: number;
}

export interface ResultDraft {
  conversationId: string;
  // Legacy fields (kept for backward compatibility)
  content: string;
  summary: string;
  keyDecisions: string;
  // New structured fields
  executiveSummary: string;
  themes: string[];              // Main themes identified in discussion
  consensusAreas: string;        // Where agents agreed
  disagreements: string;         // Where agents disagreed  
  recommendations: string;       // Secretary's neutral recommendations
  actionItems: string;           // Concrete next steps
  openQuestions: string;         // Unresolved questions
  roundSummaries: string[];      // Array of round-by-round summaries
  updatedAt: number;
}

export interface AgentPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  expertise: string;
  systemPrompt: string;
  strengths: string;
  thinkingStyle: string;
  isBuiltIn: boolean;
  defaultThinkingDepth: number;
  defaultCreativityLevel: number;
}

export interface ProviderModel {
  id: string;           // e.g., "gpt-4o" or "claude-3-sonnet"
  name: string;         // Display name
  contextLength: number;
  isCustom: boolean;    // User-defined vs auto-fetched
}

export interface LLMProvider {
  id: string;
  name: string;
  apiFormat: ApiFormat;
  apiKey?: string;
  baseUrl: string;
  isActive: boolean;
  lastTestedAt?: number;
  autoFetchModels: boolean;  // Whether to fetch models from API
  models: ProviderModel[];   // User-defined + auto-fetched models
}

export interface UserInterjection {
  id: string;
  conversationId: string;
  content: string;
  afterRound: number;
  processed: boolean;
  createdAt: number;
}

export interface UserReaction {
  id: string;
  messageId: string;
  delta: number; // +1 or -1
  createdAt: number;
}

// ----- Settings -----

export interface AppSettings {
  id: string; // Always 'app-settings'
  theme: 'dark' | 'light';
  defaultSpeedMs: number;
  defaultMaxContextTokens: number;
  defaultPlainTextOnly: boolean;
  showKeyboardShortcuts: boolean;
  autoScrollMessages: boolean;
}

// ----- LLM Types -----

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  providerId: string;
  modelId: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  finishReason: string;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface LLMModel {
  id: string;
  name: string;
  contextLength: number;
  providerId: string;
}

// ----- Event Types -----

export interface AppEvents {
  'conversation:created': Conversation;
  'conversation:updated': Conversation;
  'conversation:deleted': string;
  'conversation:selected': string;
  'conversation:started': string;
  'conversation:paused': string;
  'conversation:resumed': string;
  'conversation:stopped': string;
  'conversation:reset': string;
  'turn:started': Turn;
  'turn:completed': Turn;
  'turn:failed': Turn;
  'message:created': Message;
  'message:updated': Message;
  'agent:speaking': string;
  'agent:thinking': string;
  'agent:idle': string;
  'user:interjection': UserInterjection;
  'draft:updated': ResultDraft;
  'provider:connected': string;
  'provider:disconnected': string;
  'settings:open': undefined;
  'settings:close': undefined;
  'settings:updated': AppSettings;
  'stream:chunk': { agentId: string; content: string };
  'stream:complete': { agentId: string };
  'error': { message: string; details?: unknown };
}

// ----- Utility Types -----

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ----- Create/Update DTOs -----

export type CreateConversation = Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'currentRound' | 'status'>;
export type UpdateConversation = DeepPartial<Omit<Conversation, 'id' | 'createdAt'>>;

export type CreateAgent = Omit<Agent, 'id'>;
export type UpdateAgent = DeepPartial<Omit<Agent, 'id' | 'conversationId'>>;

export type CreateMessage = Omit<Message, 'id' | 'createdAt' | 'weight'>;
export type UpdateMessage = DeepPartial<Omit<Message, 'id' | 'createdAt' | 'conversationId'>>;

export type CreateLLMProvider = Omit<LLMProvider, 'id' | 'lastTestedAt' | 'isActive' | 'models'> & { models?: ProviderModel[] };
export type UpdateLLMProvider = DeepPartial<Omit<LLMProvider, 'id'>>;

// Model CRUD types
export type CreateProviderModel = Omit<ProviderModel, 'isCustom'>;
export type UpdateProviderModel = DeepPartial<Omit<ProviderModel, 'id' | 'isCustom'>>;

export type CreateAgentPreset = Omit<AgentPreset, 'id' | 'isBuiltIn'>;
export type UpdateAgentPreset = DeepPartial<Omit<AgentPreset, 'id' | 'isBuiltIn'>>;

