/**
 * Types for WebSocket event handling
 */

export interface WorkflowEventData {
  type: string;
  workflowId?: string;
  executionId?: string;
  timestamp?: number;
  nodeId?: string;
  nodeName?: string;
  edge?: string;
  data?: any;
  error?: string | Error;
  reason?: string;
  finalState?: Record<string, any>;
  nodeInfo?: any;
  path?: string;
  newValue?: any;
}