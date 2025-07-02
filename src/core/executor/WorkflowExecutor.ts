/**
 * Workflow Executor for FlowScript
 * Core execution engine that processes workflow definitions
 */

import { EventEmitter } from 'events';
import { 
  WorkflowDefinition, 
  FlowElement, 
  BranchMap,
  LoopController
} from '../types/workflow';
import { Node } from '../types/node';
import { ExecutionContext } from '../types/context';
import { StateManager } from '../state';
import { RuntimeContextImpl } from '../runtime';
import { WorkflowEvent } from '../types/events';
import { getNodeRegistry } from '../../nodes/registry';

/**
 * Execution result from running a flow
 */
export interface ExecutionResult {
  completed: boolean;
  exitSignal?: string;
  state: Record<string, any>;
  error?: Error;
}

/**
 * Options for workflow execution
 */
export interface ExecutionOptions {
  /** Initial state override */
  initialState?: Record<string, any>;
  /** Event emitter for workflow events */
  eventEmitter?: EventEmitter;
  /** Maximum execution time in ms */
  timeout?: number;
}

/**
 * Workflow Executor class
 */
export class WorkflowExecutor {
  private eventEmitter: EventEmitter;
  private executionStartTime: number = 0;
  private timeout: number = 60000; // Default 1 minute timeout
  private runtimeContext?: RuntimeContextImpl; // For testing purposes

  constructor(private workflow: WorkflowDefinition, options?: ExecutionOptions) {
    this.eventEmitter = options?.eventEmitter || new EventEmitter();
    this.timeout = options?.timeout || 60000;
  }

  /**
   * Get runtime context (for testing purposes)
   */
  getRuntimeContext(): RuntimeContextImpl | undefined {
    return this.runtimeContext;
  }

  /**
   * Execute the workflow
   */
  async execute(options?: ExecutionOptions): Promise<ExecutionResult> {
    this.executionStartTime = Date.now();
    
    // Create execution ID
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize state
    const initialState = options?.initialState || this.workflow.initialState || {};
    const stateManager = new StateManager(initialState);
    
    // Create runtime context
    const runtimeContext = new RuntimeContextImpl(
      this.workflow.id,
      executionId,
      this.eventEmitter
    );
    
    // Store for testing access
    this.runtimeContext = runtimeContext;

    // Emit workflow started event
    runtimeContext.emit({
      event: WorkflowEvent.STARTED,
      workflowId: this.workflow.id,
      executionId,
      timestamp: Date.now(),
      data: { initialState }
    });

    try {
      // Execute the workflow nodes
      const result = await this.executeFlow(
        this.workflow.nodes,
        stateManager,
        runtimeContext
      );

      // Emit workflow completed event
      runtimeContext.emit({
        event: WorkflowEvent.WORKFLOW_COMPLETED,
        workflowId: this.workflow.id,
        executionId,
        timestamp: Date.now(),
        data: { 
          finalState: stateManager.getState(),
          exitSignal: result.exitSignal 
        }
      });

      return {
        ...result,
        state: stateManager.getState()
      };
    } catch (error) {
      // Emit workflow failed event
      runtimeContext.emit({
        event: WorkflowEvent.WORKFLOW_FAILED,
        workflowId: this.workflow.id,
        executionId,
        timestamp: Date.now(),
        data: { 
          error: error instanceof Error ? error.message : String(error),
          state: stateManager.getState()
        }
      });

      return {
        completed: false,
        state: stateManager.getState(),
        error: error instanceof Error ? error : new Error(String(error))
      };
    } finally {
      // Clean up any remaining pause tokens only if not paused
      // This allows tests to resume execution
      if (!runtimeContext.isPaused()) {
        runtimeContext.clearPauseTokens();
      }
    }
  }

