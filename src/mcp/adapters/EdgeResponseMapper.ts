/**
 * Edge Response Mapper for FlowScript to MCP
 * 
 * This module handles the mapping of FlowScript edge responses to MCP-compatible
 * formats. It provides strategies for different types of edge data and ensures
 * that AI models receive well-structured, understandable responses.
 * 
 * Edge mapping is crucial because:
 * 1. FlowScript edges can contain complex data structures
 * 2. AI models need clear, textual representations
 * 3. Different edge types require different handling strategies
 * 
 * @example
 * const mapper = new EdgeResponseMapper();
 * const mcpResponse = mapper.mapEdgeToResponse(edge, context);
 */

import { Edge, SimpleEdgeMap } from '../../core/types/node';
import { MCPCallToolResult } from '../server/MCPProtocol';

/**
 * Edge mapping context
 */
export interface EdgeMappingContext {
  /** Node name that produced the edge */
  nodeName: string;
  
  /** Node type (action, human, control) */
  nodeType?: string;
  
  /** Whether to include detailed data */
  verbose?: boolean;
  
  /** Maximum depth for object serialization */
  maxDepth?: number;
}

/**
 * Edge data formatting options
 */
export interface EdgeFormattingOptions {
  /** Pretty print JSON objects */
  prettyPrint?: boolean;
  
  /** Include data types in output */
  includeTypes?: boolean;
  
  /** Maximum string length before truncation */
  maxStringLength?: number;
  
  /** Custom formatters for specific data types */
  customFormatters?: Record<string, (data: any) => string>;
}

/**
 * Common edge patterns in FlowScript
 */
export const EdgePatterns = {
  /** Success patterns */
  success: {
    names: ['success', 'next', 'done', 'complete', 'ok'],
    format: 'standard'
  },
  
  /** Error patterns */
  error: {
    names: ['error', 'fail', 'failed', 'exception', 'rejected'],
    format: 'error'
  },
  
  /** Control flow patterns */
  control: {
    names: ['true', 'false', 'match', 'nomatch', 'continue', 'break'],
    format: 'boolean'
  },
  
  /** Human interaction patterns */
  human: {
    names: ['submitted', 'approved', 'cancelled', 'timeout'],
    format: 'human'
  },
  
  /** Data processing patterns */
  data: {
    names: ['transformed', 'validated', 'processed', 'filtered'],
    format: 'data'
  }
} as const;

/**
 * Main Edge Response Mapper class
 */
export class EdgeResponseMapper {
  private formattingOptions: EdgeFormattingOptions;
  
  constructor(options: EdgeFormattingOptions = {}) {
    this.formattingOptions = {
      prettyPrint: true,
      includeTypes: false,
      maxStringLength: 1000,
      ...options
    };
  }
  
  /**
   * Map a single edge to MCP response content
   * 
   * @param edgeName - Name of the edge
   * @param edgeData - Data from the edge's lazy evaluation
   * @param context - Mapping context
   * @returns Formatted content for MCP response
   */
  mapEdgeToContent(
    edgeName: string,
    edgeData: any,
    context: EdgeMappingContext
  ): MCPCallToolResult['content'] {
    const content: MCPCallToolResult['content'] = [];
    
    // Determine edge pattern
    const pattern = this.identifyEdgePattern(edgeName);
    
    // Add main content based on pattern
    const formattedData = this.formatEdgeData(edgeData, pattern, context);
    if (formattedData) {
      content.push({
        type: 'text',
        text: formattedData
      });
    }
    
    // Add edge metadata if verbose
    if (context.verbose) {
      content.push({
        type: 'text',
        text: this.formatEdgeMetadata(edgeName, pattern, context)
      });
    }
    
    return content;
  }
  
  /**
   * Map multiple edges to a comprehensive response
   * Used when a node returns multiple edges
   */
  mapMultipleEdges(
    edges: SimpleEdgeMap,
    context: EdgeMappingContext
  ): MCPCallToolResult['content'] {
    const content: MCPCallToolResult['content'] = [];
    const edgeEntries = Object.entries(edges);
    
    // Add summary if multiple edges
    if (edgeEntries.length > 1) {
      content.push({
        type: 'text',
        text: `Node returned ${edgeEntries.length} edges: ${Object.keys(edges).join(', ')}`
      });
    }
    
    // Process each edge
    for (const [edgeName, edgeFn] of edgeEntries) {
      try {
        const edgeData = edgeFn();
        const edgeContent = this.mapEdgeToContent(edgeName, edgeData, context);
        
        // Add edge header for multiple edges
        if (edgeEntries.length > 1) {
          content.push({
            type: 'text',
            text: `\n[Edge: ${edgeName}]`
          });
        }
        
        content.push(...edgeContent);
      } catch (error) {
        content.push({
          type: 'text',
          text: `Error evaluating edge '${edgeName}': ${error}`
        });
      }
    }
    
    return content;
  }
  
  /**
   * Identify the pattern of an edge based on its name
   */
  private identifyEdgePattern(edgeName: string): keyof typeof EdgePatterns | 'unknown' {
    const lowerName = edgeName.toLowerCase();
    
    for (const [patternName, pattern] of Object.entries(EdgePatterns)) {
      if (pattern.names.some(name => lowerName.includes(name))) {
        return patternName as keyof typeof EdgePatterns;
      }
    }
    
    return 'unknown';
  }
  
