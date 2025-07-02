/**
 * Base class for human interaction nodes
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { WorkflowEvent } from '../../core/types/events';

/**
 * Configuration for human nodes
 */
export interface HumanNodeConfig {
  /** JSON Schema for the form */
  formSchema: any;
  
  /** Optional UI hints */
  uiHints?: {
    title?: string;
    description?: string;
    submitLabel?: string;
    cancelLabel?: string;
  };
  
  /** Timeout in milliseconds (optional) */
  timeout?: number;
  
  /** Default form values (optional) */
  defaultValues?: Record<string, any>;
}

/**
 * Base class for human interaction nodes
 */
export abstract class BaseHumanNode implements Node {
  abstract metadata: NodeMetadata;
  
  /**
   * Get the configuration for this human node
   */
  abstract getConfig(context: ExecutionContext): HumanNodeConfig;
  
  /**
   * Process the human input and determine the edge
   */
  abstract processInput(input: any, context: ExecutionContext): string;
  
  /**
   * Optional: Validate the input before processing
   */
  validateInput(_input: any, _context: ExecutionContext): boolean {
    return true;
  }
  
  /**
   * Execute the human node
   */
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    // Get configuration
    const config = this.getConfig(context);
    
    // Create pause token
    const pauseToken = context.runtime.pause();
    
    // Emit human input required event
    context.runtime.emit({
      event: WorkflowEvent.HUMAN_INPUT_REQUIRED,
      workflowId: context.runtime.workflowId,
      executionId: context.runtime.executionId,
      timestamp: Date.now(),
      data: {
        nodeId: pauseToken.nodeId,
        nodeName: this.metadata.name,
        tokenId: pauseToken.id,
        formSchema: config.formSchema,
        uiHints: config.uiHints,
        timeout: config.timeout,
        defaultValues: config.defaultValues,
        contextData: this.getContextData(context)
      }
    });
    
    try {
      // Wait for human input
      let input: any;
      
      if (config.timeout) {
        // Wait with timeout
        input = await this.waitWithTimeout(
          context.runtime.waitForResume(pauseToken),
          config.timeout
        );
      } else {
        // Wait indefinitely
        input = await context.runtime.waitForResume(pauseToken);
      }
      
      // Emit human input received event
      context.runtime.emit({
        event: WorkflowEvent.HUMAN_INPUT_RECEIVED,
        workflowId: context.runtime.workflowId,
        executionId: context.runtime.executionId,
        timestamp: Date.now(),
        data: {
          nodeId: pauseToken.nodeId,
          nodeName: this.metadata.name,
          tokenId: pauseToken.id,
          input
        }
      });
      
      // Validate input
      if (!this.validateInput(input, context)) {
        throw new Error('Invalid input received');
      }
      
      // Process input to determine edge
      const edge = this.processInput(input, context);
      
      // Return edge map
      return {
        [edge]: () => input
      };
      
    } catch (error) {
      // Handle timeout or other errors
      if (error instanceof Error && error.message === 'Timeout') {
        return {
          timeout: () => ({ 
            message: 'Human interaction timed out',
            timeout: config.timeout 
          })
        };
      }
      
      // Return error edge
      return {
        error: () => ({
          message: error instanceof Error ? error.message : String(error)
        })
      };
    }
  }
  
  /**
   * Get context data to send with the human input request
   */
  protected getContextData(context: ExecutionContext): Record<string, any> {
    // Default implementation returns current state
    // Subclasses can override to provide specific context
    return context.state.getState();
  }
  
  /**
   * Wait for a promise with timeout
   */
  private async waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, timeoutMs);
      
      promise
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}