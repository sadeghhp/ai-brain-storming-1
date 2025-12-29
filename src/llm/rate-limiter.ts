// ============================================
// AI Brainstorm - Rate Limiter
// ============================================

import { RATE_LIMIT } from '../constants';

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  /** Maximum tokens per minute (optional) */
  tokensPerMinute?: number;
  /** Minimum delay between requests in ms */
  minRequestDelay: number;
}

/**
 * Rate limiter for LLM API requests
 * Implements token bucket algorithm with sliding window
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private requestTimestamps: number[] = [];
  private tokenUsage: { timestamp: number; tokens: number }[] = [];
  private lastRequestTime: number = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? RATE_LIMIT.DEFAULT_RPM,
      tokensPerMinute: config.tokensPerMinute ?? RATE_LIMIT.DEFAULT_TPM,
      minRequestDelay: config.minRequestDelay ?? RATE_LIMIT.MIN_REQUEST_DELAY,
    };
  }

  /**
   * Wait until a request can be made within rate limits
   * @returns Promise that resolves when ready to make request
   */
  async waitForSlot(): Promise<void> {
    // Clean up old timestamps outside the window
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.WINDOW_MS;
    
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > windowStart);
    this.tokenUsage = this.tokenUsage.filter(u => u.timestamp > windowStart);

    // Check if we need to wait for rate limit
    if (this.requestTimestamps.length >= this.config.requestsPerMinute) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = oldestRequest + RATE_LIMIT.WINDOW_MS - now;
      
      if (waitTime > 0) {
        console.log(`[RateLimiter] Rate limit reached, waiting ${Math.round(waitTime)}ms`);
        await this.sleep(waitTime);
      }
    }

    // Ensure minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.minRequestDelay) {
      await this.sleep(this.config.minRequestDelay - timeSinceLastRequest);
    }
  }

  /**
   * Record a request being made
   */
  recordRequest(): void {
    const now = Date.now();
    this.requestTimestamps.push(now);
    this.lastRequestTime = now;
  }

  /**
   * Record token usage for a request
   * @param tokens Number of tokens used
   */
  recordTokens(tokens: number): void {
    if (this.config.tokensPerMinute) {
      this.tokenUsage.push({
        timestamp: Date.now(),
        tokens,
      });
    }
  }

  /**
   * Check if we can make a request with the given token estimate
   * @param estimatedTokens Estimated tokens for the request
   * @returns Whether the request can be made within limits
   */
  canMakeRequest(estimatedTokens: number = 0): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.WINDOW_MS;

    // Check request count
    const recentRequests = this.requestTimestamps.filter(ts => ts > windowStart);
    if (recentRequests.length >= this.config.requestsPerMinute) {
      return false;
    }

    // Check token usage if configured
    if (this.config.tokensPerMinute && estimatedTokens > 0) {
      const recentTokens = this.tokenUsage
        .filter(u => u.timestamp > windowStart)
        .reduce((sum, u) => sum + u.tokens, 0);
      
      if (recentTokens + estimatedTokens > this.config.tokensPerMinute) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get current usage statistics
   */
  getUsage(): { requests: number; tokens: number; windowMs: number } {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.WINDOW_MS;

    return {
      requests: this.requestTimestamps.filter(ts => ts > windowStart).length,
      tokens: this.tokenUsage
        .filter(u => u.timestamp > windowStart)
        .reduce((sum, u) => sum + u.tokens, 0),
      windowMs: RATE_LIMIT.WINDOW_MS,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.requestTimestamps = [];
    this.tokenUsage = [];
    this.lastRequestTime = 0;
  }

  /**
   * Update rate limiter configuration
   */
  updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiters per provider
 */
const rateLimiters = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for a provider
 */
export function getRateLimiter(providerId: string, config?: Partial<RateLimiterConfig>): RateLimiter {
  let limiter = rateLimiters.get(providerId);
  
  if (!limiter) {
    limiter = new RateLimiter(config);
    rateLimiters.set(providerId, limiter);
  } else if (config) {
    limiter.updateConfig(config);
  }
  
  return limiter;
}

/**
 * Remove a rate limiter for a provider
 */
export function removeRateLimiter(providerId: string): void {
  rateLimiters.delete(providerId);
}

/**
 * Reset all rate limiters
 */
export function resetAllRateLimiters(): void {
  rateLimiters.forEach(limiter => limiter.reset());
}

