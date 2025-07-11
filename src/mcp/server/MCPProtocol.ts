/**
 * Model Context Protocol (MCP) Type Definitions and Protocol Implementation
 * 
 * This file serves as a comprehensive reference for the MCP protocol,
 * defining all the types and interfaces needed to implement an MCP server.
 * 
 * MCP (Model Context Protocol) is Anthropic's open standard that enables
 * seamless integration between LLM applications and external data sources/tools.
 * 
 * Key MCP Concepts:
 * 1. Tools: Functions that AI models can invoke (model-controlled)
 * 2. Resources: Content that can be read by the AI (application-controlled)  
 * 3. Prompts: Templates for common interactions (user-controlled)
 * 
 * @see https://modelcontextprotocol.io/docs
 */

/**
 * JSON-RPC 2.0 Message Types
 * MCP uses JSON-RPC 2.0 as its transport protocol
 */
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

/**
 * MCP Tool Definition
 * Tools are functions that AI models can invoke to perform actions
 * 
 * Example tool:
 * {
 *   name: "get_weather",
 *   description: "Get current weather for a location",
 *   inputSchema: {
 *     type: "object",
 *     properties: {
 *       location: { type: "string", description: "City name" }
 *     },
 *     required: ["location"]
 *   }
 * }
 */
export interface MCPTool {
  /** Unique identifier for the tool */
  name: string;
  
  /** Human-readable description of what the tool does */
  description: string;
  
  /** JSON Schema defining the tool's input parameters */
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * MCP Tool Result
 * The response returned after executing a tool
 */
export interface MCPToolResult {
  /** The actual result data */
  content: any;
  
  /** Optional metadata about the execution */
  metadata?: {
    executionTime?: number;
    warnings?: string[];
    [key: string]: any;
  };
}

/**
 * MCP Resource Definition
 * Resources are content that can be read by the AI model
 * 
 * Example resource:
 * {
 *   uri: "file:///path/to/document.md",
 *   name: "Project README",
 *   mimeType: "text/markdown",
 *   description: "Main project documentation"
 * }
 */
export interface MCPResource {
  /** Unique URI for the resource */
  uri: string;
  
  /** Human-readable name */
  name: string;
  
  /** MIME type of the content */
  mimeType: string;
  
  /** Optional description */
  description?: string;
}

/**
 * MCP Prompt Definition
 * Prompts are templates for common interactions
 * 
 * Example prompt:
 * {
 *   name: "debug_error",
 *   description: "Help debug an error message",
 *   arguments: [
 *     { name: "error", description: "The error message" },
 *     { name: "context", description: "Code context where error occurred" }
 *   ],
 *   template: "Debug this error: {{error}}\\nContext: {{context}}"
 * }
 */
export interface MCPPrompt {
  /** Unique identifier */
  name: string;
  
  /** Human-readable description */
  description: string;
  
  /** Arguments that can be filled in the template */
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
  
  /** Template string with {{argument}} placeholders */
  template: string;
}

/**
 * MCP Server Capabilities
 * Declares what features this MCP server supports
 */
export interface MCPServerCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  logging?: boolean;
}

/**
 * MCP Protocol Methods
 * These are the JSON-RPC methods that an MCP server must implement
 */
export enum MCPMethod {
  // Server information
  INITIALIZE = 'initialize',
  
  // Tool-related methods
  LIST_TOOLS = 'tools/list',
  CALL_TOOL = 'tools/call',
  
  // Resource-related methods
  LIST_RESOURCES = 'resources/list',
  READ_RESOURCE = 'resources/read',
  
  // Prompt-related methods
  LIST_PROMPTS = 'prompts/list',
  GET_PROMPT = 'prompts/get',
  
  // Logging methods
  SET_LOG_LEVEL = 'logging/setLevel',
}

/**
 * MCP Initialize Request Parameters
 */
export interface MCPInitializeParams {
  /** Protocol version */
  protocolVersion: string;
  
  /** Client capabilities */
  capabilities: {
    experimental?: Record<string, any>;
  };
  
  /** Client information */
  clientInfo: {
    name: string;
    version?: string;
  };
}

