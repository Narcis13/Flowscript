import { ExecutionManager } from '../services/ExecutionManager';
import { ConnectionManager } from './ConnectionManager';
import { createMessage, HumanInteractionRequiredMessage, ResumeMessage } from './protocol';

interface PendingInteraction {
  executionId: string;
  nodeId: string;
  formSchema?: any;
  requestedAt: Date;
  timeout?: number;
}

export class HumanInteractionHandler {
  private pendingInteractions: Map<string, PendingInteraction> = new Map();
  private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private executionManager: ExecutionManager,
    private connectionManager: ConnectionManager
  ) {}

  /**
   * Register a human interaction request
   */
  public registerInteractionRequest(
    executionId: string,
    nodeId: string,
    nodeInfo: {
      name: string;
      formSchema?: any;
      uiHints?: any;
      timeout?: number;
      contextData?: any;
    }
  ): void {
    const interactionKey = `${executionId}:${nodeId}`;
    
    // Store the pending interaction
    this.pendingInteractions.set(interactionKey, {
      executionId,
      nodeId,
      formSchema: nodeInfo.formSchema,
      requestedAt: new Date(),
      timeout: nodeInfo.timeout
    });

    // Set up timeout if specified
    if (nodeInfo.timeout) {
      const timeoutHandle = setTimeout(() => {
        this.handleTimeout(executionId, nodeId);
      }, nodeInfo.timeout);
      
      this.timeoutHandles.set(interactionKey, timeoutHandle);
    }

    // Broadcast the interaction request to subscribers
    const message: HumanInteractionRequiredMessage = {
      type: 'human_interaction_required',
      data: {
        executionId,
        nodeId,
        nodeInfo
      },
      timestamp: Date.now()
    };

    this.connectionManager.broadcastToExecution(executionId, JSON.stringify(message));
  }

  /**
   * Handle human input submission via WebSocket
   */
  public async handleResumeMessage(message: ResumeMessage): Promise<void> {
    const { executionId, nodeId, data } = message.data;
    const interactionKey = `${executionId}:${nodeId}`;
    
    const pendingInteraction = this.pendingInteractions.get(interactionKey);
    if (!pendingInteraction) {
      throw new Error(`No pending interaction found for ${interactionKey}`);
    }

    // Validate input if schema is provided
    if (pendingInteraction.formSchema) {
      try {
        await this.validateInput(data, pendingInteraction.formSchema);
      } catch (error) {
        throw new Error(`Input validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Clear timeout if exists
    const timeoutHandle = this.timeoutHandles.get(interactionKey);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      this.timeoutHandles.delete(interactionKey);
    }

    // Remove from pending
    this.pendingInteractions.delete(interactionKey);

    // Resume the execution
    await this.executionManager.resumeExecution(executionId, nodeId, data);
  }

  /**
   * Validate input against JSON Schema
   */
  private async validateInput(data: any, schema: any): Promise<void> {
    // If schema is already a Zod schema, use it directly
    if (schema._def) {
      const result = schema.safeParse(data);
      if (!result.success) {
        throw new Error(result.error.errors.map((e: any) => e.message).join(', '));
      }
      return;
    }

    // Otherwise, convert JSON Schema to basic validation
    // This is a simplified validation - in production, use a proper JSON Schema validator
    if (schema.type === 'object' && schema.required) {
      for (const field of schema.required) {
        if (!(field in data)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          const prop = propSchema as any;
          if (prop.type === 'string' && typeof data[key] !== 'string') {
            throw new Error(`Field ${key} must be a string`);
          }
          if (prop.type === 'number' && typeof data[key] !== 'number') {
            throw new Error(`Field ${key} must be a number`);
          }
          if (prop.enum && !prop.enum.includes(data[key])) {
            throw new Error(`Field ${key} must be one of: ${prop.enum.join(', ')}`);
          }
        }
      }
    }
  }

  /**
   * Handle interaction timeout
   */
  private handleTimeout(executionId: string, nodeId: string): void {
    const interactionKey = `${executionId}:${nodeId}`;
    
    // Remove from pending
    this.pendingInteractions.delete(interactionKey);
    this.timeoutHandles.delete(interactionKey);

    // Notify subscribers of timeout
    const message = createMessage('human_interaction_timeout', {
      executionId,
      nodeId,
      reason: 'Interaction timed out'
    });

    this.connectionManager.broadcastToExecution(executionId, JSON.stringify(message));

    // Resume with timeout error
    this.executionManager.resumeExecution(executionId, nodeId, {
      _timeout: true,
      _error: 'Human interaction timed out'
    }).catch(error => {
      console.error(`Failed to resume execution after timeout: ${error}`);
    });
  }

  /**
   * Get all pending interactions for an execution
   */
  public getPendingInteractions(executionId: string): PendingInteraction[] {
    const interactions: PendingInteraction[] = [];
    
    this.pendingInteractions.forEach((interaction) => {
      if (interaction.executionId === executionId) {
        interactions.push(interaction);
      }
    });

    return interactions;
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    // Clear all timeouts
    this.timeoutHandles.forEach(handle => clearTimeout(handle));
    this.timeoutHandles.clear();
    this.pendingInteractions.clear();
  }
}