  /**
   * Execute a sequence of flow elements
   */
  private async executeFlow(
    elements: FlowElement[],
    state: StateManager,
    runtime: RuntimeContextImpl
  ): Promise<ExecutionResult> {
    let pc = 0; // Program counter
    let exitSignal: string | undefined;

    while (pc < elements.length && !exitSignal) {
      // Check timeout
      if (Date.now() - this.executionStartTime > this.timeout) {
        throw new Error('Workflow execution timeout');
      }

      const element = elements[pc];

      // Handle different element types
      if (this.isBranchStructure(element)) {
        const [condition, branches] = element;
        const result = await this.executeBranch(condition, branches, state, runtime);
        if (result.exitSignal) {
          exitSignal = result.exitSignal;
        }
      } else if (this.isLoopStructure(element)) {
        const [controller, body] = element;
        const result = await this.executeLoop(controller, body, state, runtime);
        if (result.exitSignal) {
          exitSignal = result.exitSignal;
        }
      } else {
        // It's a node reference - resolve and execute it
        const node = await this.resolveNode(element);
        const result = await this.executeNode(node, state, runtime);
        
        // Handle special edges
        if (result.edge === 'exit') {
          exitSignal = 'explicit_exit';
        } else if (result.edge?.startsWith('loopTo:')) {
          const targetName = result.edge.substring(7);
          const targetIndex = this.findNodeIndex(elements, targetName);
          if (targetIndex !== -1) {
            pc = targetIndex - 1; // -1 because pc++ happens at end of loop
          } else {
            throw new Error(`Target node not found: ${targetName}`);
          }
        }
      }

      pc++;
    }

    return {
      completed: !exitSignal,
      exitSignal,
      state: state.getState()
    };
  }

  /**
   * Execute a branch structure
   */
  private async executeBranch(
    condition: FlowElement,
    branches: BranchMap,
    state: StateManager,
    runtime: RuntimeContextImpl
  ): Promise<ExecutionResult> {
    // Resolve and execute condition node
    const conditionNode = await this.resolveNode(condition);
    const conditionResult = await this.executeNode(conditionNode, state, runtime);
    
    // Find matching branch
    const selectedBranch = branches[conditionResult.edge || 'default'];
    
    if (selectedBranch) {
      // Handle null branches
      if (selectedBranch === null) {
        return { completed: true, state: state.getState() };
      }
      // Convert single element to array if needed
      const branchElements = Array.isArray(selectedBranch) ? selectedBranch : [selectedBranch];
      // Execute the selected branch
      return this.executeFlow(branchElements as FlowElement[], state, runtime);
    }

    // No matching branch found
    return { completed: true, state: state.getState() };
  }

