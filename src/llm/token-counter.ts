// ============================================
// AI Brainstorm - Token Counter
// Version: 1.0.0
// ============================================

import { encode } from 'gpt-tokenizer';
import type { LLMMessage } from './types';

/**
 * Count tokens in a string using GPT tokenizer
 * This provides accurate counts for OpenAI/OpenRouter models
 * For Ollama, it's an approximation but close enough for context management
 */
export function countTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    // Fallback: rough estimate of 4 characters per token
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in an array of messages
 * Includes overhead for message formatting
 */
export function countMessageTokens(messages: LLMMessage[]): number {
  let total = 0;

  for (const message of messages) {
    // Each message has overhead: role tokens + formatting
    // Approximately 4 tokens overhead per message
    total += 4;
    total += countTokens(message.content);
  }

  // Add 2 tokens for the assistant's reply priming
  total += 2;

  return total;
}

/**
 * Estimate tokens for a conversation with system prompt
 */
export function estimateConversationTokens(
  systemPrompt: string,
  messages: LLMMessage[],
  newMessage?: string
): number {
  let total = 0;

  // System prompt
  total += countTokens(systemPrompt) + 4;

  // Existing messages
  total += countMessageTokens(messages);

  // New message if provided
  if (newMessage) {
    total += countTokens(newMessage) + 4;
  }

  return total;
}

/**
 * Truncate messages to fit within token limit
 * Keeps system message and most recent messages
 */
export function truncateMessagesToFit(
  messages: LLMMessage[],
  maxTokens: number,
  reserveTokens: number = 500
): LLMMessage[] {
  const targetTokens = maxTokens - reserveTokens;
  
  if (targetTokens <= 0) {
    console.warn('[TokenCounter] Target tokens too low, returning empty array');
    return [];
  }

  // Separate system messages from the rest
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');

  // Count system message tokens
  const systemTokens = countMessageTokens(systemMessages);
  
  if (systemTokens >= targetTokens) {
    console.warn('[TokenCounter] System messages exceed token limit');
    return systemMessages;
  }

  const availableTokens = targetTokens - systemTokens;
  const result: LLMMessage[] = [...systemMessages];
  let currentTokens = 0;

  // Add messages from the end (most recent first)
  for (let i = otherMessages.length - 1; i >= 0; i--) {
    const message = otherMessages[i];
    const messageTokens = countTokens(message.content) + 4;

    if (currentTokens + messageTokens <= availableTokens) {
      result.push(message);
      currentTokens += messageTokens;
    } else {
      break;
    }
  }

  // Reverse to restore chronological order (excluding system messages)
  const systemCount = systemMessages.length;
  const reversedOthers = result.slice(systemCount).reverse();
  
  return [...result.slice(0, systemCount), ...reversedOthers];
}

/**
 * Summarize text to fit within token limit
 * Returns truncated text with ellipsis if needed
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const tokens = encode(text);
  
  if (tokens.length <= maxTokens) {
    return text;
  }

  // Take first maxTokens - 3 tokens to leave room for "..."
  const truncatedTokens = tokens.slice(0, Math.max(0, maxTokens - 3));
  
  try {
    // Decode tokens back to text
    const decoder = new TextDecoder();
    const uint8Array = new Uint8Array(truncatedTokens);
    return decoder.decode(uint8Array) + '...';
  } catch {
    // Fallback: character-based truncation
    const charLimit = maxTokens * 4;
    return text.slice(0, charLimit) + '...';
  }
}

/**
 * Get a rough token estimate based on character count
 * Useful for quick checks without full tokenization
 */
export function roughTokenEstimate(text: string): number {
  // Average of ~4 characters per token for English
  // Adjust for code/special characters
  const baseEstimate = text.length / 4;
  
  // Code has more tokens per character
  const codePattern = /[{}[\]()=<>:;,.\-+*\/\\|&!@#$%^~`'"]/g;
  const codeChars = (text.match(codePattern) || []).length;
  
  return Math.ceil(baseEstimate + codeChars * 0.5);
}

