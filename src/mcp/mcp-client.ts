// ============================================
// AI Brainstorm - MCP Client
// Version: 1.0.0
// ============================================
// 
// MCP (Model Context Protocol) client implementation
// Supports HTTP/SSE and Stdio transports
//
// Note: Stdio transport requires a backend proxy in browser environments
// as browsers cannot spawn local processes directly.

import type { MCPServer, MCPTool } from '../types';

// ============================================
// Types
// ============================================

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface MCPToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  toolsUpdated: (tools: MCPTool[]) => void;
}

// ============================================
// Base MCP Client
// ============================================

export abstract class BaseMCPClient {
  protected server: MCPServer;
  protected connected: boolean = false;
  protected requestId: number = 0;
  protected eventHandlers: Map<keyof MCPClientEvents, Set<Function>> = new Map();

  constructor(server: MCPServer) {
    this.server = server;
  }

  /**
   * Connect to the MCP server
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the MCP server
   */
  abstract disconnect(): Promise<void>;

  /**
   * Send a request to the MCP server
   */
  abstract sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse>;

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get server info
   */
  getServer(): MCPServer {
    return this.server;
  }

  /**
   * Initialize the connection (handshake)
   */
  async initialize(): Promise<{ serverInfo: unknown; capabilities: unknown }> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: false },
        sampling: {},
      },
      clientInfo: {
        name: 'ai-brainstorm',
        version: '1.0.0',
      },
    });

    if (response.error) {
      throw new Error(`MCP initialization failed: ${response.error.message}`);
    }

    // Send initialized notification
    await this.sendRequest('notifications/initialized', {});

    return response.result as { serverInfo: unknown; capabilities: unknown };
  }

  /**
   * List available tools from the server
   */
  async listTools(): Promise<MCPTool[]> {
    const response = await this.sendRequest('tools/list', {});

    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }

    const result = response.result as { tools: Array<{ name: string; description: string; inputSchema: object }> };
    return result.tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      return {
        content: [{ type: 'text', text: `Error: ${response.error.message}` }],
        isError: true,
      };
    }

    return response.result as MCPToolCallResult;
  }

  /**
   * Register an event handler
   */
  on<K extends keyof MCPClientEvents>(event: K, handler: MCPClientEvents[K]): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event handler
   */
  off<K extends keyof MCPClientEvents>(event: K, handler: MCPClientEvents[K]): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event
   */
  protected emit<K extends keyof MCPClientEvents>(event: K, ...args: Parameters<MCPClientEvents[K]>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          (handler as Function)(...args);
        } catch (error) {
          console.error(`[MCPClient] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Generate a unique request ID
   */
  protected nextRequestId(): number {
    return ++this.requestId;
  }
}

// ============================================
// HTTP/SSE MCP Client
// ============================================

export class HttpMCPClient extends BaseMCPClient {
  private endpoint: string;
  private authToken?: string;
  private eventSource: EventSource | null = null;
  private pendingRequests: Map<number | string, {
    resolve: (response: MCPResponse) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  constructor(server: MCPServer) {
    super(server);
    if (!server.endpoint) {
      throw new Error('HTTP MCP server requires an endpoint URL');
    }
    this.endpoint = server.endpoint;
    this.authToken = server.authToken;
  }

  /**
   * Build headers with optional auth token
   */
  private getHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...additionalHeaders };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Build SSE URL with optional auth token as query param
   * (EventSource doesn't support custom headers)
   */
  private getSseUrl(): string {
    const baseUrl = `${this.endpoint}/sse`;
    if (this.authToken) {
      const url = new URL(baseUrl);
      url.searchParams.set('token', this.authToken);
      return url.toString();
    }
    return baseUrl;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      // Test the connection with a simple request
      const response = await fetch(`${this.endpoint}/sse`, {
        method: 'GET',
        headers: this.getHeaders({
          'Accept': 'text/event-stream',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to connect: ${response.status} ${response.statusText}`);
      }

      // Set up SSE connection for server-sent events
      // Note: EventSource doesn't support custom headers, so we pass token as query param
      this.eventSource = new EventSource(this.getSseUrl());
      
      this.eventSource.onopen = () => {
        console.log(`[MCPClient] Connected to ${this.server.name}`);
        this.connected = true;
        this.emit('connected');
      };

      this.eventSource.onerror = (event) => {
        console.error(`[MCPClient] SSE error for ${this.server.name}:`, event);
        this.emit('error', new Error('SSE connection error'));
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as MCPResponse;
          this.handleResponse(data);
        } catch (error) {
          console.error('[MCPClient] Failed to parse SSE message:', error);
        }
      };

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        const onOpen = () => {
          clearTimeout(timeout);
          this.eventSource?.removeEventListener('open', onOpen);
          resolve();
        };

        const onError = () => {
          clearTimeout(timeout);
          this.eventSource?.removeEventListener('error', onError);
          reject(new Error('Failed to establish SSE connection'));
        };

        this.eventSource?.addEventListener('open', onOpen);
        this.eventSource?.addEventListener('error', onError);
      });

      this.connected = true;
    } catch (error) {
      this.connected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();

    this.connected = false;
    this.emit('disconnected');
    console.log(`[MCPClient] Disconnected from ${this.server.name}`);
  }

  async sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    const id = this.nextRequestId();
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    // For notifications (methods starting with 'notifications/'), we don't expect a response
    if (method.startsWith('notifications/')) {
      await this.sendHttpRequest(request);
      return { jsonrpc: '2.0', id, result: {} };
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for method: ${method}`));
      }, this.REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      
      this.sendHttpRequest(request).catch(error => {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private async sendHttpRequest(request: MCPRequest): Promise<void> {
    const response = await fetch(`${this.endpoint}/message`, {
      method: 'POST',
      headers: this.getHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
    }

    // For synchronous endpoints, handle the response directly
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await response.json() as MCPResponse;
      this.handleResponse(data);
    }
  }

  private handleResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(response.id);
      pending.resolve(response);
    }
  }
}

// ============================================
// Stdio MCP Client (Browser Limitation Notice)
// ============================================

/**
 * StdioMCPClient - Placeholder for stdio transport
 * 
 * In browser environments, we cannot directly spawn local processes.
 * To use stdio MCP servers, you would need:
 * 1. A backend proxy service that spawns the process
 * 2. WebSocket/HTTP bridge to communicate with it
 * 
 * This implementation provides stub methods that return appropriate errors.
 * For a full implementation, consider:
 * - Running a local Express/FastAPI server as a proxy
 * - Using Electron's main process for IPC
 * - Deploying an MCP gateway service
 */
export class StdioMCPClient extends BaseMCPClient {
  private command: string;
  private args: string[];
  private env: Record<string, string>;

  constructor(server: MCPServer) {
    super(server);
    if (!server.command) {
      throw new Error('Stdio MCP server requires a command');
    }
    this.command = server.command;
    this.args = server.args || [];
    this.env = server.env || {};
  }

  async connect(): Promise<void> {
    // In a browser environment, we cannot spawn processes
    // This would need a backend proxy to work
    throw new Error(
      'Stdio transport is not supported in browser environments. ' +
      'Consider using HTTP transport or setting up a backend MCP proxy.'
    );
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.emit('disconnected');
  }

  async sendRequest(_method: string, _params?: Record<string, unknown>): Promise<MCPResponse> {
    throw new Error('Stdio client is not connected');
  }

  /**
   * Get the command configuration for external use (e.g., backend proxy)
   */
  getCommandConfig(): { command: string; args: string[]; env: Record<string, string> } {
    return {
      command: this.command,
      args: this.args,
      env: this.env,
    };
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an MCP client for the given server configuration
 */
export function createMCPClient(server: MCPServer): BaseMCPClient {
  switch (server.transport) {
    case 'http':
      return new HttpMCPClient(server);
    case 'stdio':
      return new StdioMCPClient(server);
    default:
      throw new Error(`Unknown transport type: ${server.transport}`);
  }
}

/**
 * Test connection to an MCP server
 * Returns the list of tools on success, throws on failure
 */
export async function testMCPConnection(server: MCPServer): Promise<MCPTool[]> {
  const client = createMCPClient(server);
  
  try {
    await client.connect();
    await client.initialize();
    const tools = await client.listTools();
    await client.disconnect();
    return tools;
  } catch (error) {
    await client.disconnect().catch(() => {}); // Ignore disconnect errors
    throw error;
  }
}

