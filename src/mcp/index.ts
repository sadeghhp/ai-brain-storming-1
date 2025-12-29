// ============================================
// AI Brainstorm - MCP Module Exports
// ============================================

export { 
  BaseMCPClient,
  HttpMCPClient,
  StdioMCPClient,
  createMCPClient,
  testMCPConnection,
  type MCPRequest,
  type MCPResponse,
  type MCPToolCallRequest,
  type MCPToolCallResult,
  type MCPClientEvents,
} from './mcp-client';

export {
  mcpRouter,
  buildToolDescriptions,
  parseToolCalls,
  formatToolResult,
} from './mcp-router';

