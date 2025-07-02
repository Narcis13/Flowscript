import { EventEmitter } from 'events';
import { ExecutionManager } from '../services/ExecutionManager';
import { ConnectionManager } from './ConnectionManager';
import { createMessage } from './protocol';
import { WorkflowEvent } from '../../core/types';

export class EventBridge {
  private eventHandlers: Map<string, (event: WorkflowEvent) => void> = new Map();
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
    if (!runtime || !runtime.emitter) return;

    // Create a unique handler for this execution
    const handler = (event: WorkflowEvent) => {
      this.handleWorkflowEvent(executionId, event);
    };

    // Store the handler so we can remove it later
    this.eventHandlers.set(executionId, handler);

    // Listen to all workflow events
    const events = [
      'workflow_started',
      'node_started',
      'node_completed',
      'node_failed',
      'workflow_paused',
      'workflow_resumed',
      'workflow_completed',
      'workflow_failed',
      'human_interaction_required',
      'state_updated'
    ];

    events.forEach(eventType => {
      runtime.emitter.on(eventType, (eventData: any) => {
        handler({ type: eventType, ...eventData });
      });
    });

    // Special handling for completion events
    runtime.emitter.on('workflow_completed', () => {
      this.cleanupExecution(executionId);
    });

    runtime.emitter.on('workflow_failed', () => {
      this.cleanupExecution(executionId);
    });
  }

  private handleWorkflowEvent(executionId: string, event: WorkflowEvent): void {
    if (!this.isRunning) return;

    // Transform the event into a WebSocket message
    const message = this.transformEventToMessage(executionId, event);
    
    // Broadcast to all subscribers
    this.connectionManager.broadcastToExecution(executionId, JSON.stringify(message));

    // Log for debugging
    console.log(`Broadcasting event for execution ${executionId}:`, event.type);
  }

  private transformEventToMessage(executionId: string, event: WorkflowEvent): any {
    switch (event.type) {
      case 'workflow_started':
        return createMessage('workflow_started', {
          executionId,
          workflowId: event.workflowId,
          timestamp: event.timestamp
        });

      case 'node_started':
        return createMessage('node_started', {
          executionId,
          nodeId: event.nodeId,
          nodeName: event.nodeName,
          timestamp: event.timestamp
        });

      case 'node_completed':
        return createMessage('node_completed', {
          executionId,
          nodeId: event.nodeId,
          nodeName: event.nodeName,
          edge: event.edge,
          data: event.data,
          timestamp: event.timestamp
        });

      case 'node_failed':
        return createMessage('node_failed', {
          executionId,
          nodeId: event.nodeId,
          nodeName: event.nodeName,
          error: event.error,
          timestamp: event.timestamp
        });

      case 'workflow_paused':
        return createMessage('workflow_paused', {
          executionId,
          nodeId: event.nodeId,
          reason: event.reason,
          timestamp: event.timestamp
        });

      case 'workflow_resumed':
        return createMessage('workflow_resumed', {
          executionId,
          nodeId: event.nodeId,
          data: event.data,
          timestamp: event.timestamp
        });

      case 'workflow_completed':
        return createMessage('workflow_completed', {
          executionId,
          finalState: event.finalState,
          timestamp: event.timestamp
        });

      case 'workflow_failed':
        return createMessage('workflow_failed', {
          executionId,
          error: event.error,
          timestamp: event.timestamp
        });

      case 'human_interaction_required':
        return createMessage('human_interaction_required', {
          executionId,
          nodeId: event.nodeId,
          nodeInfo: event.nodeInfo,
          timestamp: event.timestamp
        });

      case 'state_updated':
        return createMessage('state_updated', {
          executionId,
          path: event.path,
          newValue: event.newValue,
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
        // Remove all event listeners
        const events = [
          'workflow_started',
          'node_started',
          'node_completed',
          'node_failed',
          'workflow_paused',
          'workflow_resumed',
          'workflow_completed',
          'workflow_failed',
          'human_interaction_required',
          'state_updated'
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
    this.eventHandlers.forEach((handler, executionId) => {
      this.cleanupExecution(executionId);
    });

    console.log('EventBridge stopped');
  }
}