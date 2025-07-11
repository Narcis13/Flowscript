/**
 * Node to MCP Tool Adapter
 * 
 * This adapter converts FlowScript nodes into MCP tools that can be called
 * by AI models. It handles the translation between FlowScript's node execution
 * model and MCP's tool invocation protocol.
 * 
 * Key responsibilities:
 * 1. Convert node metadata to MCP tool definitions
 * 2. Execute nodes in response to MCP tool calls
 * 3. Map node edges to appropriate MCP responses
 * 4. Handle errors and edge cases gracefully
 * 
 * @example
 * const adapter = new NodeToToolAdapter();
 * const tool = adapter.nodeToTool(httpRequestNode);
 * const result = await adapter.executeTool(httpRequestNode, params, context);
 */

import { Node, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { 
  MCPTool, 
  MCPCallToolResult,
  MCPCallToolParams 
} from '../server/MCPProtocol';
import { SchemaConverter } from './SchemaConverter';
import { StateManager } from '../../core/state/StateManager';

/**
 * Adapter context for tool execution
 * Provides necessary context for node execution within MCP
 */
export interface MCPAdapterContext {
  /** State manager instance */
  stateManager?: StateManager;
  
  /** Execution ID for tracking */
  executionId?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Edge mapping configuration
 * Defines how to handle different edge types
 */
export interface EdgeMappingConfig {
  /** Treat these edges as successful outcomes */
  successEdges: string[];
  
  /** Treat these edges as error outcomes */
  errorEdges: string[];
  
  /** Include edge name in response */
  includeEdgeName: boolean;
}

/**
 * Default edge mapping configurations for different node types
 */
const DEFAULT_EDGE_MAPPINGS: Record<string, EdgeMappingConfig> = {
  action: {
    successEdges: ['success', 'next', 'done', 'complete'],
    errorEdges: ['error', 'fail', 'failed', 'exception'],
    includeEdgeName: true
  },
  human: {
    successEdges: ['submitted', 'approved', 'completed'],
    errorEdges: ['rejected', 'timeout', 'cancelled'],
    includeEdgeName: true
  },
  control: {
    successEdges: ['true', 'match', 'continue'],
    errorEdges: ['false', 'nomatch', 'break'],
    includeEdgeName: true
  }
};

/**
 * Main Node to Tool Adapter class
 */
export class NodeToToolAdapter {
  private schemaConverter: typeof SchemaConverter;
  
  constructor() {
    this.schemaConverter = SchemaConverter;
  }
  
  /**
   * Convert a FlowScript node to an MCP tool definition
   * 
   * @param node - The FlowScript node to convert
   * @returns MCP tool definition
   */
  nodeToTool(node: Node): MCPTool {
    const metadata = node.metadata;
    
    // Generate tool name with flowscript prefix
    const toolName = `flowscript_${metadata.name}`;
    
    // Create comprehensive description including AI hints
    const description = this.createToolDescription(node);
    
    // Generate input schema for the tool
    const inputSchema = this.schemaConverter.nodeToJSONSchema(node, {
      includeExamples: true,
      includeAIHints: true
    });
    
    return {
      name: toolName,
      description,
      inputSchema: inputSchema as MCPTool['inputSchema']
    };
  }
  
  /**
   * Execute a node as an MCP tool
   * 
   * @param node - The FlowScript node to execute
   * @param params - Tool invocation parameters
   * @param context - Adapter context
   * @returns MCP tool result
   */
  async executeTool(
    node: Node,
    params: MCPCallToolParams,
    context: MCPAdapterContext = {}
  ): Promise<MCPCallToolResult> {
    try {
      // Create execution context for the node
      const executionContext = this.createExecutionContext(
        params.arguments || {},
        context
      );
      
      // Execute the node
      const edges = await node.execute(executionContext);
      
      // Map the edges to MCP response
      return this.mapEdgesToResponse(edges, node);
      
    } catch (error) {
      // Handle execution errors
      return this.createErrorResponse(error);
    }
  }
  
  /**
   * Create a comprehensive tool description from node metadata
   */
  private createToolDescription(node: Node): string {
    const metadata = node.metadata;
    const hints = metadata.ai_hints;
    
    // Build a rich description that helps AI understand the tool
    const parts: string[] = [
      metadata.description,
      `Purpose: ${hints.purpose}`,
      `Use when: ${hints.when_to_use}`
    ];
    
    // Add expected outcomes
    if (hints.expected_edges.length > 0) {
      parts.push(`Possible outcomes: ${hints.expected_edges.join(', ')}`);
    }
    
    // Add example usage if available
    if (hints.example_usage) {
      parts.push(`Example: ${hints.example_usage}`);
    }
    
    // Add node type information
    if (metadata.type) {
      parts.push(`Type: ${metadata.type} node`);
    }
    
    // Add human interaction note if applicable
    if (metadata.humanInteraction) {
      parts.push('Note: This node requires human interaction');
    }
    
    return parts.join('. ');
  }
  
  /**
   * Create an execution context for node execution
   */
  private createExecutionContext(
    config: Record<string, any>,
    adapterContext: MCPAdapterContext
  ): ExecutionContext {
    // Get or create state manager
    const stateManager = adapterContext.stateManager || new StateManager();
    
    // Create execution ID if not provided
    const executionId = adapterContext.executionId || `mcp-${Date.now()}`;
    
    // Initialize state if needed
    if (!stateManager.hasExecution(executionId)) {
      stateManager.createExecution({
        id: 'mcp-workflow',
        name: 'MCP Tool Execution',
        initialState: {},
        nodes: []
      }, executionId);
    }
    
    return {
      state: stateManager.getState(executionId),
      config,
      executionId,
      updateState: async (updates) => {
        await stateManager.updateState(executionId, updates);
      }
    };
  }
  
  /**
   * Map node execution edges to MCP tool result
   */
  private async mapEdgesToResponse(
    edges: SimpleEdgeMap,
    node: Node
  ): Promise<MCPCallToolResult> {
    const edgeNames = Object.keys(edges);
    
    // Get edge mapping config for this node type
    const mappingConfig = this.getEdgeMappingConfig(node);
    
    // Determine primary edge (first one returned)
    const primaryEdge = edgeNames[0];
    if (!primaryEdge) {
      return {
        content: [{
          type: 'text',
          text: 'Node execution completed with no edges'
        }]
      };
    }
    
    // Execute the edge's lazy evaluation function
    const edgeData = await this.evaluateEdge(edges[primaryEdge]);
    
    // Determine if this is an error edge
    const isError = mappingConfig.errorEdges.includes(primaryEdge);
    
    // Format the response
    const content: MCPCallToolResult['content'] = [];
    
    // Add main content
    if (edgeData !== undefined && edgeData !== null) {
      content.push({
        type: 'text',
        text: this.formatEdgeData(edgeData, primaryEdge, mappingConfig)
      });
    }
    
    // Add edge information if configured
    if (mappingConfig.includeEdgeName) {
      content.push({
        type: 'text',
        text: `Edge: ${primaryEdge}`
      });
    }
    
    // Add information about other available edges
    if (edgeNames.length > 1) {
      content.push({
        type: 'text',
        text: `Other edges available: ${edgeNames.slice(1).join(', ')}`
      });
    }
    
    return {
      content,
      isError
    };
  }
  
  /**
   * Get edge mapping configuration for a node
   */
  private getEdgeMappingConfig(node: Node): EdgeMappingConfig {
    const nodeType = node.metadata.type || 'action';
    return DEFAULT_EDGE_MAPPINGS[nodeType] || DEFAULT_EDGE_MAPPINGS.action;
  }
  
  /**
   * Evaluate an edge's lazy function
   */
  private async evaluateEdge(edgeFn: () => any): Promise<any> {
    try {
      const result = edgeFn();
      // Handle both sync and async edge functions
      return result instanceof Promise ? await result : result;
    } catch (error) {
      console.error('Error evaluating edge:', error);
      return {
        error: 'Edge evaluation failed',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Format edge data for MCP response
   */
  private formatEdgeData(
    data: any,
    edgeName: string,
    config: EdgeMappingConfig
  ): string {
    // Handle different data types
    if (typeof data === 'string') {
      return data;
    }
    
    if (typeof data === 'object' && data !== null) {
      // Special handling for common patterns
      if ('message' in data) {
        return data.message;
      }
      
      if ('error' in data) {
        return `Error: ${data.error}`;
      }
      
      if ('result' in data) {
        return JSON.stringify(data.result, null, 2);
      }
      
      // Default object serialization
      return JSON.stringify(data, null, 2);
    }
    
    // Primitive values
    return String(data);
  }
  
  /**
   * Create an error response for MCP
   */
  private createErrorResponse(error: any): MCPCallToolResult {
    const errorMessage = error instanceof Error 
      ? error.message 
      : String(error);
    
    const errorDetails = error instanceof Error && error.stack
      ? `\nStack trace:\n${error.stack}`
      : '';
    
    return {
      content: [{
        type: 'text',
        text: `Node execution failed: ${errorMessage}${errorDetails}`
      }],
      isError: true
    };
  }
  
  /**
   * Batch convert multiple nodes to tools
   * Useful for registering all nodes at once
   */
  batchNodeToTools(nodes: Node[]): MCPTool[] {
    return nodes.map(node => this.nodeToTool(node));
  }
  
  /**
   * Validate tool parameters before execution
   * This helps provide better error messages to the AI
   */
  validateToolParams(
    node: Node,
    params: MCPCallToolParams
  ): { valid: boolean; errors?: string[] } {
    const schema = this.schemaConverter.nodeToJSONSchema(node);
    return this.schemaConverter.validateConfig(
      params.arguments || {},
      schema
    );
  }
}