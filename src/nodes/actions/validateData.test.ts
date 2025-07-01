/**
 * Tests for ValidateData node
 */

import { ValidateDataNode } from './validateData';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime';
import { EventEmitter } from 'events';
import { ExecutionContext } from '../../core/types/context';

describe('ValidateDataNode', () => {
  let node: ValidateDataNode;
  let state: StateManager;
  let runtime: RuntimeContextImpl;
  let context: ExecutionContext;

  beforeEach(() => {
    node = new ValidateDataNode();
    state = new StateManager({
      input: { name: 'John', age: 30 },
      invalidInput: null
    });
    runtime = new RuntimeContextImpl('test-workflow', 'test-exec', new EventEmitter());
    context = { state, runtime };
  });

  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(node.metadata.name).toBe('validateData');
      expect(node.metadata.type).toBe('action');
      expect(node.metadata.ai_hints.expected_edges).toEqual(['valid', 'invalid', 'error']);
    });
  });

  describe('execute', () => {
    it('should return valid edge for valid data', async () => {
      const result = await node.execute(context);
      
      expect(result).toHaveProperty('valid');
      expect(result.valid).toBeDefined();
      
      const data = result.valid!();
      expect(data).toHaveProperty('validatedAt');
      expect(typeof data.validatedAt).toBe('number');
    });

    it('should use custom dataPath from config', async () => {
      const customContext = {
        ...context,
        config: { dataPath: '$.input' }
      };
      
      const result = await node.execute(customContext);
      expect(result).toHaveProperty('valid');
    });

    it('should return invalid edge for invalid data', async () => {
      const customContext = {
        ...context,
        config: { dataPath: '$.invalidInput' }
      };
      
      const result = await node.execute(customContext);
      
      expect(result).toHaveProperty('invalid');
      expect(result.invalid).toBeDefined();
      
      const data = result.invalid!();
      expect(data).toHaveProperty('errors');
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors.length).toBeGreaterThan(0);
    });

    it('should return error edge when path does not exist', async () => {
      const customContext = {
        ...context,
        config: { dataPath: '$.nonexistent.deeply.nested' }
      };
      
      const result = await node.execute(customContext);
      
      expect(result).toHaveProperty('invalid');
      const data = result.invalid!();
      expect(data.errors).toContain('Data is null or undefined');
    });

    it('should handle errors gracefully', async () => {
      // Create a state that throws on get
      const errorState = new StateManager();
      jest.spyOn(errorState, 'get').mockImplementation(() => {
        throw new Error('State access error');
      });
      
      const errorContext = {
        ...context,
        state: errorState
      };
      
      const result = await node.execute(errorContext);
      
      expect(result).toHaveProperty('error');
      const data = result.error!();
      expect(data.message).toBe('State access error');
    });
  });
});