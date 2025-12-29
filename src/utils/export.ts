// ============================================
// AI Brainstorm - Export Utilities
// Version: 1.3.0
// ============================================

import { conversationStorage, messageStorage, agentStorage, resultDraftStorage, presetStorage, mcpServerStorage } from '../storage/storage-manager';
import { downloadAsFile } from './helpers';
import type { Conversation, Message, Agent, ResultDraft, AgentPreset, MCPServer, MCPServerExport, MCPImportConflictStrategy } from '../types';

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

// ============================================
// MCP Server Export/Import
// ============================================

/**
 * Prepare MCP server for export (strip runtime fields)
 */
function prepareServerForExport(server: MCPServer): Omit<MCPServer, 'id' | 'isActive' | 'tools' | 'lastConnectedAt' | 'lastError'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, isActive, tools, lastConnectedAt, lastError, ...exportable } = server;
  return exportable;
}

/**
 * Export all MCP servers to JSON string
 */
export async function exportMCPServers(): Promise<string> {
  const servers = await mcpServerStorage.getAll();

  const exportData: MCPServerExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    servers: servers.map(prepareServerForExport),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export selected MCP servers by IDs
 */
export async function exportSelectedMCPServers(serverIds: string[]): Promise<string> {
  if (!Array.isArray(serverIds) || serverIds.length === 0) {
    throw new Error('No server IDs provided');
  }

  const servers = await mcpServerStorage.getByIds(serverIds);

  if (servers.length === 0) {
    throw new Error('No MCP servers found for the selected IDs');
  }

  const exportData: MCPServerExport = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    servers: servers.map(prepareServerForExport),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import MCP servers from JSON with conflict handling
 * @param jsonContent - JSON string with MCPServerExport format
 * @param conflictStrategy - How to handle duplicate server names: 'skip', 'rename', or 'replace'
 * @returns Object with imported count and skipped count
 */
export async function importMCPServers(
  jsonContent: string,
  conflictStrategy: MCPImportConflictStrategy = 'skip'
): Promise<{ imported: number; skipped: number; replaced: number }> {
  const data = JSON.parse(jsonContent) as MCPServerExport;

  if (!data.servers || !Array.isArray(data.servers)) {
    throw new Error('Invalid MCP server export format');
  }

  // Get existing servers to check for name conflicts
  const existingServers = await mcpServerStorage.getAll();
  const existingNames = new Map(existingServers.map(s => [s.name.toLowerCase(), s]));

  let imported = 0;
  let skipped = 0;
  let replaced = 0;

  for (const serverData of data.servers) {
    const nameLower = serverData.name.toLowerCase();
    const existingServer = existingNames.get(nameLower);

    if (existingServer) {
      // Name conflict - handle based on strategy
      switch (conflictStrategy) {
        case 'skip':
          skipped++;
          continue;

        case 'rename': {
          // Find a unique name by appending a number
          let newName = serverData.name;
          let counter = 1;
          while (existingNames.has(newName.toLowerCase())) {
            newName = `${serverData.name} (${counter})`;
            counter++;
          }
          await mcpServerStorage.create({
            ...serverData,
            name: newName,
          });
          // Update map to prevent future conflicts in this import batch
          existingNames.set(newName.toLowerCase(), { id: '', ...serverData, name: newName, isActive: false, tools: [] } as MCPServer);
          imported++;
          break;
        }

        case 'replace':
          // Delete existing and create new
          await mcpServerStorage.delete(existingServer.id);
          await mcpServerStorage.create(serverData);
          replaced++;
          break;
      }
    } else {
      // No conflict - create new server
      const newServer = await mcpServerStorage.create(serverData);
      existingNames.set(nameLower, newServer);
      imported++;
    }
  }

  return { imported, skipped, replaced };
}

/**
 * Download all MCP servers as file
 */
export async function downloadMCPServers(): Promise<void> {
  const content = await exportMCPServers();
  downloadAsFile(content, 'ai-brainstorm-mcp-servers.json', 'application/json');
}

/**
 * Download selected MCP servers as file
 */
export async function downloadSelectedMCPServers(serverIds: string[]): Promise<void> {
  const content = await exportSelectedMCPServers(serverIds);
  const data = JSON.parse(content) as MCPServerExport;
  
  // Generate filename based on selection
  let filename: string;
  if (data.servers.length === 1) {
    // Single server: use server name
    const safeName = data.servers[0].name.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    filename = `mcp-server-${safeName}.json`;
  } else {
    // Multiple servers: use count
    filename = `ai-brainstorm-mcp-servers-${data.servers.length}.json`;
  }
  
  downloadAsFile(content, filename, 'application/json');
}

