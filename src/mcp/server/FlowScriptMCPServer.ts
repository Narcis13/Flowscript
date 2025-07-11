/**
 * FlowScript MCP Server Implementation
 * 
 * This is the main MCP server that exposes FlowScript capabilities to AI models.
 * It implements the MCP protocol and provides a comprehensive set of tools for
 * interacting with FlowScript workflows.
 * 
 * Architecture:
 * 1. Auto-discovers all registered FlowScript nodes
 * 2. Converts nodes to MCP tools using adapters
 * 3. Handles JSON-RPC communication
 * 4. Manages server lifecycle and state
 * 
 * This implementation serves as a reference for MCP server development,
 * with extensive comments explaining each aspect of the protocol.
 * 
 * @example
 * const server = new FlowScriptMCPServer();
 * await server.start(transport);
 */

import {
  MCPServer,
  MCPServerCapabilities,
  MCPInitializeParams,
  MCPInitializeResult,
  MCPListToolsResult,
  MCPCallToolParams,
  MCPCallToolResult,
  MCPTransport,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPMethod,
  createSuccessResponse,
  createErrorResponse,
  JSONRPCErrorCode,
  MCPErrorCode,
  MCPTool
} from './MCPProtocol';

import { NodeToToolAdapter, EdgeResponseMapper } from '../adapters';
import { getNodeRegistry, NodeRegistry } from '../../nodes/registry';
import { Node } from '../../core/types/node';
import { StateManager } from '../../core/state/StateManager';
import { NodeDiscoveryTool, WorkflowComposerTool, WorkflowValidatorTool } from '../tools';

/**
 * Server configuration options
 */
export interface FlowScriptMCPServerOptions {
  /** Server name (defaults to 'flowscript-mcp') */
  serverName?: string;
  
  /** Server version */
  serverVersion?: string;
  
  /** Enable verbose logging */
  verbose?: boolean;
  
  /** Custom state manager instance */
  stateManager?: StateManager;
  
  /** Include built-in workflow tools */
  includeWorkflowTools?: boolean;
}

/**
 * Main FlowScript MCP Server class
 */
export class FlowScriptMCPServer implements MCPServer {
  // Server information
  readonly serverInfo: {
    name: string;
    version: string;
  };
  
  // Server capabilities declaration
  readonly capabilities: MCPServerCapabilities = {
    tools: true,
    resources: false, // Phase 3
    prompts: false,   // Phase 5
    logging: true
  };
  
  // Internal components
  private nodeRegistry: NodeRegistry;
  private nodeAdapter: NodeToToolAdapter;
  private edgeMapper: EdgeResponseMapper;
  private stateManager: StateManager;
  private transport?: MCPTransport;
  
  // Server state
  private isInitialized: boolean = false;
  private registeredTools: Map<string, Node> = new Map();
  private options: FlowScriptMCPServerOptions;
  
  constructor(options: FlowScriptMCPServerOptions = {}) {
    this.options = {
      serverName: 'flowscript-mcp',
      serverVersion: '1.0.0',
      verbose: false,
      includeWorkflowTools: true,
      ...options
    };
    
    this.serverInfo = {
      name: this.options.serverName!,
      version: this.options.serverVersion!
    };
    
    // Initialize components
    this.nodeRegistry = getNodeRegistry();
    this.nodeAdapter = new NodeToToolAdapter();
    this.edgeMapper = new EdgeResponseMapper({
      prettyPrint: true,
      includeTypes: this.options.verbose
    });
    this.stateManager = this.options.stateManager || new StateManager();
  }
  
  /**
   * Initialize the MCP server
   * Called when a client connects and sends the initialize request
   */
  async initialize(params: MCPInitializeParams): Promise<MCPInitializeResult> {
    this.log('Initializing FlowScript MCP Server', params);
    
    // Validate protocol version
    if (params.protocolVersion !== '2024-11-15') {
      this.log('Warning: Protocol version mismatch', {
        requested: params.protocolVersion,
        supported: '2024-11-15'
      });
    }
    
    // Load and register all FlowScript nodes as tools
    await this.loadFlowScriptNodes();
    
    // Add built-in workflow tools if enabled
    if (this.options.includeWorkflowTools) {
      await this.registerWorkflowTools();
    }
    
    this.isInitialized = true;
    
    return {
      protocolVersion: '2024-11-15',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo
    };
  }
  
  /**
   * List all available tools
   * Returns all FlowScript nodes as MCP tools
   */
  async listTools(): Promise<MCPListToolsResult> {
    this.ensureInitialized();
    
    const tools: MCPTool[] = [];
    
    // Convert all registered nodes to tools
    for (const [toolName, node] of this.registeredTools) {
      const tool = this.nodeAdapter.nodeToTool(node);
      tools.push(tool);
    }
    
    this.log(`Listing ${tools.length} tools`);
    
    return { tools };
  }
  
