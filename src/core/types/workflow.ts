/**
 * Workflow-related type definitions
 */

import { Node } from './node';

/**
 * Types of flow elements
 */
export type FlowElement = 
  | Node
  | BranchElement
  | LoopElement;

/**
 * Branch control structure
 */
export interface BranchElement {
  type: 'branch';
  condition: Node;
  branches: BranchMap;
}

/**
 * Map of edge names to node sequences
 */
export interface BranchMap {
  [edgeName: string]: FlowElement[];
}

/**
 * Loop control structure
 */
export interface LoopElement {
  type: 'loop';
  controller: Node;
  body: FlowElement[];
}

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
  
  /** Array of flow elements */
  elements: FlowElement[];
  
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