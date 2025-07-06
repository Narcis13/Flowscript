/**
 * ExecutionManager - Manages workflow execution lifecycle and state
 */

import { EventEmitter } from 'events';
import { WorkflowDefinition } from '../../core/types/workflow';
import { WorkflowExecutor, ExecutionResult } from '../../core/executor';
import { RuntimeContextImpl } from '../../core/runtime';
import { WorkflowEvent, WorkflowEventPayload } from '../../core/types/events';

/**
 * Execution status enum
 */
export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Execution metadata
 */
export interface ExecutionMetadata {
  executionId: string;
  workflowId: string;
  status: ExecutionStatus;
  startTime: number;
  endTime?: number;
  currentNodeId?: string;
  currentNodeName?: string;
  error?: string;
  pauseTokens: string[];
  state: Record<string, any>;
}

/**
 * Execution entry with all associated data
 */
interface ExecutionEntry {
  metadata: ExecutionMetadata;
  workflow: WorkflowDefinition;
  executor: WorkflowExecutor;
  eventEmitter: EventEmitter;
  runtimeContext?: RuntimeContextImpl;
  executionPromise?: Promise<ExecutionResult>;
}

/**
 * Manages workflow executions
 */
export class ExecutionManager extends EventEmitter {
  private executions: Map<string, ExecutionEntry> = new Map();
  private static instance: ExecutionManager;

  /**
   * Get singleton instance
   */
  static getInstance(): ExecutionManager {
    if (!ExecutionManager.instance) {
      ExecutionManager.instance = new ExecutionManager();
    }
    return ExecutionManager.instance;
  }

  /**
   * Start a new workflow execution
   */
  async startExecution(workflow: WorkflowDefinition, initialInput?: Record<string, any>): Promise<string> {
    const executionId = this.generateExecutionId();
    const eventEmitter = new EventEmitter();

    console.log(`Starting execution ${executionId} for workflow ${workflow.id}`);
    console.log('Initial input:', initialInput);

    // Create executor
    const executor = new WorkflowExecutor(workflow, { eventEmitter });

    // Create metadata
    const metadata: ExecutionMetadata = {
      executionId,
      workflowId: workflow.id,
      status: ExecutionStatus.PENDING,
      startTime: Date.now(),
      pauseTokens: [],
      state: initialInput || workflow.initialState || {}
    };

    // Store execution entry
    const entry: ExecutionEntry = {
      metadata,
      workflow,
      executor,
      eventEmitter
    };
    this.executions.set(executionId, entry);

    // Set up event listeners
    this.setupEventListeners(executionId, eventEmitter);

    // Emit event for new execution BEFORE starting execution
    // This gives EventBridge time to attach
    this.emit('execution_started', executionId);

    // Start execution asynchronously with a small delay
    // This ensures EventBridge has time to attach
    setTimeout(() => {
      this.executeWorkflow(executionId, initialInput);
    }, 10);

    return executionId;
  }

