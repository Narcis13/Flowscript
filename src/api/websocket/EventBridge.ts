import { ExecutionManager } from '../services/ExecutionManager';
import { ConnectionManager } from './ConnectionManager';
import { createMessage } from './protocol';
import { WorkflowEventData } from './types';
import { WorkflowEventPayload } from '../../core/types/events';

export class EventBridge {
  private eventHandlers: Map<string, (event: WorkflowEventData) => void> = new Map();
  private isRunning = false;

  constructor(
    private executionManager: ExecutionManager,
    private connectionManager: ConnectionManager
  ) {
    this.setupEventListeners();
    this.start();
  }

  private setupEventListeners(): void {
    // Get all executions from the execution manager
    const executions = this.executionManager.getAllExecutions();

    executions.forEach(execution => {
      this.attachToExecution(execution.executionId);
    });

    // Listen for new executions
    this.executionManager.on('execution_started', (executionId: string) => {
      this.attachToExecution(executionId);
    });
  }

  private attachToExecution(executionId: string): void {
    const runtime = this.executionManager.getRuntime(executionId);
    if (!runtime || !runtime.emitter) {
      console.log(`No runtime found for execution ${executionId}, will retry later`);
      // Retry after a short delay
      setTimeout(() => {
        const retryRuntime = this.executionManager.getRuntime(executionId);
        if (retryRuntime && retryRuntime.emitter) {
          console.log(`Retrying attachment for execution ${executionId}`);
          this.attachToExecution(executionId);
        }
      }, 100);
      return;
    }

    console.log(`Attaching EventBridge to execution ${executionId}`);

    // Create a unique handler for this execution
    const handler = (event: WorkflowEventData) => {
      this.handleWorkflowEvent(executionId, event);
    };

    // Store the handler so we can remove it later
    this.eventHandlers.set(executionId, handler);

    // Listen to all workflow events - using the correct event names from WorkflowEvent enum
    const events = [
      'workflow:started',
      'node:executing',
      'node:completed',
      'node:failed',
      'workflow:paused',
      'workflow:resumed',
      'workflow:completed',
      'workflow:failed',
      'human:input:required',
      'state:updated'
    ];

    events.forEach(eventType => {
      runtime.emitter.on(eventType, (eventData: WorkflowEventPayload) => {
        // The eventData already contains all the fields we need
        handler({
          type: eventType,
          workflowId: eventData.workflowId,
          executionId: eventData.executionId,
          timestamp: eventData.timestamp,
          ...eventData.data
        });
      });
    });

    // Special handling for completion events
    runtime.emitter.on('workflow:completed', () => {
      this.cleanupExecution(executionId);
    });

    runtime.emitter.on('workflow:failed', () => {
      this.cleanupExecution(executionId);
    });
  }

  private handleWorkflowEvent(executionId: string, event: WorkflowEventData): void {
    if (!this.isRunning) return;

    // Transform the event into a WebSocket message
    const message = this.transformEventToMessage(executionId, event);
    
    // Broadcast to all subscribers
    this.connectionManager.broadcastToExecution(executionId, JSON.stringify(message));

    // Log for debugging
    console.log(`Broadcasting event for execution ${executionId}:`, event.type);
  }

  private transformEventToMessage(executionId: string, event: WorkflowEventData): any {
    // Map the event type (with colons) to WebSocket message types (with underscores)
    switch (event.type) {
      case 'workflow:started':
        return createMessage('workflow_started', {
          executionId,
          workflowId: event.workflowId,
          timestamp: event.timestamp
        });

      case 'node:executing':
        return createMessage('node_started', {
          executionId,
          nodeId: event.nodeId || event.data?.nodeId,
          nodeName: event.nodeName || event.data?.nodeName,
          timestamp: event.timestamp
        });

      case 'node:completed':
        return createMessage('node_completed', {
          executionId,
          nodeId: event.nodeId || event.data?.nodeId,
          nodeName: event.nodeName || event.data?.nodeName,
          edge: event.edge || event.data?.edge,
          data: event.data?.edgeData || event.data,
          timestamp: event.timestamp
        });

      case 'node:failed':
        return createMessage('node_failed', {
          executionId,
          nodeId: event.nodeId || event.data?.nodeId,
          nodeName: event.nodeName || event.data?.nodeName,
          error: event.error || event.data?.error,
          timestamp: event.timestamp
        });

      case 'workflow:paused':
        return createMessage('workflow_paused', {
          executionId,
          nodeId: event.nodeId || event.data?.nodeId,
          reason: event.reason || event.data?.reason,
          timestamp: event.timestamp
        });

      case 'workflow:resumed':
        return createMessage('workflow_resumed', {
          executionId,
          nodeId: event.nodeId || event.data?.nodeId,
          data: event.data,
          timestamp: event.timestamp
        });

      case 'workflow:completed':
        return createMessage('workflow_completed', {
          executionId,
          finalState: event.finalState || event.data?.finalState,
          timestamp: event.timestamp
        });

      case 'workflow:failed':
        return createMessage('workflow_failed', {
          executionId,
          error: event.error || event.data?.error,
          timestamp: event.timestamp
        });

      case 'human:input:required':
        return createMessage('human_interaction_required', {
          executionId,
          nodeId: event.nodeId || event.data?.nodeId,
          nodeInfo: event.nodeInfo || event.data?.nodeInfo,
          timestamp: event.timestamp
        });

      case 'state:updated':
        return createMessage('state_updated', {
          executionId,
          path: event.path || event.data?.path,
          newValue: event.newValue || event.data?.newValue,
          timestamp: event.timestamp
        });

      default:
        return createMessage('workflow_event', {
          executionId,
          ...event
        });
    }
  }

  private cleanupExecution(executionId: string): void {
    const handler = this.eventHandlers.get(executionId);
    if (handler) {
      const runtime = this.executionManager.getRuntime(executionId);
      if (runtime && runtime.emitter) {
        // Remove all event listeners - using the correct event names from WorkflowEvent enum
        const events = [
          'workflow:started',
          'node:executing',
          'node:completed',
          'node:failed',
          'workflow:paused',
          'workflow:resumed',
          'workflow:completed',
          'workflow:failed',
          'human:input:required',
          'state:updated'
        ];

        events.forEach(eventType => {
          runtime.emitter.removeAllListeners(eventType);
        });
      }
      this.eventHandlers.delete(executionId);
    }
  }

  public start(): void {
    this.isRunning = true;
    console.log('EventBridge started');
  }

  public stop(): void {
    this.isRunning = false;
    
    // Clean up all event handlers
    this.eventHandlers.forEach((_, executionId) => {
      this.cleanupExecution(executionId);
    });

    console.log('EventBridge stopped');
  }
}