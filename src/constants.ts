// ============================================
// AI Brainstorm - Application Constants
// ============================================

/**
 * Word limit settings for agent responses
 */
export const WORD_LIMIT = {
  /** Default word limit for standard responses */
  DEFAULT: 150,
  /** Percentage chance of getting an extended response (0-100) */
  EXTENDED_CHANCE: 20,
  /** Multiplier for extended response word limit */
  EXTENDED_MULTIPLIER: 3,
} as const;

/**
 * Depth-specific configurations for conversation detail levels
 * Word limits and extended response settings per depth level
 */
export const DEPTH_CONFIGS = {
  brief: { wordLimit: 40, extendedMultiplier: 2, extendedChance: 10 },
  concise: { wordLimit: 85, extendedMultiplier: 2, extendedChance: 15 },
  standard: { wordLimit: 150, extendedMultiplier: 3, extendedChance: 20 },
  detailed: { wordLimit: 300, extendedMultiplier: 2, extendedChance: 25 },
  deep: { wordLimit: 500, extendedMultiplier: 2, extendedChance: 30 },
} as const;

/**
 * Context window budget allocation percentages
 */
export const CONTEXT_BUDGET = {
  /** Percentage of available tokens for agent notebook */
  NOTEBOOK: 0.1,
  /** Percentage of available tokens for user interjections */
  INTERJECTIONS: 0.15,
  /** Percentage of available tokens for conversation messages */
  MESSAGES: 0.75,
  /** Default tokens reserved for model response */
  RESPONSE_RESERVE: 1000,
} as const;

/**
 * Time decay settings for message importance scoring
 */
export const TIME_DECAY = {
  /** Enable time-based decay for older messages */
  ENABLED: true,
  /** Half-life in milliseconds (30 minutes) */
  HALF_LIFE_MS: 30 * 60 * 1000,
  /** Minimum decay factor (prevents complete decay) */
  MIN_DECAY_FACTOR: 0.3,
  /** Penalty per round old (0-1 scale) */
  ROUND_DECAY: 0.1,
} as const;

/**
 * Message importance scoring weights
 */
export const MESSAGE_IMPORTANCE = {
  /** Score for opening statements */
  OPENING: 150,
  /** Score for secretary summaries */
  SUMMARY: 120,
  /** Score for user interjections */
  INTERJECTION: 80,
  /** Score for system messages */
  SYSTEM: 70,
  /** Base score for regular responses */
  RESPONSE: 30,
  /** Bonus for own previous messages */
  OWN_MESSAGE: 40,
  /** Bonus for messages addressed to agent */
  ADDRESSED_TO: 50,
  /** Maximum recency bonus */
  RECENCY_BONUS: 20,
  /** Bonus for first message */
  FIRST_MESSAGE: 30,
  /** Bonus for last 3 messages */
  RECENT_CONTEXT: 25,
  /** Threshold score for critical messages */
  CRITICAL_THRESHOLD: 100,
} as const;

/**
 * Rate limiting settings for LLM providers
 */
export const RATE_LIMIT = {
  /** Default requests per minute */
  DEFAULT_RPM: 60,
  /** Default tokens per minute */
  DEFAULT_TPM: 100000,
  /** Minimum delay between requests in ms */
  MIN_REQUEST_DELAY: 100,
  /** Rate limit window in ms (1 minute) */
  WINDOW_MS: 60 * 1000,
} as const;

/**
 * Retry settings for LLM requests
 */
export const RETRY = {
  /** Maximum number of retry attempts */
  MAX_ATTEMPTS: 3,
  /** Initial delay before first retry in ms */
  INITIAL_DELAY_MS: 1000,
  /** Maximum delay between retries in ms */
  MAX_DELAY_MS: 30000,
  /** Multiplier for exponential backoff */
  BACKOFF_MULTIPLIER: 2,
  /** Jitter factor (0-1) to add randomness */
  JITTER_FACTOR: 0.1,
} as const;

/**
 * Streaming settings
 */
export const STREAMING = {
  /** Minimum characters to accumulate before emitting chunk */
  MIN_CHUNK_SIZE: 1,
  /** Timeout for stream inactivity in ms */
  INACTIVITY_TIMEOUT_MS: 30000,
} as const;

/**
 * UI timing constants
 */
export const UI_TIMING = {
  /** Debounce delay for search input in ms */
  SEARCH_DEBOUNCE_MS: 300,
  /** Throttle delay for scroll handlers in ms */
  SCROLL_THROTTLE_MS: 100,
  /** Animation duration for smooth transitions in ms */
  ANIMATION_DURATION_MS: 200,
  /** Interval for lock check polling in ms */
  LOCK_CHECK_INTERVAL_MS: 2000,
} as const;

/**
 * Cache settings
 */
export const CACHE = {
  /** TTL for models cache in ms (5 minutes) */
  MODELS_TTL_MS: 5 * 60 * 1000,
} as const;

/**
 * Token estimation multipliers
 */
export const TOKEN_ESTIMATION = {
  /** Overhead tokens per message for formatting */
  MESSAGE_OVERHEAD: 10,
  /** Characters per token estimate for streaming */
  CHARS_PER_TOKEN: 4,
} as const;