  /**
   * Resume a paused execution
   */
  async resumeExecution(executionId: string, nodeId: string, data: any): Promise<void> {
    const entry = this.executions.get(executionId);
    if (!entry) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (entry.metadata.status !== ExecutionStatus.PAUSED) {
      throw new Error(`Execution is not paused: ${executionId}`);
    }

    // Get runtime context from executor
    const runtimeContext = entry.executor.getRuntimeContext();
    if (!runtimeContext) {
      throw new Error(`Runtime context not available for execution: ${executionId}`);
    }

    // Find the pause token
    const pauseTokens = runtimeContext.getActivePauseTokens();
    const token = pauseTokens.find(t => t.nodeId === nodeId);
    
    if (!token) {
      throw new Error(`No pause token found for node: ${nodeId}`);
    }

    // Resume the execution
    try {
      runtimeContext.resume(token.id, data);
    } catch (error) {
      throw new Error(`Failed to resume execution: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get execution status
   */
  getExecutionStatus(executionId: string): ExecutionMetadata | null {
    const entry = this.executions.get(executionId);
    if (!entry) {
      return null;
    }

    // Update pause tokens if runtime context is available
    const runtimeContext = entry.executor.getRuntimeContext();
    if (runtimeContext) {
      const activePauseTokens = runtimeContext.getActivePauseTokens();
      entry.metadata.pauseTokens = activePauseTokens.map(t => t.id);
    }

    return { ...entry.metadata };
  }

  /**
   * Get all executions
   */
  getAllExecutions(): ExecutionMetadata[] {
    return Array.from(this.executions.values()).map(entry => ({ ...entry.metadata }));
  }

  /**
   * Get runtime context for an execution
   */
  getRuntime(executionId: string): { emitter: EventEmitter } | null {
    const entry = this.executions.get(executionId);
    if (!entry) return null;
    
    return {
      emitter: entry.eventEmitter
    };
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const entry = this.executions.get(executionId);
    if (!entry) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (entry.metadata.status === ExecutionStatus.COMPLETED || 
        entry.metadata.status === ExecutionStatus.FAILED ||
        entry.metadata.status === ExecutionStatus.CANCELLED) {
      throw new Error(`Execution already finished: ${executionId}`);
    }

    // Update status
    entry.metadata.status = ExecutionStatus.CANCELLED;
    entry.metadata.endTime = Date.now();

    // Cancel any active pause tokens
    const runtimeContext = entry.executor.getRuntimeContext();
    if (runtimeContext) {
      runtimeContext.clearPauseTokens();
    }
  }

  /**
   * Clean up completed executions (optional)
   */
  cleanupCompletedExecutions(olderThanMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [executionId, entry] of this.executions.entries()) {
      if (entry.metadata.endTime && 
          (now - entry.metadata.endTime) > olderThanMs &&
          (entry.metadata.status === ExecutionStatus.COMPLETED || 
           entry.metadata.status === ExecutionStatus.FAILED ||
           entry.metadata.status === ExecutionStatus.CANCELLED)) {
        this.executions.delete(executionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Execute workflow asynchronously
   */
  private async executeWorkflow(executionId: string, initialInput?: Record<string, any>): Promise<void> {
    const entry = this.executions.get(executionId);
    if (!entry) return;

    console.log(`Executing workflow ${entry.workflow.id} with execution ID ${executionId}`);

    try {
      // Update status to running
      entry.metadata.status = ExecutionStatus.RUNNING;

      // Use initialInput if provided, otherwise use workflow's initialState
      const stateToUse = initialInput && Object.keys(initialInput).length > 0 
        ? initialInput 
        : entry.workflow.initialState;
      
      console.log('Using initial state:', stateToUse);

      // Start execution
      console.log('Starting workflow executor...');
      const executionPromise = entry.executor.execute({ initialState: stateToUse });
      entry.executionPromise = executionPromise;

      // Wait for completion
      const result = await executionPromise;
      console.log('Workflow execution result:', result);

      // Update metadata based on result
      if (result.completed) {
        entry.metadata.status = ExecutionStatus.COMPLETED;
      } else if (result.error) {
        entry.metadata.status = ExecutionStatus.FAILED;
        entry.metadata.error = result.error.message;
      }
      entry.metadata.endTime = Date.now();
      entry.metadata.state = result.state;

    } catch (error) {
      // Handle unexpected errors
      entry.metadata.status = ExecutionStatus.FAILED;
      entry.metadata.error = error instanceof Error ? error.message : String(error);
      entry.metadata.endTime = Date.now();
    }
  }

  /**
   * Set up event listeners for workflow events
   */
  private setupEventListeners(executionId: string, eventEmitter: EventEmitter): void {
    // Listen for pause events
    eventEmitter.on(WorkflowEvent.WORKFLOW_PAUSED, (event: WorkflowEventPayload) => {
      const entry = this.executions.get(executionId);
      if (entry) {
        entry.metadata.status = ExecutionStatus.PAUSED;
        if (event.data?.nodeId) {
          entry.metadata.currentNodeId = event.data.nodeId;
        }
      }
    });

    // Listen for resume events
    eventEmitter.on(WorkflowEvent.WORKFLOW_RESUMED, () => {
      const entry = this.executions.get(executionId);
      if (entry) {
        entry.metadata.status = ExecutionStatus.RUNNING;
      }
    });

    // Listen for node execution events
    eventEmitter.on(WorkflowEvent.NODE_EXECUTING, (event: WorkflowEventPayload) => {
      const entry = this.executions.get(executionId);
      if (entry && event.data) {
        entry.metadata.currentNodeId = event.data.nodeId;
        entry.metadata.currentNodeName = event.data.nodeName;
      }
    });

    // Listen for human interaction required events
    eventEmitter.on(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event: WorkflowEventPayload) => {
      const entry = this.executions.get(executionId);
      if (entry) {
        entry.metadata.status = ExecutionStatus.PAUSED;
        if (event.data?.nodeInfo) {
          entry.metadata.currentNodeName = event.data.nodeInfo.name;
        }
      }
    });
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}