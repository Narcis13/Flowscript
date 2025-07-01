/**
 * Context-related type definitions
 */

import { StateManager } from '../state';

/**
 * Represents the execution context passed to nodes
 */
export interface ExecutionContext {
  /** Current workflow state */
  state: StateManager;
  
  /** Node-specific configuration */
  config?: Record<string, any>;
  
  /** Runtime information */
  runtime: {
    workflowId: string;
    executionId: string;
    nodeId: string;
    timestamp: number;
  };
  
  /** Previous node's output data */
  previousData?: any;
}