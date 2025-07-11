/**
 * NodeExecutor service for direct node execution outside of workflows
 */

import { EventEmitter } from 'events';
import { Node, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime/RuntimeContext';
import { NodeRegistry } from '../../nodes/registry';

export interface NodeExecutionOptions {
  /** Node-specific configuration */
  config?: Record<string, any>;
  /** Initial state data */
  initialState?: Record<string, any>;
  /** Previous node's output data */
  previousData?: any;
  /** Optional execution ID (auto-generated if not provided) */
  executionId?: string;
}

export interface NodeExecutionResult {
  /** The edge results from node execution */
  edges: Record<string, any>;
  /** Final state after execution */
  finalState: Record<string, any>;
  /** Execution metadata */
  metadata: {
    nodeId: string;
    executionId: string;
    startTime: number;
    endTime: number;
    duration: number;
  };
}

export class NodeExecutor {
  private static instance: NodeExecutor;
  private eventEmitter: EventEmitter;

  private constructor() {
    this.eventEmitter = new EventEmitter();
  }

  static getInstance(): NodeExecutor {
    if (!NodeExecutor.instance) {
      NodeExecutor.instance = new NodeExecutor();
    }
    return NodeExecutor.instance;
  }

  /**
   * Execute a single node directly
   */
  async executeNode(
    nodeId: string,
    options: NodeExecutionOptions = {}
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const executionId = options.executionId || `direct-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Get node from registry
    const nodeInstance = NodeRegistry.getInstance().getNode(nodeId);
    if (!nodeInstance) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Create state manager with initial state
    const state = new StateManager(options.initialState || {});

    // Create runtime context
    const runtime = new RuntimeContextImpl(
      'direct-execution',
      executionId,
      this.eventEmitter
    );
    runtime.setCurrentNode(nodeId);

    // Build execution context
    const context: ExecutionContext = {
      state,
      config: options.config,
      runtime,
      previousData: options.previousData
    };

    try {
      // Execute the node
      const edgeMap = await nodeInstance.execute(context);

      // Evaluate all edges to get their data
      const edges: Record<string, any> = {};
      for (const [edgeName, edgeThunk] of Object.entries(edgeMap)) {
        try {
          edges[edgeName] = await Promise.resolve(edgeThunk());
        } catch (error) {
          edges[edgeName] = {
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      const endTime = Date.now();

      return {
        edges,
        finalState: state.getState(),
        metadata: {
          nodeId,
          executionId,
          startTime,
          endTime,
          duration: endTime - startTime
        }
      };
    } catch (error) {
      const endTime = Date.now();
      
      // Return error as a special edge
      return {
        edges: {
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        },
        finalState: state.getState(),
        metadata: {
          nodeId,
          executionId,
          startTime,
          endTime,
          duration: endTime - startTime
        }
      };
    }
  }

  /**
   * Execute multiple nodes in sequence
   */
  async executeNodeChain(
    nodeIds: string[],
    options: NodeExecutionOptions = {}
  ): Promise<NodeExecutionResult[]> {
    const results: NodeExecutionResult[] = [];
    let currentState = options.initialState || {};
    let previousData = options.previousData;

    for (const nodeId of nodeIds) {
      const result = await this.executeNode(nodeId, {
        ...options,
        initialState: currentState,
        previousData
      });

      results.push(result);
      
      // Update state for next node
      currentState = result.finalState;
      
      // Use the first successful edge's data as previousData for next node
      const successEdge = result.edges.success || result.edges.default || Object.values(result.edges)[0];
      previousData = successEdge;
    }

    return results;
  }

  /**
   * Get the event emitter for listening to node events
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}