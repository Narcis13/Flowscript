/**
 * Node execution wrapper with error handling and retry logic
 */

import { Node, SimpleEdgeMap } from '../types/node';
import { ExecutionContext } from '../types/context';
import { WorkflowEvent } from '../types/events';

/**
 * Options for node execution
 */
export interface NodeExecutionOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in ms */
  retryDelay?: number;
  /** Whether to throw on error or return error edge */
  throwOnError?: boolean;
  /** Timeout for node execution in ms */
  timeout?: number;
}

/**
 * Result of node execution with retry information
 */
export interface NodeExecutionWithRetryResult {
  /** The selected edge name */
  edge: string;
  /** The edge data (if any) */
  data?: any;
  /** Execution time in ms */
  duration: number;
  /** Error if execution failed */
  error?: Error;
  /** Number of retry attempts */
  retryCount?: number;
}

/**
 * Execute a node with error handling and retry logic
 */
export async function executeNodeWithRetry(
  node: Node,
  context: ExecutionContext,
  options: NodeExecutionOptions = {}
): Promise<NodeExecutionWithRetryResult> {
  const {
    maxRetries = 0,
    retryDelay = 1000,
    throwOnError = true,
    timeout = 30000
  } = options;

  const startTime = Date.now();
  let lastError: Error | undefined;
  let retryCount = 0;

  // Helper function to execute with timeout
  async function executeWithTimeout(): Promise<SimpleEdgeMap> {
    return new Promise<SimpleEdgeMap>(async (resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Node execution timeout after ${timeout}ms`));
      }, timeout);

      try {
        // Execute the node
        const result = await node.execute(context);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  // Attempt execution with retries
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add retry metadata to context
      if (attempt > 0) {
        context.runtime.emit({
          event: WorkflowEvent.NODE_EXECUTING,
          workflowId: context.runtime.workflowId,
          executionId: context.runtime.executionId,
          timestamp: Date.now(),
          data: {
            nodeName: node.metadata.name,
            attempt,
            maxRetries,
            lastError: lastError?.message
          }
        });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryCount++;
      }

      // Execute the node
      const edgeMap = await executeWithTimeout();

      // Process the edge map
      const edgeNames = Object.keys(edgeMap);
      if (edgeNames.length === 0) {
        throw new Error('Node returned no edges');
      }

      // Select the first edge (nodes typically return one edge)
      const selectedEdge = edgeNames[0];
      let edgeData: any;

      // Evaluate the lazy edge data
      if (edgeMap[selectedEdge]) {
        try {
          edgeData = await Promise.resolve(edgeMap[selectedEdge]());
        } catch (error) {
          throw new Error(`Failed to evaluate edge data for '${selectedEdge}': ${error}`);
        }
      }

      // Return successful result
      return {
        edge: selectedEdge,
        data: edgeData,
        duration: Date.now() - startTime,
        retryCount: attempt > 0 ? retryCount : undefined
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this was the last attempt, handle the error
      if (attempt === maxRetries) {
        const duration = Date.now() - startTime;
        
        if (throwOnError) {
          // Add context to the error
          const enhancedError = new Error(
            `Node '${node.metadata.name}' failed after ${retryCount + 1} attempts: ${lastError.message}`
          );
          (enhancedError as any).originalError = lastError;
          (enhancedError as any).nodeName = node.metadata.name;
          (enhancedError as any).retryCount = retryCount;
          throw enhancedError;
        } else {
          // Return error edge
          return {
            edge: 'error',
            data: {
              error: lastError.message,
              nodeName: node.metadata.name,
              retryCount
            },
            duration,
            error: lastError,
            retryCount
          };
        }
      }
    }
  }

  // This should never be reached
  throw new Error('Unexpected execution path');
}

/**
 * Validate node execution result
 */
export function validateNodeResult(
  result: NodeExecutionWithRetryResult,
  node: Node
): void {
  // Check if edge is in expected edges
  const expectedEdges = node.metadata.ai_hints.expected_edges;
  if (expectedEdges.length > 0 && !expectedEdges.includes(result.edge)) {
    console.warn(
      `Node '${node.metadata.name}' returned unexpected edge '${result.edge}'. ` +
      `Expected one of: ${expectedEdges.join(', ')}`
    );
  }

  // Validate edge data if present
  if (result.data !== undefined && result.data !== null) {
    // Ensure data is serializable
    try {
      JSON.stringify(result.data);
    } catch (error) {
      console.warn(
        `Node '${node.metadata.name}' returned non-serializable data on edge '${result.edge}'`
      );
    }
  }
}

/**
 * Create a safe node wrapper that catches all errors
 */
export function createSafeNode(node: Node): Node {
  return {
    metadata: node.metadata,
    execute: async (context: ExecutionContext): Promise<SimpleEdgeMap> => {
      try {
        return await node.execute(context);
      } catch (error) {
        // Return error edge instead of throwing
        return {
          error: () => ({
            message: error instanceof Error ? error.message : String(error),
            timestamp: Date.now()
          })
        };
      }
    }
  };
}

/**
 * Create a node wrapper that logs execution
 */
export function createLoggingNode(node: Node, logger: (message: string) => void): Node {
  return {
    metadata: node.metadata,
    execute: async (context: ExecutionContext): Promise<SimpleEdgeMap> => {
      const startTime = Date.now();
      logger(`Starting node '${node.metadata.name}'`);
      
      try {
        const result = await node.execute(context);
        const duration = Date.now() - startTime;
        const edges = Object.keys(result).join(', ');
        logger(`Node '${node.metadata.name}' completed in ${duration}ms with edges: ${edges}`);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger(`Node '${node.metadata.name}' failed after ${duration}ms: ${error}`);
        throw error;
      }
    }
  };
}