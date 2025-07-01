/**
 * Node-related type definitions
 */

import { ExecutionContext } from './context';

/**
 * Represents a single edge with optional lazy-evaluated data
 */
export interface Edge {
  /** Name of the edge (e.g., "next", "true", "false") */
  name: string;
  
  /** Lazy evaluation function for edge data */
  data?: () => Promise<any>;
}

/**
 * Map of edge names to Edge objects
 */
export interface EdgeMap {
  [edgeName: string]: Edge;
}

/**
 * Simple edge map with lazy evaluation functions (as per spec)
 */
export interface SimpleEdgeMap {
  [edgeName: string]: () => any;
}

/**
 * AI hints for node metadata
 */
export interface AIHints {
  purpose: string;
  when_to_use: string;
  expected_edges: string[];
  example_usage?: string;
}

/**
 * Human interaction configuration
 */
export interface HumanInteraction {
  formSchema?: any; // JSONSchema type
  uiHints?: any; // UIHints type
  timeout?: number;
}

/**
 * Node metadata
 */
export interface NodeMetadata {
  name: string;
  description: string;
  type?: 'action' | 'human' | 'control';
  ai_hints: AIHints;
  humanInteraction?: HumanInteraction;
}

/**
 * Base interface for all nodes (as per spec)
 */
export interface Node {
  /** Node metadata */
  metadata: NodeMetadata;
  
  /** Execute the node and return edges */
  execute(context: ExecutionContext): Promise<SimpleEdgeMap>;
}

/**
 * Represents the result of node execution
 */
export interface NodeExecutionResult {
  /** The edge map returned by the node */
  edges: EdgeMap;
  
  /** Updated state after execution */
  state?: Record<string, any>;
  
  /** Execution metadata */
  metadata?: {
    startTime: number;
    endTime: number;
    duration: number;
    error?: Error;
  };
}