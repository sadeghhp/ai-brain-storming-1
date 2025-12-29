// ============================================
// AI Brainstorm - Prompt Types
// Version: 1.1.0
// ============================================

/**
 * Depth configuration for conversation depth levels
 */
export interface DepthConfigPrompts {
  promptGuidance: string;
  extendedGuidance: string;
}

/**
 * Agent-related prompts
 */
export interface AgentPrompts {
  /** Template for agent core identity: uses {name}, {role}, {expertise} */
  coreIdentity: string;
  
  /** Conversation context template: uses {subject} */
  conversationContext: string;
  
  /** Goal template: uses {goal} */
  goalTemplate: string;
  
  /** Secretary role description */
  secretaryRole: string;
  
  /** Thinking depth guidance by level (1-5) */
  thinkingDepth: {
    '1': string;
    '2': string;
    '3': string;
    '4': string;
    '5': string;
    default: string;
  };
  
  /** Creativity guidance by level (1-5) */
  creativityGuidance: {
    '1': string;
    '2': string;
    '3': string;
    '4': string;
    '5': string;
    default: string;
  };
  
  /** Word limit instructions */
  wordLimit: {
    /** Extended speaking turn template: uses {limit} */
    extended: string;
    /** Concise speaking turn template: uses {limit} */
    concise: string;
  };
  
  /** Depth-specific configurations */
  depthConfigs: {
    brief: DepthConfigPrompts;
    concise: DepthConfigPrompts;
    standard: DepthConfigPrompts;
    detailed: DepthConfigPrompts;
    deep: DepthConfigPrompts;
  };
  
  /** Plain text only formatting rules */
  plainTextRules: string;
  
  /** Language requirement template: uses {language} */
  languageRequirement: string;
  
  /** General interaction guidelines */
  interactionGuidelines: string;
  
  /** Strategy-specific discussion approach template: uses {instructions} */
  strategyApproach: string;
}

/**
 * Round decision fallback messages
 */
export interface RoundDecisionFallbacks {
  /** No messages fallback: uses {round}, {rounds} */
  noMessages: string;
  /** Analysis complete message */
  analysisComplete: string;
  /** Parse failure fallback: uses {rounds} */
  parseFail: string;
  /** Analysis failed fallback: uses {rounds} */
  analysisFailed: string;
}

/**
 * Secretary-related prompts
 */
export interface SecretaryPrompts {
  /** Core neutrality prompt */
  neutralityPrompt: string;
  
  /** Round decision fallback messages */
  roundDecisionFallbacks: RoundDecisionFallbacks;
  
  /** Round summary prompt: uses {round}, {language} */
  roundSummarySystem: string;
  
  /** Round analysis prompt for deciding rounds: uses {subject}, {goal}, {language} */
  roundAnalysisSystem: string;
  
  /** Summary prompt system message */
  summarySystem: string;
  
  /** Summary prompt with language: uses {language} */
  summarySystemWithLanguage: string;
  
  /** Summary user prompt */
  summaryUser: string;
  
  /** Note extraction system prompt */
  noteExtractionSystem: string;
  
  /** Note extraction user prompt: uses {message}, {existingNotes} */
  noteExtractionUser: string;
  
  /** Executive summary extraction prompt: uses {subject}, {goal} */
  executiveSummarySystem: string;
  
  /** Final executive summary prompt: uses {subject}, {goal}, {totalRounds} */
  finalExecutiveSummarySystem: string;
  
  /** Theme extraction prompt */
  themeExtractionSystem: string;
  
  /** Consensus extraction prompt */
  consensusExtractionSystem: string;
  
  /** Disagreement extraction prompt */
  disagreementExtractionSystem: string;
  
  /** Recommendations extraction prompt: uses {goal} */
  recommendationsExtractionSystem: string;
  
  /** Action items extraction prompt */
  actionItemsExtractionSystem: string;
  
  /** Open questions extraction prompt */
  openQuestionsExtractionSystem: string;
  
  /** Incremental update system prompt: uses {existingSummary} */
  incrementalUpdateSystem: string;
  
  /** Incremental update user prompt */
  incrementalUpdateUser: string;
  
  /** Status update system prompt */
  statusUpdateSystem: string;
  
  /** Result document sections */
  resultDocument: {
    title: string;
    finalTitle: string;
    overview: string;
    totalRounds: string;
    participants: string;
    executiveSummary: string;
    mainThemes: string;
    areasOfConsensus: string;
    areasOfDisagreement: string;
    recommendations: string;
    actionItems: string;
    openQuestions: string;
    roundByRoundProgress: string;
    roundLabel: string;
    updateLabel: string;
  };
  
  /** Distillation prompt: uses {subject}, {language} */
  distillationSystem: string;
  
  /** Distillation user prompt */
  distillationUser: string;
  
  /** Default messages */
  defaults: {
    noDiscussion: string;
    noRoundMessages: string;
    noRoundSummaries: string;
  };
}

