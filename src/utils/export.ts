// ============================================
// AI Brainstorm - Export Utilities
// Version: 1.2.0
// ============================================

import { conversationStorage, messageStorage, agentStorage, resultDraftStorage, presetStorage } from '../storage/storage-manager';
import { downloadAsFile } from './helpers';
import type { Conversation, Message, Agent, ResultDraft, AgentPreset } from '../types';

export interface ConversationExport {
  version: string;
  exportedAt: string;
  conversation: Conversation;
  agents: Agent[];
  messages: Message[];
  resultDraft?: ResultDraft;
}

export interface PresetExport {
  version: string;
  exportedAt: string;
  presets: AgentPreset[];
}

/**
 * Export a conversation to JSON
 */
export async function exportConversationToJSON(conversationId: string): Promise<string> {
  const conversation = await conversationStorage.getById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const agents = await agentStorage.getByConversation(conversationId);
  const messages = await messageStorage.getByConversation(conversationId);
  const resultDraft = await resultDraftStorage.get(conversationId);

  const exportData: ConversationExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    conversation,
    agents,
    messages,
    resultDraft,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export a conversation to Markdown
 */
export async function exportConversationToMarkdown(conversationId: string): Promise<string> {
  const conversation = await conversationStorage.getById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const agents = await agentStorage.getByConversation(conversationId);
  const messages = await messageStorage.getByConversation(conversationId);
  const resultDraft = await resultDraftStorage.get(conversationId);

  const agentMap = new Map(agents.map(a => [a.id, a]));

  const lines: string[] = [];

  // Header
  lines.push(`# ${conversation.subject}`);
  lines.push('');
  lines.push(`**Goal:** ${conversation.goal}`);
  lines.push(`**Mode:** ${conversation.mode}`);
  lines.push(`**Status:** ${conversation.status}`);
  lines.push(`**Created:** ${new Date(conversation.createdAt).toLocaleString()}`);
  lines.push('');

  // Participants
  lines.push('## Participants');
  lines.push('');
  for (const agent of agents.filter(a => !a.isSecretary)) {
    lines.push(`- **${agent.name}** - ${agent.role}`);
  }
  lines.push('');

  // Result (if available)
  if (resultDraft?.summary) {
    lines.push('## Summary');
    lines.push('');
    lines.push(resultDraft.summary);
    lines.push('');
  }

  if (resultDraft?.keyDecisions) {
    lines.push('## Key Decisions');
    lines.push('');
    lines.push(resultDraft.keyDecisions);
    lines.push('');
  }

  // Conversation
  lines.push('## Conversation');
  lines.push('');

  let currentRound = -1;
  for (const message of messages) {
    if (message.round !== currentRound) {
      currentRound = message.round;
      lines.push(`### Round ${currentRound + 1}`);
      lines.push('');
    }

    const agent = message.agentId ? agentMap.get(message.agentId) : null;
    const senderName = message.type === 'interjection' ? 'User' : (agent?.name || 'System');

    lines.push(`**${senderName}:**`);
    lines.push('');
    lines.push(message.content);
    lines.push('');
  }

  // Footer
  lines.push('---');
  lines.push(`*Exported from AI Brainstorm on ${new Date().toLocaleString()}*`);

  return lines.join('\n');
}

/**
 * Export a conversation to plain text
 */
export async function exportConversationToText(conversationId: string): Promise<string> {
  const conversation = await conversationStorage.getById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const agents = await agentStorage.getByConversation(conversationId);
  const messages = await messageStorage.getByConversation(conversationId);
  const resultDraft = await resultDraftStorage.get(conversationId);

  const agentMap = new Map(agents.map(a => [a.id, a]));

  const lines: string[] = [];
  const separator = '─'.repeat(60);

  // Header
  lines.push(separator);
  lines.push(conversation.subject.toUpperCase());
  lines.push(separator);
  lines.push('');
  lines.push(`Goal: ${conversation.goal}`);
  lines.push(`Mode: ${conversation.mode}`);
  lines.push(`Status: ${conversation.status}`);
  lines.push(`Created: ${new Date(conversation.createdAt).toLocaleString()}`);
  lines.push('');

  // Participants
  lines.push('PARTICIPANTS');
  lines.push('');
  for (const agent of agents.filter(a => !a.isSecretary)) {
    lines.push(`  • ${agent.name} - ${agent.role}`);
  }
  lines.push('');

  // Result (if available)
  if (resultDraft?.summary) {
    lines.push(separator);
    lines.push('SUMMARY');
    lines.push(separator);
    lines.push('');
    lines.push(resultDraft.summary);
    lines.push('');
  }

  if (resultDraft?.keyDecisions) {
    lines.push(separator);
    lines.push('KEY DECISIONS');
    lines.push(separator);
    lines.push('');
    lines.push(resultDraft.keyDecisions);
    lines.push('');
  }

  // Conversation
  lines.push(separator);
  lines.push('CONVERSATION');
  lines.push(separator);
  lines.push('');

  let currentRound = -1;
  for (const message of messages) {
    if (message.round !== currentRound) {
      currentRound = message.round;
      lines.push('');
      lines.push(`── Round ${currentRound + 1} ──`);
      lines.push('');
    }

    const agent = message.agentId ? agentMap.get(message.agentId) : null;
    const senderName = message.type === 'interjection' ? 'User' : (agent?.name || 'System');

    lines.push(`[${senderName}]`);
    lines.push(message.content);
    lines.push('');
  }

  // Footer
  lines.push(separator);
  lines.push(`Exported from AI Brainstorm on ${new Date().toLocaleString()}`);
  lines.push(separator);

  return lines.join('\n');
}

/**
 * Download conversation as file
 */
export async function downloadConversation(conversationId: string, format: 'json' | 'markdown' | 'text'): Promise<void> {
  const conversation = await conversationStorage.getById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const filename = `brainstorm-${conversation.subject.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

  if (format === 'json') {
    const content = await exportConversationToJSON(conversationId);
    downloadAsFile(content, `${filename}.json`, 'application/json');
  } else if (format === 'markdown') {
    const content = await exportConversationToMarkdown(conversationId);
    downloadAsFile(content, `${filename}.md`, 'text/markdown');
  } else {
    const content = await exportConversationToText(conversationId);
    downloadAsFile(content, `${filename}.txt`, 'text/plain');
  }
}

/**
 * Export custom presets
 */
export async function exportPresets(): Promise<string> {
  const presets = await presetStorage.getCustom();

  const exportData: PresetExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    presets,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import presets from JSON
 */
export async function importPresets(jsonContent: string): Promise<number> {
  const data = JSON.parse(jsonContent) as PresetExport;

  if (!data.presets || !Array.isArray(data.presets)) {
    throw new Error('Invalid preset export format');
  }

  let imported = 0;
  for (const preset of data.presets) {
    // Don't import if it's marked as built-in
    if (preset.isBuiltIn) continue;

    await presetStorage.create({
      name: preset.name,
      category: preset.category || 'custom',
      description: preset.description,
      expertise: preset.expertise,
      systemPrompt: preset.systemPrompt,
      strengths: preset.strengths,
      thinkingStyle: preset.thinkingStyle,
      defaultThinkingDepth: preset.defaultThinkingDepth || 3,
      defaultCreativityLevel: preset.defaultCreativityLevel || 3,
    });
    imported++;
  }

  return imported;
}

/**
 * Download presets as file
 */
export async function downloadPresets(): Promise<void> {
  const content = await exportPresets();
  downloadAsFile(content, 'ai-brainstorm-presets.json', 'application/json');
}

/**
 * Export selected presets by IDs
 */
export async function exportSelectedPresets(presetIds: string[]): Promise<string> {
  if (!Array.isArray(presetIds) || presetIds.length === 0) {
    throw new Error('No preset IDs provided');
  }

  // Fetch by ID to avoid relying on boolean/index representations in historical data.
  const fetched = await Promise.all(presetIds.map(id => presetStorage.getById(id)));
  
  // Robust check: treat as built-in only if isBuiltIn is explicitly truthy (true, 1, "1")
  const selected = fetched.filter((p): p is AgentPreset => {
    if (!p) return false;
    const isBuiltIn = (p as any).isBuiltIn;
    return isBuiltIn !== true && isBuiltIn !== 1 && isBuiltIn !== '1';
  });

  if (selected.length === 0) {
    throw new Error('No valid custom presets found for the selected IDs');
  }

  const exportData: PresetExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    presets: selected,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Download selected presets as file
 */
export async function downloadSelectedPresets(presetIds: string[]): Promise<void> {
  const content = await exportSelectedPresets(presetIds);
  const data = JSON.parse(content) as PresetExport;
  
  // Generate filename based on selection
  let filename: string;
  if (data.presets.length === 1) {
    // Single preset: use preset name
    const safeName = data.presets[0].name.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    filename = `preset-${safeName}.json`;
  } else {
    // Multiple presets: use count
    filename = `ai-brainstorm-presets-${data.presets.length}.json`;
  }
  
  downloadAsFile(content, filename, 'application/json');
}

