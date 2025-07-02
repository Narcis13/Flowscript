/**
 * RuntimeContext implementation for FlowScript
 */

import { EventEmitter } from 'events';
import { PauseToken } from './PauseToken';
import { WorkflowEvent, WorkflowEventPayload } from '../types/events';

/**
 * Interface for RuntimeContext as defined in specs
 */
export interface RuntimeContext {
  workflowId: string;
  executionId: string;
  emit: (event: WorkflowEventPayload) => void;
  pause: () => PauseToken;
  waitForResume: (token: PauseToken) => Promise<any>;
}

/**
 * Implementation of RuntimeContext
 */
export class RuntimeContextImpl implements RuntimeContext {
  private pauseTokens: Map<string, PauseToken> = new Map();
  private currentNodeId?: string;

  constructor(
    public readonly workflowId: string,
    public readonly executionId: string,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Set the current node ID for context
   */
  setCurrentNode(nodeId: string): void {
    this.currentNodeId = nodeId;
  }

  /**
   * Emit a workflow event
   */
  emit(event: WorkflowEventPayload): void {
    // Ensure event has required fields
    const fullEvent: WorkflowEventPayload = {
      ...event,
      workflowId: this.workflowId,
      executionId: this.executionId,
      timestamp: event.timestamp || Date.now()
    };

    this.eventEmitter.emit(fullEvent.event, fullEvent);
    
    // Also emit a general 'workflow:event' for listeners that want all events
    this.eventEmitter.emit('workflow:event', fullEvent);
  }

  /**
   * Pause the workflow execution and return a pause token
   */
  pause(): PauseToken {
    if (!this.currentNodeId) {
      throw new Error('Cannot pause: no current node ID set');
    }

    const token = new PauseToken(
      this.workflowId,
      this.executionId,
      this.currentNodeId
    );

    // Store the token
    this.pauseTokens.set(token.id, token);

    // Emit pause event
    this.emit({
      event: WorkflowEvent.WORKFLOW_PAUSED,
      workflowId: this.workflowId,
      executionId: this.executionId,
      timestamp: Date.now(),
      data: {
        nodeId: this.currentNodeId,
        tokenId: token.id
      }
    });

    return token;
  }

  /**
   * Wait for a pause token to be resumed
   */
  async waitForResume(token: PauseToken): Promise<any> {
    // Validate token belongs to this execution
    if (token.workflowId !== this.workflowId || token.executionId !== this.executionId) {
      throw new Error('Invalid token: does not belong to this execution');
    }

    // Check if token is tracked
    if (!this.pauseTokens.has(token.id)) {
      throw new Error('Invalid token: not recognized');
    }

    try {
      // Wait for the token to be resolved
      const resumeData = await token.wait();

      // Emit resume event
      this.emit({
        event: WorkflowEvent.WORKFLOW_RESUMED,
        workflowId: this.workflowId,
        executionId: this.executionId,
        timestamp: Date.now(),
        data: {
          nodeId: token.nodeId,
          tokenId: token.id,
          resumeData
        }
      });

      // Clean up the token
      this.pauseTokens.delete(token.id);

      return resumeData;
    } catch (error) {
      // Clean up the token on error
      this.pauseTokens.delete(token.id);
      throw error;
    }
  }

  /**
   * Resume a paused execution with data
   */
  resume(tokenId: string, data: any): void {
    const token = this.pauseTokens.get(tokenId);
    if (!token) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    token.resume(data);
    this.pauseTokens.delete(tokenId);
  }

  /**
   * Cancel a paused execution
   */
  cancel(tokenId: string): void {
    const token = this.pauseTokens.get(tokenId);
    if (!token) {
      throw new Error(`Token not found: ${tokenId}`);
    }

    token.cancel();
    this.pauseTokens.delete(tokenId);
  }

  /**
   * Get all active pause tokens
   */
  getActivePauseTokens(): PauseToken[] {
    return Array.from(this.pauseTokens.values());
  }

  /**
   * Check if execution is paused
   */
  isPaused(): boolean {
    return this.pauseTokens.size > 0;
  }

  /**
   * Clear all pause tokens (used when execution ends)
   */
  clearPauseTokens(): void {
    for (const token of this.pauseTokens.values()) {
      if (!token.isResolved) {
        token.cancel();
      }
    }
    this.pauseTokens.clear();
  }
}