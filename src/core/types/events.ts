/**
 * Event-related type definitions
 */

/**
 * Event types for workflow execution
 */
export enum WorkflowEvent {
  STARTED = 'workflow:started',
  NODE_EXECUTING = 'node:executing',
  NODE_COMPLETED = 'node:completed',
  NODE_FAILED = 'node:failed',
  WORKFLOW_PAUSED = 'workflow:paused',
  WORKFLOW_RESUMED = 'workflow:resumed',
  WORKFLOW_COMPLETED = 'workflow:completed',
  WORKFLOW_FAILED = 'workflow:failed',
  STATE_UPDATED = 'state:updated',
  HUMAN_INPUT_REQUIRED = 'human:input:required',
  HUMAN_INPUT_RECEIVED = 'human:input:received'
}

/**
 * Event payload for workflow events
 */
export interface WorkflowEventPayload {
  workflowId: string;
  executionId: string;
  event: WorkflowEvent;
  timestamp: number;
  data?: any;
}