// ============================================
// AI Brainstorm - MCP Router
// Version: 1.0.0
// ============================================
//
// Central service for managing MCP server connections
// and routing tool calls to appropriate servers

import { mcpServerStorage } from '../storage/storage-manager';
import { eventBus } from '../utils/event-bus';
import { 
  BaseMCPClient, 
  createMCPClient, 
  testMCPConnection,
  type MCPToolCallResult 
} from './mcp-client';
import type { MCPServer, MCPTool } from '../types';

// ============================================
// MCP Router Service
// ============================================

class MCPRouterService {
  private clients: Map<string, BaseMCPClient> = new Map();
  private initialized = false;

  /**
   * Initialize the router with stored server configurations
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const servers = await mcpServerStorage.getAll();
    
    // Don't auto-connect on init - wait for user action
    console.log(`[MCPRouter] Initialized with ${servers.length} server configurations`);
    this.initialized = true;
  }

  /**
   * Connect to an MCP server
   */
  async connect(serverId: string): Promise<MCPServer> {
    const server = await mcpServerStorage.getById(serverId);
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }

    // #region agent log
    console.log('[MCPRouter] Server config:', { name: server.name, endpoint: server.endpoint, useDevProxy: server.useDevProxy });
    // #endregion

    // Auto-enable dev proxy for external HTTPS when on local dev to avoid CORS
    const shouldAutoProxy = !server.useDevProxy && typeof window !== 'undefined' && window.location?.hostname && (() => {
      try {
        const host = window.location.hostname.toLowerCase();
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.endsWith('.local');
        const url = server.endpoint ? new URL(server.endpoint, window.location.origin) : null;
        const isExternalHttps = url ? (url.protocol === 'https:' && !(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.startsWith('192.168.') || url.hostname.endsWith('.local'))) : false;
        return isLocal && isExternalHttps;
      } catch {
        return false;
      }
    })();
    if (shouldAutoProxy) {
      server.useDevProxy = true;
      await mcpServerStorage.update(serverId, { useDevProxy: true });
      console.log('[MCPRouter] Auto-enabled dev proxy for external HTTPS endpoint in dev:', server.endpoint);
    }

    // Check if already connected
    const existingClient = this.clients.get(serverId);
    if (existingClient?.isConnected()) {
      return server;
    }

    try {
      const client = createMCPClient(server);
      // Store client early so it can be aborted during connect/init
      this.clients.set(serverId, client);
      
      // Set up event handlers
      client.on('disconnected', () => {
        this.clients.delete(serverId);
        eventBus.emit('mcp:server-disconnected', serverId);
      });

      client.on('error', (error) => {
        console.error(`[MCPRouter] Server ${server.name} error:`, error);
        eventBus.emit('mcp:server-error', { serverId, error: error.message });
      });

      // Connect and initialize
      await client.connect();
      await client.initialize();
      
      // Fetch tools
      const tools = await client.listTools();
      
      // Update server in storage with tools
      const updatedServer = await mcpServerStorage.setTools(serverId, tools);
      if (!updatedServer) {
        throw new Error('Failed to update server tools');
      }

      // Store client
      this.clients.set(serverId, client);
      
      // Mark as active
      await mcpServerStorage.setActive(serverId, true);

      console.log(`[MCPRouter] Connected to ${server.name} with ${tools.length} tools`);
      eventBus.emit('mcp:server-connected', updatedServer);
      
      return updatedServer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Don't log or update storage if it was a deliberate abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[MCPRouter] Connection to ${server.name} was aborted`);
        throw error;
      }

      console.error(`[MCPRouter] Failed to connect to ${server.name}:`, error);
      
      // Update server with error
      await mcpServerStorage.setError(serverId, errorMessage);
      
