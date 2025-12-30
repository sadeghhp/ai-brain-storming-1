// ============================================
// AI Brainstorm - Rate Limiter Tests
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter, getRateLimiter, removeRateLimiter, resetAllRateLimiters } from '../src/llm/rate-limiter';
import { RATE_LIMIT } from '../src/constants';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should use default configuration', () => {
      const usage = limiter.getUsage();
      expect(usage.requests).toBe(0);
      expect(usage.tokens).toBe(0);
      expect(usage.windowMs).toBe(RATE_LIMIT.WINDOW_MS);
    });

    it('should accept custom configuration', () => {
      const customLimiter = new RateLimiter({
        requestsPerMinute: 30,
        tokensPerMinute: 50000,
      });
      expect(customLimiter).toBeDefined();
    });
  });

  describe('recordRequest', () => {
    it('should track request count', () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordRequest();
      
      const usage = limiter.getUsage();
      expect(usage.requests).toBe(3);
    });

    it('should clear old requests outside the window', () => {
      limiter.recordRequest();
      limiter.recordRequest();
      
      // Move time past the window
      vi.advanceTimersByTime(RATE_LIMIT.WINDOW_MS + 1000);
      
      limiter.recordRequest();
      
      const usage = limiter.getUsage();
      expect(usage.requests).toBe(1);
    });
  });

  describe('recordTokens', () => {
    it('should track token usage', () => {
      limiter.recordTokens(100);
      limiter.recordTokens(200);
      
      const usage = limiter.getUsage();
      expect(usage.tokens).toBe(300);
    });

    it('should clear old token usage outside the window', () => {
      limiter.recordTokens(100);
      
      vi.advanceTimersByTime(RATE_LIMIT.WINDOW_MS + 1000);
      
      limiter.recordTokens(50);
      
      const usage = limiter.getUsage();
      expect(usage.tokens).toBe(50);
    });
  });

  describe('canMakeRequest', () => {
    it('should return true when under limits', () => {
      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should return false when at request limit', () => {
      // Make requests up to the limit
      for (let i = 0; i < RATE_LIMIT.DEFAULT_RPM; i++) {
        limiter.recordRequest();
      }
      
      expect(limiter.canMakeRequest()).toBe(false);
    });

    it('should return true after window expires', () => {
      for (let i = 0; i < RATE_LIMIT.DEFAULT_RPM; i++) {
        limiter.recordRequest();
      }
      
      vi.advanceTimersByTime(RATE_LIMIT.WINDOW_MS + 1000);
      
      expect(limiter.canMakeRequest()).toBe(true);
    });

    it('should consider estimated tokens', () => {
      const tokenLimiter = new RateLimiter({
        requestsPerMinute: 1000,
        tokensPerMinute: 100,
      });
      
      tokenLimiter.recordTokens(80);
      
      expect(tokenLimiter.canMakeRequest(30)).toBe(false);
      expect(tokenLimiter.canMakeRequest(10)).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all tracked data', () => {
      limiter.recordRequest();
      limiter.recordRequest();
      limiter.recordTokens(500);
      
      limiter.reset();
      
      const usage = limiter.getUsage();
      expect(usage.requests).toBe(0);
      expect(usage.tokens).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      const newLimiter = new RateLimiter({ requestsPerMinute: 10 });
      
      // Make 10 requests - should hit limit
      for (let i = 0; i < 10; i++) {
        newLimiter.recordRequest();
      }
      
      expect(newLimiter.canMakeRequest()).toBe(false);
      
      // Update to allow more requests
      newLimiter.updateConfig({ requestsPerMinute: 20 });
      
      expect(newLimiter.canMakeRequest()).toBe(true);
    });
  });
});

describe('getRateLimiter', () => {
  afterEach(() => {
    resetAllRateLimiters();
  });

  it('should create new limiter for unknown provider', () => {
    const limiter = getRateLimiter('provider-1');
    expect(limiter).toBeDefined();
  });

  it('should return same limiter for same provider', () => {
    const limiter1 = getRateLimiter('provider-1');
    const limiter2 = getRateLimiter('provider-1');
    expect(limiter1).toBe(limiter2);
  });

  it('should return different limiters for different providers', () => {
    const limiter1 = getRateLimiter('provider-1');
    const limiter2 = getRateLimiter('provider-2');
    expect(limiter1).not.toBe(limiter2);
  });

  it('should update config on existing limiter', () => {
    const limiter1 = getRateLimiter('provider-1', { requestsPerMinute: 10 });
    const limiter2 = getRateLimiter('provider-1', { requestsPerMinute: 20 });
    expect(limiter1).toBe(limiter2);
    // Config should be updated
  });
});

describe('removeRateLimiter', () => {
  afterEach(() => {
    resetAllRateLimiters();
  });

  it('should remove limiter for provider', () => {
    const limiter1 = getRateLimiter('provider-1');
    limiter1.recordRequest();
    
    removeRateLimiter('provider-1');
    
    const limiter2 = getRateLimiter('provider-1');
    const usage = limiter2.getUsage();
    expect(usage.requests).toBe(0); // New limiter with no requests
  });
});

describe('resetAllRateLimiters', () => {
  it('should reset all limiters', () => {
    const limiter1 = getRateLimiter('provider-1');
    const limiter2 = getRateLimiter('provider-2');
    
    limiter1.recordRequest();
    limiter2.recordRequest();
    limiter2.recordRequest();
    
    resetAllRateLimiters();
    
    expect(limiter1.getUsage().requests).toBe(0);
    expect(limiter2.getUsage().requests).toBe(0);
  });
});

