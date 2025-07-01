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
 * Base interface for all nodes
 */
export interface Node {
  /** Unique identifier for the node */
  id: string;
  
  /** Type of the node (e.g., "action", "condition", "human") */
  type: string;
  
  /** Optional display name */
  name?: string;
  
  /** Node-specific configuration */
  config?: Record<string, any>;
  
  /** Execute the node and return edges */
  execute(context: ExecutionContext): Promise<EdgeMap>;
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