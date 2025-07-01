/**
 * Tests for ForEach node
 */

import { ForEachNode } from './forEach';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime';
import { EventEmitter } from 'events';
import { ExecutionContext } from '../../core/types/context';

describe('ForEachNode', () => {
  let node: ForEachNode;
  let state: StateManager;
  let runtime: RuntimeContextImpl;
  let context: ExecutionContext;

  beforeEach(() => {
    node = new ForEachNode();
    state = new StateManager({
      documents: ['doc1', 'doc2', 'doc3'],
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ],
      notAnArray: 'string value'
    });
    runtime = new RuntimeContextImpl('test-workflow', 'test-exec', new EventEmitter());
    context = { state, runtime };
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(node.metadata.name).toBe('forEach');
      expect(node.metadata.type).toBe('control');
      expect(node.metadata.ai_hints.expected_edges).toEqual(['next_iteration', 'exit_loop']);
    });
  });

  describe('execute', () => {
    it('should iterate over array items', async () => {
      const customContext = {
        ...context,
        config: { items: '$.documents', as: 'currentDoc' }
      };
      
      // First iteration
      const result1 = await node.execute(customContext);
      expect(result1).toHaveProperty('next_iteration');
      const data1 = result1.next_iteration!();
      expect(data1.currentDoc).toBe('doc1');
      expect(data1._loopIndex).toBe(1);
      expect(data1._totalItems).toBe(3);
      expect(data1._isFirst).toBe(true);
      expect(data1._isLast).toBe(false);
      
      // Update state with loop index
      state.set('$._loopIndex', data1._loopIndex);
      
      // Second iteration
      const result2 = await node.execute(customContext);
      expect(result2).toHaveProperty('next_iteration');
      const data2 = result2.next_iteration!();
      expect(data2.currentDoc).toBe('doc2');
      expect(data2._loopIndex).toBe(2);
      expect(data2._isFirst).toBe(false);
      expect(data2._isLast).toBe(false);
    });

    it('should handle last iteration correctly', async () => {
      state.set('$._loopIndex', 2); // Last item index
      
      const customContext = {
        ...context,
        config: { items: '$.documents', as: 'currentDoc' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('next_iteration');
      const data = result.next_iteration!();
      expect(data.currentDoc).toBe('doc3');
      expect(data._isLast).toBe(true);
    });

    it('should exit loop when all items processed', async () => {
      state.set('$._loopIndex', 3); // Past last item
      
      const customContext = {
        ...context,
        config: { items: '$.documents', as: 'currentDoc' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('exit_loop');
      const data = result.exit_loop!();
      expect(data._loopIndex).toBe(0); // Reset
      expect(data.totalProcessed).toBe(3);
    });

    it('should iterate over complex objects', async () => {
      const customContext = {
        ...context,
        config: { items: '$.users', as: 'user' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('next_iteration');
      const data = result.next_iteration!();
      expect(data.user).toEqual({ id: 1, name: 'Alice' });
    });

    it('should throw error when items path is missing', async () => {
      const customContext = {
        ...context,
        config: { as: 'item' }
      };
      
      await expect(node.execute(customContext)).rejects.toThrow('Items path is required');
    });

    it('should throw error when as is missing', async () => {
      const customContext = {
        ...context,
        config: { items: '$.documents' }
      };
      
      await expect(node.execute(customContext)).rejects.toThrow('Iterator variable name');
    });

    it('should exit loop when items is not an array', async () => {
      const customContext = {
        ...context,
        config: { items: '$.notAnArray', as: 'item' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('exit_loop');
      const data = result.exit_loop!();
      expect(data.error).toBe('Items is not an array');
      expect(data.itemsType).toBe('string');
    });

    it('should handle empty arrays', async () => {
      state.set('$.emptyArray', []);
      
      const customContext = {
        ...context,
        config: { items: '$.emptyArray', as: 'item' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('exit_loop');
      const data = result.exit_loop!();
      expect(data.totalProcessed).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      const customContext = {
        ...context,
        config: { items: '$.nonexistent.path', as: 'item' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('exit_loop');
      const data = result.exit_loop!();
      expect(data.error).toBe('Items is not an array');
    });
  });
});