/**
 * MCP Initialize Response
 */
export interface MCPInitializeResult {
  /** Protocol version */
  protocolVersion: string;
  
  /** Server capabilities */
  capabilities: MCPServerCapabilities;
  
  /** Server information */
  serverInfo: {
    name: string;
    version?: string;
  };
}

/**
 * MCP List Tools Response
 */
export interface MCPListToolsResult {
  tools: MCPTool[];
}

/**
 * MCP Call Tool Request Parameters
 */
export interface MCPCallToolParams {
  /** Name of the tool to call */
  name: string;
  
  /** Arguments to pass to the tool */
  arguments?: Record<string, any>;
}

/**
 * MCP Call Tool Response
 */
export interface MCPCallToolResult {
  /** Tool execution result */
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string; // base64 for images
    resource?: MCPResource;
  }>;
  
  /** Whether the tool call resulted in an error */
  isError?: boolean;
}

/**
 * MCP List Resources Response
 */
export interface MCPListResourcesResult {
  resources: MCPResource[];
}

/**
 * MCP Read Resource Request Parameters
 */
export interface MCPReadResourceParams {
  /** URI of the resource to read */
  uri: string;
}

/**
 * MCP Read Resource Response
 */
export interface MCPReadResourceResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string; // base64
  }>;
}

/**
 * MCP List Prompts Response
 */
export interface MCPListPromptsResult {
  prompts: MCPPrompt[];
}

/**
 * MCP Get Prompt Request Parameters
 */
export interface MCPGetPromptParams {
  /** Name of the prompt to get */
  name: string;
  
  /** Arguments to fill in the template */
  arguments?: Record<string, string>;
}

/**
 * MCP Get Prompt Response
 */
export interface MCPGetPromptResult {
  /** Description of the prompt */
  description: string;
  
  /** Filled-in prompt text */
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}

/**
 * MCP Transport Interface
 * Defines how messages are sent and received
 */
export interface MCPTransport {
  /** Send a message to the client */
  send(message: JSONRPCRequest | JSONRPCResponse): Promise<void>;
  
  /** Register a handler for incoming messages */
  onMessage(handler: (message: JSONRPCRequest) => void): void;
  
  /** Close the transport */
  close(): Promise<void>;
}

/**
 * MCP Server Interface
 * Main interface that all MCP servers must implement
 */
export interface MCPServer {
  /** Server name and version */
  serverInfo: {
    name: string;
    version: string;
  };
  
  /** Server capabilities */
  capabilities: MCPServerCapabilities;
  
  /** Initialize the server */
  initialize(params: MCPInitializeParams): Promise<MCPInitializeResult>;
  
  /** List available tools */
  listTools(): Promise<MCPListToolsResult>;
  
  /** Call a tool */
  callTool(params: MCPCallToolParams): Promise<MCPCallToolResult>;
  
  /** List available resources */
  listResources?(): Promise<MCPListResourcesResult>;
  
  /** Read a resource */
  readResource?(params: MCPReadResourceParams): Promise<MCPReadResourceResult>;
  
  /** List available prompts */
  listPrompts?(): Promise<MCPListPromptsResult>;
  
  /** Get a prompt */
  getPrompt?(params: MCPGetPromptParams): Promise<MCPGetPromptResult>;
  
  /** Start the server with a transport */
  start(transport: MCPTransport): Promise<void>;
  
  /** Stop the server */
  stop(): Promise<void>;
}

/**
 * Helper function to create a JSON-RPC error response
 */
export function createErrorResponse(
  id: string | number,
  code: number,
  message: string,
  data?: any
): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data
    }
  };
}

/**
 * Helper function to create a JSON-RPC success response
 */
export function createSuccessResponse(
  id: string | number,
  result: any
): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * Standard JSON-RPC error codes
 */
export const JSONRPCErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * MCP-specific error codes (custom range)
 */
export const MCPErrorCode = {
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_ERROR: -32002,
  RESOURCE_NOT_FOUND: -32003,
  RESOURCE_READ_ERROR: -32004,
  PROMPT_NOT_FOUND: -32005,
  INITIALIZATION_ERROR: -32006,
} as const;