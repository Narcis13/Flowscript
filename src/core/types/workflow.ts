/**
 * Workflow-related type definitions
 */

/**
 * Types of flow elements according to specification
 */
export type FlowElement = 
  | string                                      // Simple node reference: "nodeName"
  | { [nodeName: string]: Record<string, any> } // Node with config: {"nodeName": {config}}
  | [FlowElement, BranchMap]                   // Branch structure: [condition, branches]
  | [LoopController, FlowElement[]];            // Loop structure: [controller, body]

/**
 * Map of edge names to flow elements or arrays of flow elements
 */
export interface BranchMap {
  [edgeName: string]: FlowElement | FlowElement[] | null;
}

/**
 * Loop controller can be a string or node with config
 */
export type LoopController = 
  | string                                      // Loop controller node name
  | { [nodeName: string]: Record<string, any> }; // Loop controller with config

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier */
  id: string;
  
  /** Workflow name */
  name: string;
  
  /** Initial state */
  initialState: Record<string, any>;
  
  /** Array of flow elements (nodes) */
  nodes: FlowElement[];
  
  /** Workflow metadata */
  metadata?: Record<string, any>;
}

/**
 * Workflow execution state
 */
export interface WorkflowState {
  /** Workflow definition ID */
  workflowId: string;
  
  /** Unique execution ID */
  executionId: string;
  
  /** Current execution status */
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  
  /** Current workflow state data */
  data: Record<string, any>;
  
  /** Current position in the workflow */
  position: {
    elementIndex: number;
    nodeId?: string;
    path: number[]; // Stack of indices for nested structures
  };
  
  /** Execution history */
  history: NodeExecutionResult[];
  
  /** Timestamps */
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Import needed type from node module
 */
import { NodeExecutionResult } from './node';