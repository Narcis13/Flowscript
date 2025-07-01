/**
 * Tests for WorkflowExecutor
 */

import { WorkflowExecutor } from './WorkflowExecutor';
import { WorkflowDefinition } from '../types/workflow';
import { Node, SimpleEdgeMap } from '../types/node';
import { ExecutionContext } from '../types/context';
import { getNodeRegistry } from '../../nodes/registry';

// Mock nodes for testing
const mockNode1: Node = {
  metadata: {
    name: 'mockNode1',
    description: 'Test node 1',
    type: 'action',
    ai_hints: {
      purpose: 'Testing',
      when_to_use: 'In tests',
      expected_edges: ['success', 'error']
    }
  },
  execute: async (context: ExecutionContext) => {
    const count = context.state.get('count') || 0;
    context.state.set('count', count + 1);
    return {
      success: () => ({ incremented: true })
    };
  }
};

const mockNode2: Node = {
  metadata: {
    name: 'mockNode2',
    description: 'Test node 2',
    type: 'action',
    ai_hints: {
      purpose: 'Testing',
      when_to_use: 'In tests',
      expected_edges: ['success']
    }
  },
  execute: async (context: ExecutionContext) => {
    const count = context.state.get('count') || 0;
    context.state.set('count', count * 2);
    return {
      success: () => ({ doubled: true })
    };
  }
};

const mockConditionNode: Node = {
  metadata: {
    name: 'checkCount',
    description: 'Check count value',
    type: 'control',
    ai_hints: {
      purpose: 'Conditional branching',
      when_to_use: 'When checking count',
      expected_edges: ['high', 'low']
    }
  },
  execute: async (context: ExecutionContext): Promise<SimpleEdgeMap> => {
    const count = context.state.get('count') || 0;
    if (count > 5) {
      return { high: () => ({ count }) };
    }
    return { low: () => ({ count }) };
  }
};

const mockLoopController: Node = {
  metadata: {
    name: 'loopController',
    description: 'Loop controller',
    type: 'control',
    ai_hints: {
      purpose: 'Loop control',
      when_to_use: 'For iterations',
      expected_edges: ['next_iteration', 'exit_loop']
    }
  },
  execute: async (context: ExecutionContext): Promise<SimpleEdgeMap> => {
    const iterations = context.state.get('iterations') || 0;
    if (iterations < 3) {
      context.state.set('iterations', iterations + 1);
      return { next_iteration: () => ({ iteration: iterations + 1 }) };
    }
    return { exit_loop: () => ({ completed: true }) };
  }
};