/**
 * Strategy-specific prompts
 */
export interface StrategyPrompts {
  name: string;
  description: string;
  shortDescription: string;
  /** Opening prompt template: uses {subject}, {goal} */
  openingPromptTemplate: string;
  /** Ground rules template */
  groundRulesTemplate: string;
  /** Agent instructions */
  agentInstructions: string;
  /** First turn prompt */
  firstTurnPrompt: string;
}

/**
 * All strategies
 */
export interface StrategiesPrompts {
  'open-brainstorm': StrategyPrompts;
  'structured-debate': StrategyPrompts;
  'decision-matrix': StrategyPrompts;
  'problem-first': StrategyPrompts;
  'expert-deep-dive': StrategyPrompts;
  'devils-advocate': StrategyPrompts;
  /** Default first turn prompt when no strategy matches */
  defaultFirstTurnPrompt: string;
}

/**
 * Context building prompts
 */
export interface ContextPrompts {
  /** Discussion context header: uses {openingStatement} */
  discussionContext: string;
  
  /** Current state templates */
  currentState: {
    /** With max rounds: uses {displayRound}, {maxRounds} */
    withMaxRounds: string;
    /** Without max rounds: uses {displayRound} */
    withoutMaxRounds: string;
  };
  
  /** Phase guidance */
  phaseGuidance: {
    exploration: string;
    development: string;
    convergence: string;
  };
  
  /** Round decision reasoning: uses {reasoning} */
  roundDecisionReasoning: string;
  
  /** Distilled memory header */
  distilledMemoryHeader: string;
  
  /** Current discussion state: uses {stance} */
  currentDiscussionState: string;
  
  /** Key decisions made: uses {decisions} */
  keyDecisionsMade: string;
  
  /** Open questions: uses {questions} */
  openQuestionsLabel: string;
  
  /** Key facts header */
  keyFactsHeader: string;
  
  /** Secretary summary header: uses {summary} */
  secretarySummary: string;
  
  /** Notebook header: uses {notes} */
  notebookHeader: string;
  
  /** User guidance prefix */
  userGuidancePrefix: string;
  
  /** Discussion opening prefix */
  discussionOpeningPrefix: string;
  
  /** Message prefixes */
  messagePrefixes: {
    user: string;
    summary: string;
    addressedTo: string;
    highlyRated: string;
  };
  
  /** Turn prompts */
  turnPrompts: {
    /** Secretary turn prompt */
    secretary: string;
    /** First turn opening: uses {agentName} */
    firstTurnOpening: string;
    /** First turn with participants: uses {participants} */
    firstTurnParticipants: string;
    /** Regular turn: uses {agentName}, {participants} */
    regularTurn: string;
    /** Regular turn without others: uses {agentName} */
    regularTurnAlone: string;
  };
  
  /** Finishing phase prompts (optional for backward compatibility) */
  finishingPhase?: {
    /** Broadcast message to all agents about wrapping up */
    broadcastMessage: string;
    /** Instructions for agents in the final round */
    agentInstructions: string;
    /** Instructions for secretary in the final round */
    secretaryInstructions: string;
  };
}

/**
 * UI-related prompts
 */
export interface UIPrompts {
  /** Finish button labels and messages */
  finishButton: {
    label: string;
    tooltip: string;
    confirmTitle: string;
    confirmMessage: string;
    confirmButton: string;
  };
}

/**
 * Complete prompt template structure
 */
export interface PromptTemplates {
  /** Version of the prompt file format */
  version: string;
  
  /** Language code */
  language: string;
  
  /** Language display name */
  languageName: string;
  
  /** Agent-related prompts */
  agent: AgentPrompts;
  
  /** Secretary-related prompts */
  secretary: SecretaryPrompts;
  
  /** Strategy prompts */
  strategies: StrategiesPrompts;
  
  /** Context building prompts */
  context: ContextPrompts;
  
  /** UI-related prompts (optional for backward compatibility) */
  ui?: UIPrompts;
}

/**
 * Supported language codes
 */
export type LanguageCode = 
  | '' // Default English
  | 'Persian'
  | 'Spanish'
  | 'French'
  | 'German'
  | 'Italian'
  | 'Portuguese'
  | 'Dutch'
  | 'Russian'
  | 'Chinese (Simplified)'
  | 'Chinese (Traditional)'
  | 'Japanese'
  | 'Korean'
  | 'Arabic'
  | 'Hindi'
  | 'Turkish'
  | 'Polish'
  | 'Swedish'
  | 'Norwegian'
  | 'Danish'
  | 'Finnish'
  | 'Greek'
  | 'Hebrew'
  | 'Thai'
  | 'Vietnamese'
  | 'Indonesian'
  | 'Czech'
  | 'Hungarian'
  | 'Romanian'
  | 'Ukrainian'
  | 'Bengali';

/**
 * Template interpolation helper type
 */
export type TemplateParams = Record<string, string | number>;

