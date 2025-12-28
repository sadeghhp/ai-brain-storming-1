// ============================================
// AI Brainstorm - Export Utilities
// Version: 1.0.0
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
 * Download conversation as file
 */
export async function downloadConversation(conversationId: string, format: 'json' | 'markdown'): Promise<void> {
  const conversation = await conversationStorage.getById(conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const filename = `brainstorm-${conversation.subject.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;

  if (format === 'json') {
    const content = await exportConversationToJSON(conversationId);
    downloadAsFile(content, `${filename}.json`, 'application/json');
  } else {
    const content = await exportConversationToMarkdown(conversationId);
    downloadAsFile(content, `${filename}.md`, 'text/markdown');
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