  /**
   * Execute a loop structure
   */
  private async executeLoop(
    controller: LoopController,
    body: FlowElement[],
    state: StateManager,
    runtime: RuntimeContextImpl
  ): Promise<ExecutionResult> {
    let exitSignal: string | undefined;

    while (!exitSignal) {
      // Resolve and execute loop controller
      const controllerNode = await this.resolveNode(controller);
      const controlResult = await this.executeNode(controllerNode, state, runtime);
      
      if (controlResult.edge === 'exit_loop') {
        break;
      } else if (controlResult.edge === 'next_iteration') {
        // Update state with any iteration data
        if (controlResult.data) {
          state.update(controlResult.data);
        }
        
        // Execute loop body
        const bodyResult = await this.executeFlow(body, state, runtime);
        if (bodyResult.exitSignal) {
          exitSignal = bodyResult.exitSignal;
        }
      } else {
        // Unknown edge from loop controller
        throw new Error(`Invalid loop controller edge: ${controlResult.edge}`);
      }
    }

    return {
      completed: !exitSignal,
      exitSignal,
      state: state.getState()
    };
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: Node,
    state: StateManager,
    runtime: RuntimeContextImpl
  ): Promise<{ edge?: string; data?: any }> {
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Set current node in runtime
    runtime.setCurrentNode(nodeId);

    // Emit node started event
    runtime.emit({
      event: WorkflowEvent.NODE_EXECUTING,
      workflowId: runtime.workflowId,
      executionId: runtime.executionId,
      timestamp: Date.now(),
      data: {
        nodeId,
        nodeName: node.metadata.name,
        nodeType: node.metadata.type
      }
    });

    try {
      // Create execution context
      const context: ExecutionContext = {
        state,
        config: {}, // TODO: Extract config from workflow definition
        runtime
      };

      // Execute the node
      const edgeMap = await node.execute(context);
      
      // Find the first edge (nodes typically return one edge)
      const edgeNames = Object.keys(edgeMap);
      const selectedEdge = edgeNames[0];
      
      let edgeData: any;
      if (selectedEdge && edgeMap[selectedEdge]) {
        // Evaluate the lazy edge data
        edgeData = await Promise.resolve(edgeMap[selectedEdge]());
      }

      // Emit node completed event
      runtime.emit({
        event: WorkflowEvent.NODE_COMPLETED,
        workflowId: runtime.workflowId,
        executionId: runtime.executionId,
        timestamp: Date.now(),
        data: {
          nodeId,
          nodeName: node.metadata.name,
          edge: selectedEdge,
          edgeData
        }
      });

      return {
        edge: selectedEdge,
        data: edgeData
      };
    } catch (error) {
      // Emit node failed event
      runtime.emit({
        event: WorkflowEvent.NODE_FAILED,
        workflowId: runtime.workflowId,
        executionId: runtime.executionId,
        timestamp: Date.now(),
        data: {
          nodeId,
          nodeName: node.metadata.name,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      throw error;
    }
  }

  /**
   * Resolve a flow element to a Node instance
   */
  private async resolveNode(element: FlowElement): Promise<Node> {
    const registry = getNodeRegistry();
    
    if (this.isNodeReference(element)) {
      // Simple string reference
      const node = registry.create(element);
      if (!node) {
        throw new Error(`Node not found in registry: ${element}`);
      }
      return node;
    } else if (this.isNodeWithConfig(element)) {
      // Node with configuration
      const nodeName = Object.keys(element)[0];
      const config = element[nodeName];
      const node = registry.create(nodeName);
      if (!node) {
        throw new Error(`Node not found in registry: ${nodeName}`);
      }
      // Create a wrapper node that includes the config
      return {
        ...node,
        execute: async (context: ExecutionContext) => {
          // Merge config into context
          const enhancedContext = {
            ...context,
            config: { ...context.config, ...config }
          };
          return node.execute(enhancedContext);
        }
      };
    } else {
      throw new Error(`Cannot resolve element to node: ${JSON.stringify(element)}`);
    }
  }

  /**
   * Find the index of a node by name in the elements array
   */
  private findNodeIndex(elements: FlowElement[], nodeName: string): number {
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (this.isNodeReference(element) && element === nodeName) {
        return i;
      } else if (this.isNodeWithConfig(element) && Object.keys(element)[0] === nodeName) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Type guard for branch structure (array with 2 elements where second is BranchMap)
   */
  private isBranchStructure(element: FlowElement): element is [FlowElement, BranchMap] {
    return Array.isArray(element) && 
           element.length === 2 && 
           typeof element[1] === 'object' &&
           !Array.isArray(element[1]);
  }

  /**
   * Type guard for loop structure (array with 2 elements where second is array)
   */
  private isLoopStructure(element: FlowElement): element is [LoopController, FlowElement[]] {
    return Array.isArray(element) && 
           element.length === 2 && 
           Array.isArray(element[1]);
  }

  /**
   * Type guard for string node reference
   */
  private isNodeReference(element: FlowElement): element is string {
    return typeof element === 'string';
  }

  /**
   * Type guard for node with config
   */
  private isNodeWithConfig(element: FlowElement): element is { [nodeName: string]: Record<string, any> } {
    if (typeof element !== 'object' || Array.isArray(element)) return false;
    const keys = Object.keys(element);
    return keys.length === 1 && typeof element[keys[0]] === 'object';
  }
}

/**
 * Convenience function to execute a workflow
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const executor = new WorkflowExecutor(workflow, options);
  return executor.execute(options);
}