describe('WorkflowExecutor', () => {
  beforeEach(() => {
    // Register mock nodes
    const registry = getNodeRegistry();
    registry.clear();
    registry.registerInstance(mockNode1);
    registry.registerInstance(mockNode2);
    registry.registerInstance(mockConditionNode);
    registry.registerInstance(mockLoopController);
  });

  afterEach(() => {
    // Clear registry
    getNodeRegistry().clear();
  });

  describe('Sequential execution', () => {
    it('should execute nodes in sequence', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-sequential',
        name: 'Test Sequential',
        initialState: { count: 0 },
        elements: [mockNode1, mockNode2]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state.count).toBe(2); // 0 + 1 = 1, then 1 * 2 = 2
    });

    it('should handle empty workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-empty',
        name: 'Test Empty',
        initialState: {},
        elements: []
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state).toEqual({});
    });
  });

  describe('Branch execution', () => {
    it('should execute correct branch based on condition', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-branch',
        name: 'Test Branch',
        initialState: { count: 10 },
        elements: [
          {
            type: 'branch',
            condition: mockConditionNode,
            branches: {
              high: [mockNode2], // Will double the count
              low: [mockNode1]   // Will increment the count
            }
          }
        ]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state.count).toBe(20); // High branch: 10 * 2 = 20
    });

    it('should handle missing branch gracefully', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-missing-branch',
        name: 'Test Missing Branch',
        initialState: { count: 10 },
        elements: [
          {
            type: 'branch',
            condition: mockConditionNode,
            branches: {
              low: [mockNode1] // No 'high' branch defined
            }
          }
        ]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state.count).toBe(10); // No change since high branch is missing
    });
  });

  describe('Loop execution', () => {
    it('should execute loop body multiple times', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-loop',
        name: 'Test Loop',
        initialState: { count: 1, iterations: 0 },
        elements: [
          {
            type: 'loop',
            controller: mockLoopController,
            body: [mockNode1] // Increment count each iteration
          }
        ]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state.count).toBe(4); // 1 + 1 + 1 + 1 = 4 (3 iterations)
      expect(result.state.iterations).toBe(3);
    });

    it('should handle empty loop body', async () => {
      const workflow: WorkflowDefinition = {
        id: 'test-empty-loop',
        name: 'Test Empty Loop',
        initialState: { iterations: 0 },
        elements: [
          {
            type: 'loop',
            controller: mockLoopController,
            body: []
          }
        ]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state.iterations).toBe(3);
    });
  });

  describe('Error handling', () => {
    it('should handle node execution errors', async () => {
      const errorNode: Node = {
        metadata: {
          name: 'errorNode',
          description: 'Node that throws error',
          type: 'action',
          ai_hints: {
            purpose: 'Testing errors',
            when_to_use: 'Never',
            expected_edges: ['success']
          }
        },
        execute: async () => {
          throw new Error('Test error');
        }
      };

      getNodeRegistry().registerInstance(errorNode);

      const workflow: WorkflowDefinition = {
        id: 'test-error',
        name: 'Test Error',
        initialState: {},
        elements: [errorNode]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Test error');
    });

    it('should timeout long-running workflows', async () => {
      const slowNode: Node = {
        metadata: {
          name: 'slowNode',
          description: 'Slow node',
          type: 'action',
          ai_hints: {
            purpose: 'Testing timeout',
            when_to_use: 'Never',
            expected_edges: ['success']
          }
        },
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { success: () => ({}) };
        }
      };

      getNodeRegistry().registerInstance(slowNode);

      const workflow: WorkflowDefinition = {
        id: 'test-timeout',
        name: 'Test Timeout',
        initialState: {},
        elements: [slowNode]
      };

      const executor = new WorkflowExecutor(workflow, { timeout: 100 });
      const result = await executor.execute();

      expect(result.completed).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('timeout');
    });
  });

  describe('Special edges', () => {
    it('should handle exit edge', async () => {
      const exitNode: Node = {
        metadata: {
          name: 'exitNode',
          description: 'Node that exits',
          type: 'control',
          ai_hints: {
            purpose: 'Early exit',
            when_to_use: 'To exit workflow',
            expected_edges: ['exit']
          }
        },
        execute: async () => {
          return { exit: () => ({ reason: 'Early exit' }) };
        }
      };

      getNodeRegistry().registerInstance(exitNode);

      const workflow: WorkflowDefinition = {
        id: 'test-exit',
        name: 'Test Exit',
        initialState: { count: 0 },
        elements: [mockNode1, exitNode, mockNode2] // mockNode2 should not execute
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(false);
      expect(result.exitSignal).toBe('explicit_exit');
      expect(result.state.count).toBe(1); // Only first node executed
    });

    it('should handle loopTo edge', async () => {
      let execCount = 0;
      const loopToNode: Node = {
        metadata: {
          name: 'loopToNode',
          description: 'Node that loops back',
          type: 'control',
          ai_hints: {
            purpose: 'Loop back',
            when_to_use: 'To jump to node',
            expected_edges: ['loopTo:mockNode1', 'continue']
          }
        },
        execute: async (): Promise<SimpleEdgeMap> => {
          execCount++;
          if (execCount < 2) {
            return { 'loopTo:mockNode1': () => ({ looped: true }) };
          }
          return { continue: () => ({ done: true }) };
        }
      };

      getNodeRegistry().registerInstance(loopToNode);

      const workflow: WorkflowDefinition = {
        id: 'test-loopTo',
        name: 'Test LoopTo',
        initialState: { count: 0 },
        elements: [mockNode1, loopToNode]
      };

      const executor = new WorkflowExecutor(workflow);
      const result = await executor.execute();

      expect(result.completed).toBe(true);
      expect(result.state.count).toBe(2); // mockNode1 executed twice
      expect(execCount).toBe(2);
    });
  });
});