      eventBus.emit('mcp:server-error', { serverId, error: errorMessage });
      throw error;
    }
  }

  /**
   * Abort an ongoing connection attempt
   */
  abortConnection(serverId: string): void {
    const client = this.clients.get(serverId);
    if (client && !client.isConnected()) {
      client.abort();
      this.clients.delete(serverId);
      console.log(`[MCPRouter] Aborted connection to server ${serverId}`);
    }
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverId);
    }
    
    await mcpServerStorage.setActive(serverId, false);
    console.log(`[MCPRouter] Disconnected from server ${serverId}`);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.clients.keys()).map(id => this.disconnect(id));
    await Promise.allSettled(promises);
  }

  /**
   * Test connection to a server without persisting
   */
  async testConnection(server: MCPServer): Promise<MCPTool[]> {
    return testMCPConnection(server);
  }

  /**
   * Get connected client for a server
   */
  getClient(serverId: string): BaseMCPClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * Check if a server is connected
   */
  isConnected(serverId: string): boolean {
    return this.clients.get(serverId)?.isConnected() ?? false;
  }

  /**
   * Get all connected server IDs
   */
  getConnectedServerIds(): string[] {
    return Array.from(this.clients.keys()).filter(id => 
      this.clients.get(id)?.isConnected()
    );
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(
    serverId: string, 
    toolName: string, 
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const client = this.clients.get(serverId);
    if (!client?.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    console.log(`[MCPRouter] Calling tool ${toolName} on server ${serverId}`);
    return client.callTool(toolName, args);
  }

  /**
   * Get all tools available from connected servers
   */
  async getAllTools(): Promise<Array<{ serverId: string; serverName: string; tool: MCPTool }>> {
    const result: Array<{ serverId: string; serverName: string; tool: MCPTool }> = [];
    
    for (const [serverId, client] of this.clients) {
      if (!client.isConnected()) continue;
      
      const server = client.getServer();
      for (const tool of server.tools) {
        result.push({
          serverId,
          serverName: server.name,
          tool,
        });
      }
    }
    
    return result;
  }

  /**
   * Get tools for specific server IDs
   */
  async getToolsForServers(serverIds: string[]): Promise<Array<{ serverId: string; serverName: string; tool: MCPTool }>> {
    const result: Array<{ serverId: string; serverName: string; tool: MCPTool }> = [];
    
    // Get servers from storage (may include non-connected ones)
    const servers = await mcpServerStorage.getByIds(serverIds);
    
    for (const server of servers) {
      // If connected, use live tools
      const client = this.clients.get(server.id);
      const tools = client?.isConnected() ? client.getServer().tools : server.tools;
      
      for (const tool of tools) {
        result.push({
          serverId: server.id,
          serverName: server.name,
          tool,
        });
      }
    }
    
    return result;
  }

  /**
   * Find which server provides a specific tool
   */
  findToolServer(toolName: string, allowedServerIds?: string[]): { serverId: string; tool: MCPTool } | undefined {
    for (const [serverId, client] of this.clients) {
      if (!client.isConnected()) continue;
      if (allowedServerIds && !allowedServerIds.includes(serverId)) continue;
      
      const server = client.getServer();
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) {
        return { serverId, tool };
      }
    }
    return undefined;
  }

  /**
   * Refresh tools for a connected server
   */
  async refreshTools(serverId: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverId);
    if (!client?.isConnected()) {
      throw new Error(`Server ${serverId} is not connected`);
    }

    const tools = await client.listTools();
    await mcpServerStorage.setTools(serverId, tools);
    
    console.log(`[MCPRouter] Refreshed tools for server ${serverId}: ${tools.length} tools`);
    return tools;
  }

  /**
   * Get connection status for all servers
   */
  async getConnectionStatus(): Promise<Array<{
    server: MCPServer;
    connected: boolean;
    toolCount: number;
  }>> {
    const servers = await mcpServerStorage.getAll();
    return servers.map(server => ({
      server,
      connected: this.isConnected(server.id),
      toolCount: server.tools.length,
    }));
  }
}

// Singleton instance
export const mcpRouter = new MCPRouterService();

// ============================================
// Tool Description Builder
// ============================================

/**
 * Build a tool description string for inclusion in agent prompts
 */
export function buildToolDescriptions(
  tools: Array<{ serverId: string; serverName: string; tool: MCPTool }>
): string {
  if (tools.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## Available Tools',
    '',
    'You have access to the following tools. To use a tool, include a tool call in your response using this format:',
    '',
    '```tool',
    '{',
    '  "tool": "tool_name",',
    '  "arguments": {',
    '    "param1": "value1",',
    '    "param2": "value2"',
    '  }',
    '}',
    '```',
    '',
  ];

  // Group tools by server
  const byServer = new Map<string, Array<{ serverId: string; tool: MCPTool }>>();
  for (const item of tools) {
    const key = `${item.serverName} (${item.serverId})`;
    if (!byServer.has(key)) {
      byServer.set(key, []);
    }
    byServer.get(key)!.push({ serverId: item.serverId, tool: item.tool });
  }

  for (const [serverLabel, serverTools] of byServer) {
    lines.push(`### ${serverLabel}`);
    lines.push('');
    
    for (const { tool } of serverTools) {
      lines.push(`**${tool.name}**`);
      if (tool.description) {
        lines.push(tool.description);
      }
      
      // Add parameter info if available
      const schema = tool.inputSchema as {
        type?: string;
        properties?: Record<string, { type?: string; description?: string }>;
        required?: string[];
      };
      
      if (schema?.properties) {
        lines.push('');
        lines.push('Parameters:');
        for (const [param, info] of Object.entries(schema.properties)) {
          const required = schema.required?.includes(param) ? ' (required)' : '';
          const type = info.type ? `: ${info.type}` : '';
          const desc = info.description ? ` - ${info.description}` : '';
          lines.push(`- \`${param}\`${type}${required}${desc}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Parse tool calls from agent response content
 */
export function parseToolCalls(content: string): Array<{
  tool: string;
  arguments: Record<string, unknown>;
  raw: string;
}> {
  const toolCalls: Array<{
    tool: string;
    arguments: Record<string, unknown>;
    raw: string;
  }> = [];

  // Match tool call blocks
  const toolBlockRegex = /```tool\s*([\s\S]*?)```/g;
  let match;

  while ((match = toolBlockRegex.exec(content)) !== null) {
    const raw = match[1].trim();
    try {
      const parsed = JSON.parse(raw);
      if (parsed.tool && typeof parsed.tool === 'string') {
        toolCalls.push({
          tool: parsed.tool,
          arguments: parsed.arguments || {},
          raw,
        });
      }
    } catch (error) {
      console.warn('[MCPRouter] Failed to parse tool call:', raw);
    }
  }

  return toolCalls;
}

/**
 * Format tool result for inclusion in conversation
 */
export function formatToolResult(
  toolName: string, 
  result: MCPToolCallResult
): string {
  const lines: string[] = [`**Tool Result: ${toolName}**`];
  
  if (result.isError) {
    lines.push('');
    lines.push('*Error:*');
  }

  for (const content of result.content) {
    if (content.type === 'text' && content.text) {
      lines.push('');
      lines.push(content.text);
    } else if (content.type === 'image' && content.data) {
      lines.push('');
      lines.push(`[Image: ${content.mimeType || 'unknown type'}]`);
    } else if (content.type === 'resource') {
      lines.push('');
      lines.push('[Resource content]');
    }
  }

  return lines.join('\n');
}