  /**
   * Call a tool (execute a FlowScript node)
   * This is the main method that AI models use to invoke functionality
   */
  async callTool(params: MCPCallToolParams): Promise<MCPCallToolResult> {
    this.ensureInitialized();
    
    this.log('Tool call requested', params);
    
    // Extract node name from tool name (remove 'flowscript_' prefix)
    const nodeName = params.name.startsWith('flowscript_')
      ? params.name.substring('flowscript_'.length)
      : params.name;
    
    // Find the corresponding node
    const node = this.registeredTools.get(params.name);
    if (!node) {
      throw this.createToolNotFoundError(params.name);
    }
    
    // Validate parameters
    const validation = this.nodeAdapter.validateToolParams(node, params);
    if (!validation.valid) {
      throw this.createInvalidParamsError(validation.errors!);
    }
    
    try {
      // Execute the node using the adapter
      const result = await this.nodeAdapter.executeTool(node, params, {
        stateManager: this.stateManager,
        executionId: `mcp-${Date.now()}`
      });
      
      this.log('Tool execution completed', {
        tool: params.name,
        isError: result.isError
      });
      
      return result;
      
    } catch (error) {
      this.log('Tool execution failed', { tool: params.name, error });
      
      // Convert execution errors to MCP format
      return {
        content: [{
          type: 'text',
          text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }
  
  /**
   * Start the MCP server with a transport
   * The transport handles the actual message passing (stdio, websocket, etc.)
   */
  async start(transport: MCPTransport): Promise<void> {
    this.transport = transport;
    
    // Register message handler
    transport.onMessage(async (message: JSONRPCRequest) => {
      const response = await this.handleMessage(message);
      if (response) {
        await transport.send(response);
      }
    });
    
    this.log('FlowScript MCP Server started');
  }
  
  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }
    
    this.isInitialized = false;
    this.registeredTools.clear();
    
    this.log('FlowScript MCP Server stopped');
  }
  
  /**
   * Handle incoming JSON-RPC messages
   * This is the main message router for the MCP protocol
   */
  private async handleMessage(message: JSONRPCRequest): Promise<JSONRPCResponse | null> {
    this.log('Received message', { method: message.method, id: message.id });
    
    try {
      // Route based on method
      switch (message.method) {
        case MCPMethod.INITIALIZE:
          const initResult = await this.initialize(message.params);
          return createSuccessResponse(message.id, initResult);
          
        case MCPMethod.LIST_TOOLS:
          const tools = await this.listTools();
          return createSuccessResponse(message.id, tools);
          
        case MCPMethod.CALL_TOOL:
          const result = await this.callTool(message.params);
          return createSuccessResponse(message.id, result);
          
        case MCPMethod.SET_LOG_LEVEL:
          // Handle log level changes if needed
          return createSuccessResponse(message.id, { success: true });
          
        default:
          return createErrorResponse(
            message.id,
            JSONRPCErrorCode.METHOD_NOT_FOUND,
            `Method not found: ${message.method}`
          );
      }
    } catch (error) {
      this.log('Error handling message', { method: message.method, error });
      
      // Convert errors to JSON-RPC format
      if (error instanceof Error && 'code' in error) {
        return createErrorResponse(
          message.id,
          (error as any).code,
          error.message,
          (error as any).data
        );
      }
      
      return createErrorResponse(
        message.id,
        JSONRPCErrorCode.INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  
  /**
   * Load all FlowScript nodes from the registry
   * This auto-discovers nodes and makes them available as MCP tools
   */
  private async loadFlowScriptNodes(): Promise<void> {
    const nodeNames = this.nodeRegistry.getAllNodeNames();
    
    this.log(`Loading ${nodeNames.length} FlowScript nodes`);
    
    for (const nodeName of nodeNames) {
      try {
        const node = this.nodeRegistry.create(nodeName);
        const tool = this.nodeAdapter.nodeToTool(node);
        
        this.registeredTools.set(tool.name, node);
        
        this.log(`Registered node as tool: ${tool.name}`);
      } catch (error) {
        this.log(`Failed to register node: ${nodeName}`, error);
      }
    }
  }
  
  /**
   * Register built-in workflow tools (Phase 2)
   * These are special tools for workflow composition and discovery
   */
  private async registerWorkflowTools(): Promise<void> {
    this.log('Registering workflow tools');
    
    // Register node discovery tool
    const discoveryTool = new NodeDiscoveryTool(this.nodeRegistry);
    const discoveryMCPTool = this.nodeAdapter.nodeToTool(discoveryTool);
    this.registeredTools.set(discoveryMCPTool.name, discoveryTool);
    this.log(`Registered workflow tool: ${discoveryMCPTool.name}`);
    
    // Register workflow composer tool
    const composerTool = new WorkflowComposerTool(this.nodeRegistry);
    const composerMCPTool = this.nodeAdapter.nodeToTool(composerTool);
    this.registeredTools.set(composerMCPTool.name, composerTool);
    this.log(`Registered workflow tool: ${composerMCPTool.name}`);
    
    // Register workflow validator tool
    const validatorTool = new WorkflowValidatorTool(this.nodeRegistry);
    const validatorMCPTool = this.nodeAdapter.nodeToTool(validatorTool);
    this.registeredTools.set(validatorMCPTool.name, validatorTool);
    this.log(`Registered workflow tool: ${validatorMCPTool.name}`);
  }
  
  /**
   * Ensure the server is initialized before handling requests
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Server not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Create a tool not found error
   */
  private createToolNotFoundError(toolName: string): Error {
    const error = new Error(`Tool not found: ${toolName}`) as any;
    error.code = MCPErrorCode.TOOL_NOT_FOUND;
    error.data = {
      toolName,
      availableTools: Array.from(this.registeredTools.keys())
    };
    return error;
  }
  
  /**
   * Create an invalid parameters error
   */
  private createInvalidParamsError(errors: string[]): Error {
    const error = new Error(`Invalid tool parameters: ${errors.join(', ')}`) as any;
    error.code = JSONRPCErrorCode.INVALID_PARAMS;
    error.data = { validationErrors: errors };
    return error;
  }
  
  /**
   * Log messages (can be extended to use proper logging framework)
   */
  private log(message: string, data?: any): void {
    if (this.options.verbose) {
      console.log(`[FlowScript MCP] ${message}`, data ? data : '');
    }
  }
  
  /**
   * Get server statistics (useful for monitoring)
   */
  getStats(): {
    isRunning: boolean;
    toolCount: number;
    uptime: number;
  } {
    return {
      isRunning: this.isInitialized,
      toolCount: this.registeredTools.size,
      uptime: 0 // Would track actual uptime in production
    };
  }
}