  /**
   * Format edge data based on its pattern and content
   */
  private formatEdgeData(
    data: any,
    pattern: keyof typeof EdgePatterns | 'unknown',
    context: EdgeMappingContext
  ): string {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return 'No data returned';
    }
    
    // Apply pattern-specific formatting
    switch (pattern) {
      case 'error':
        return this.formatErrorData(data);
        
      case 'control':
        return this.formatControlData(data);
        
      case 'human':
        return this.formatHumanData(data);
        
      case 'data':
        return this.formatDataProcessingResult(data);
        
      case 'success':
      default:
        return this.formatGenericData(data);
    }
  }
  
  /**
   * Format error edge data
   */
  private formatErrorData(data: any): string {
    if (typeof data === 'string') {
      return `Error: ${data}`;
    }
    
    if (typeof data === 'object' && data !== null) {
      const parts: string[] = [];
      
      if (data.message) {
        parts.push(`Error: ${data.message}`);
      }
      
      if (data.code) {
        parts.push(`Code: ${data.code}`);
      }
      
      if (data.details) {
        parts.push(`Details: ${this.formatGenericData(data.details)}`);
      }
      
      return parts.join('\n');
    }
    
    return `Error occurred: ${this.formatGenericData(data)}`;
  }
  
  /**
   * Format control flow edge data
   */
  private formatControlData(data: any): string {
    // Boolean values
    if (typeof data === 'boolean') {
      return data ? 'Condition met' : 'Condition not met';
    }
    
    // Comparison results
    if (typeof data === 'object' && data !== null) {
      if ('matched' in data) {
        return data.matched ? 'Pattern matched' : 'Pattern did not match';
      }
      
      if ('value' in data && 'expected' in data) {
        return `Value: ${data.value}, Expected: ${data.expected}`;
      }
    }
    
    return this.formatGenericData(data);
  }
  
  /**
   * Format human interaction edge data
   */
  private formatHumanData(data: any): string {
    if (typeof data === 'object' && data !== null) {
      const parts: string[] = [];
      
      if (data.action) {
        parts.push(`Action: ${data.action}`);
      }
      
      if (data.input) {
        parts.push(`Input received: ${this.formatGenericData(data.input)}`);
      }
      
      if (data.timestamp) {
        parts.push(`Time: ${new Date(data.timestamp).toISOString()}`);
      }
      
      if (data.userId) {
        parts.push(`User: ${data.userId}`);
      }
      
      return parts.join('\n');
    }
    
    return this.formatGenericData(data);
  }
  
  /**
   * Format data processing result
   */
  private formatDataProcessingResult(data: any): string {
    if (typeof data === 'object' && data !== null) {
      const parts: string[] = [];
      
      if (data.count !== undefined) {
        parts.push(`Processed ${data.count} items`);
      }
      
      if (data.result) {
        parts.push(`Result: ${this.formatGenericData(data.result)}`);
      }
      
      if (data.duration) {
        parts.push(`Duration: ${data.duration}ms`);
      }
      
      if (data.summary) {
        parts.push(`Summary: ${data.summary}`);
      }
      
      return parts.join('\n');
    }
    
    return this.formatGenericData(data);
  }
  
  /**
   * Format generic data
   */
  private formatGenericData(data: any, depth: number = 0): string {
    const maxDepth = this.formattingOptions.maxDepth || 5;
    
    if (depth > maxDepth) {
      return '[Max depth reached]';
    }
    
    // String values
    if (typeof data === 'string') {
      const maxLen = this.formattingOptions.maxStringLength || 1000;
      return data.length > maxLen 
        ? `${data.substring(0, maxLen)}... (truncated)`
        : data;
    }
    
    // Primitive values
    if (typeof data !== 'object' || data === null) {
      return String(data);
    }
    
    // Arrays
    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      if (data.length > 10) {
        return `[Array with ${data.length} items]`;
      }
      return this.formattingOptions.prettyPrint
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
    }
    
    // Objects
    const keys = Object.keys(data);
    if (keys.length === 0) return '{}';
    
    // Special object types
    if (data instanceof Date) {
      return data.toISOString();
    }
    
    if (data instanceof Error) {
      return `Error: ${data.message}`;
    }
    
    // Regular objects
    if (this.formattingOptions.prettyPrint) {
      return JSON.stringify(data, null, 2);
    } else {
      return JSON.stringify(data);
    }
  }
  
  /**
   * Format edge metadata for verbose output
   */
  private formatEdgeMetadata(
    edgeName: string,
    pattern: keyof typeof EdgePatterns | 'unknown',
    context: EdgeMappingContext
  ): string {
    const parts: string[] = [
      `Edge: ${edgeName}`,
      `Pattern: ${pattern}`,
      `Node: ${context.nodeName}`
    ];
    
    if (context.nodeType) {
      parts.push(`Type: ${context.nodeType}`);
    }
    
    return `[${parts.join(', ')}]`;
  }
  
  /**
   * Determine if an edge represents an error condition
   */
  isErrorEdge(edgeName: string): boolean {
    const pattern = this.identifyEdgePattern(edgeName);
    return pattern === 'error';
  }
  
  /**
   * Create a summary of edge data for logging or debugging
   */
  createEdgeSummary(edges: SimpleEdgeMap): string {
    const edgeNames = Object.keys(edges);
    
    if (edgeNames.length === 0) {
      return 'No edges returned';
    }
    
    if (edgeNames.length === 1) {
      return `Edge: ${edgeNames[0]}`;
    }
    
    return `Edges: ${edgeNames.join(', ')}`;
  }
}