/**
 * Tests for WhileCondition node
 */

import { WhileConditionNode } from './whileCondition';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime';
import { EventEmitter } from 'events';
import { ExecutionContext } from '../../core/types/context';

describe('WhileConditionNode', () => {
  let node: WhileConditionNode;
  let state: StateManager;
  let runtime: RuntimeContextImpl;
  let context: ExecutionContext;

  beforeEach(() => {
    node = new WhileConditionNode();
    state = new StateManager({
      counter: 0,
      maxAttempts: 3,
      isComplete: false
    });
    runtime = new RuntimeContextImpl('test-workflow', 'test-exec', new EventEmitter());
    context = { state, runtime };
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(node.metadata.name).toBe('whileCondition');
      expect(node.metadata.type).toBe('control');
      expect(node.metadata.ai_hints.expected_edges).toEqual(['next_iteration', 'exit_loop']);
    });
  });

  describe('execute', () => {
    it('should return next_iteration when condition is true', async () => {
      const customContext = {
        ...context,
        config: { condition: 'state.counter < state.maxAttempts' }
      };
      
      const result = await node.execute(customContext);
      
      expect(result).toHaveProperty('next_iteration');
      const data = result.next_iteration!();
      expect(data.conditionResult).toBe(true);
    });

    it('should return exit_loop when condition is false', async () => {
      state.set('$.counter', 5); // Make counter > maxAttempts
      
      const customContext = {
        ...context,
        config: { condition: 'state.counter < state.maxAttempts' }
      };
      
      const result = await node.execute(customContext);
      
      expect(result).toHaveProperty('exit_loop');
      const data = result.exit_loop!();
      expect(data.conditionResult).toBe(false);
    });

    it('should handle boolean state values', async () => {
      const customContext = {
        ...context,
        config: { condition: '!state.isComplete' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('next_iteration');
      
      // Update state and test again
      state.set('$.isComplete', true);
      const result2 = await node.execute(customContext);
      expect(result2).toHaveProperty('exit_loop');
    });

    it('should track iteration count', async () => {
      state.set('$._loopIteration', 5);
      
      const customContext = {
        ...context,
        config: { condition: 'true' }
      };
      
      const result = await node.execute(customContext);
      const data = result.next_iteration!();
      expect(data.iteration).toBe(6);
    });

    it('should throw error when condition is missing', async () => {
      await expect(node.execute(context)).rejects.toThrow('Condition is required');
    });

    it('should exit loop on expression evaluation error', async () => {
      const customContext = {
        ...context,
        config: { condition: 'invalid.syntax(' }
      };
      
      const result = await node.execute(customContext);
      
      expect(result).toHaveProperty('exit_loop');
      const data = result.exit_loop!();
      expect(data.error).toBeDefined();
      expect(data.conditionResult).toBe(false);
    });

    it('should handle complex expressions', async () => {
      state.set('$.items', ['a', 'b', 'c']);
      state.set('$.processed', 1);
      
      const customContext = {
        ...context,
        config: { condition: 'state.processed < state.items.length && !state.isComplete' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('next_iteration');
    });
  });
});