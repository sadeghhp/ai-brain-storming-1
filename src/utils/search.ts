// ============================================
// AI Brainstorm - Search Utilities
// Version: 1.0.0
// ============================================

import { conversationStorage, messageStorage, agentStorage, presetStorage } from '../storage/storage-manager';
import type { Conversation, Message, AgentPreset } from '../types';

export interface SearchResult {
  type: 'conversation' | 'message' | 'preset';
  id: string;
  title: string;
  subtitle: string;
  content: string;
  timestamp?: number;
  score: number;
}

/**
 * Search across all content
 */
export async function globalSearch(query: string, limit: number = 20): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  // Search conversations
  const conversations = await conversationStorage.getAll();
  for (const conv of conversations) {
    const subjectMatch = conv.subject.toLowerCase().includes(lowerQuery);
    const goalMatch = conv.goal.toLowerCase().includes(lowerQuery);

    if (subjectMatch || goalMatch) {
      results.push({
        type: 'conversation',
        id: conv.id,
        title: conv.subject,
        subtitle: `${conv.status} · ${new Date(conv.updatedAt).toLocaleDateString()}`,
        content: conv.goal,
        timestamp: conv.updatedAt,
        score: subjectMatch ? 10 : 5,
      });
    }
  }

  // Search messages
  for (const conv of conversations) {
    const messages = await messageStorage.getByConversation(conv.id);
    const agents = await agentStorage.getByConversation(conv.id);
    const agentMap = new Map(agents.map(a => [a.id, a]));

    for (const msg of messages) {
      if (msg.content.toLowerCase().includes(lowerQuery)) {
        const agent = msg.agentId ? agentMap.get(msg.agentId) : null;
        results.push({
          type: 'message',
          id: msg.id,
          title: conv.subject,
          subtitle: agent?.name || 'User',
          content: highlightMatch(msg.content, query, 100),
          timestamp: msg.createdAt,
          score: 3,
        });
      }
    }
  }

  // Search presets
  const presets = await presetStorage.getAll();
  for (const preset of presets) {
    const nameMatch = preset.name.toLowerCase().includes(lowerQuery);
    const expertiseMatch = preset.expertise.toLowerCase().includes(lowerQuery);
    const descMatch = preset.description.toLowerCase().includes(lowerQuery);

    if (nameMatch || expertiseMatch || descMatch) {
      results.push({
        type: 'preset',
        id: preset.id,
        title: preset.name,
        subtitle: preset.category,
        content: preset.description,
        score: nameMatch ? 8 : (expertiseMatch ? 5 : 2),
      });
    }
  }

  // Sort by score and limit
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Search within a conversation
 */
export async function searchInConversation(
  conversationId: string,
  query: string
): Promise<Message[]> {
  if (!query || query.length < 2) return [];

  const lowerQuery = query.toLowerCase();
  const messages = await messageStorage.getByConversation(conversationId);

  return messages.filter(msg =>
    msg.content.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Find conversations by agent
 */
export async function findConversationsByAgent(agentName: string): Promise<Conversation[]> {
  const conversations = await conversationStorage.getAll();
  const result: Conversation[] = [];
  const lowerName = agentName.toLowerCase();

  for (const conv of conversations) {
    const agents = await agentStorage.getByConversation(conv.id);
    if (agents.some(a => a.name.toLowerCase().includes(lowerName))) {
      result.push(conv);
    }
  }

  return result;
}

/**
 * Find related presets based on keywords
 */
export async function findRelatedPresets(keywords: string[]): Promise<AgentPreset[]> {
  const presets = await presetStorage.getAll();
  const scores = new Map<string, number>();

  for (const preset of presets) {
    let score = 0;
    const searchText = `${preset.name} ${preset.expertise} ${preset.description}`.toLowerCase();

    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        score++;
      }
    }

    if (score > 0) {
      scores.set(preset.id, score);
    }
  }

  return presets
    .filter(p => scores.has(p.id))
    .sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0));
}

/**
 * Highlight matching text
 */
function highlightMatch(text: string, query: string, maxLength: number): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
  }

  // Show context around the match
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + query.length + 50);

  let excerpt = text.slice(start, end);
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt += '...';

  return excerpt;
}

/**
 * Get search suggestions based on history
 */
export async function getSearchSuggestions(): Promise<string[]> {
  const conversations = await conversationStorage.getAll();
  const suggestions = new Set<string>();

  // Add recent conversation subjects
  conversations.slice(0, 10).forEach(c => {
    suggestions.add(c.subject);
  });

  // Add agent names
  for (const conv of conversations.slice(0, 5)) {
    const agents = await agentStorage.getByConversation(conv.id);
    agents.forEach(a => {
      if (!a.isSecretary) suggestions.add(a.name);
    });
  }

  // Add preset categories
  const presets = await presetStorage.getAll();
  new Set(presets.map(p => p.category)).forEach(c => suggestions.add(c));

  return Array.from(suggestions).slice(0, 20);
}

