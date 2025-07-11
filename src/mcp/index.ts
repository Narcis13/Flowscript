/**
 * FlowScript MCP (Model Context Protocol) Integration
 * 
 * This module provides MCP server implementation for FlowScript, enabling
 * AI models to interact with the workflow engine through a standardized protocol.
 * 
 * ## Overview
 * 
 * The MCP integration exposes FlowScript's capabilities in three ways:
 * 
 * 1. **Tools**: Every FlowScript node becomes an MCP tool that AI can invoke
 * 2. **Resources**: Workflow definitions and documentation (Phase 3)
 * 3. **Prompts**: Templates for common workflow patterns (Phase 5)
 * 
 * ## Architecture
 * 
 * ```
 * AI Assistant (Claude, etc.)
 *      ↓
 * MCP Protocol (JSON-RPC)
 *      ↓
 * FlowScript MCP Server
 *      ↓
 * Node Registry → Individual Nodes
 * ```
 * 
 * ## Usage
 * 
 * ### Starting the MCP Server
 * 
 * ```bash
 * # Development
 * npm run mcp:dev
 * 
 * # Production
 * npm run mcp:build
 * npm run mcp:start
 * ```
 * 
 * ### Configuring Claude Desktop
 * 
 * Add to your Claude Desktop configuration:
 * 
 * ```json
 * {
 *   "mcpServers": {
 *     "flowscript": {
 *       "command": "npx",
 *       "args": ["flowscript-mcp"]
 *     }
 *   }
 * }
 * ```
 * 
 * ## Available Tools
 * 
 * ### Node Execution Tools
 * - `flowscript_httpRequest` - Make HTTP requests
 * - `flowscript_validateData` - Validate data against schemas
 * - `flowscript_setData` - Update workflow state
 * - ... (all registered nodes)
 * 
 * ### Workflow Management Tools
 * - `flowscript_findNodes` - Discover nodes by task description
 * - `flowscript_composeWorkflow` - Create workflows from natural language
 * - `flowscript_validateWorkflow` - Validate workflow definitions
 * 
 * ## Implementation Reference
 * 
 * This implementation serves as a comprehensive reference for MCP development:
 * 
 * - Protocol implementation: `server/MCPProtocol.ts`
 * - Server implementation: `server/FlowScriptMCPServer.ts`
 * - Node adaptation: `adapters/NodeToToolAdapter.ts`
 * - Schema generation: `adapters/SchemaConverter.ts`
 * - Custom tools: `tools/` directory
 * 
 * Each file contains extensive documentation explaining MCP concepts.
 */

// Server exports
export * from './server';

// Adapter exports
export * from './adapters';

// Tool exports
export * from './tools';

// Re-export main server class for convenience
export { FlowScriptMCPServer } from './server/FlowScriptMCPServer';

// Export types for external use
export type {
  MCPTool,
  MCPToolResult,
  MCPServer,
  MCPTransport,
  JSONRPCRequest,
  JSONRPCResponse
} from './server/MCPProtocol';