/**
 * Tests for BaseHumanNode
 */

import { BaseHumanNode, HumanNodeConfig } from './BaseHumanNode';
import { NodeMetadata } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime';
import { EventEmitter } from 'events';
import { WorkflowEvent } from '../../core/types/events';

// Test implementation of BaseHumanNode
class TestHumanNode extends BaseHumanNode {
  metadata: NodeMetadata = {
    name: 'testHuman',
    description: 'Test human node',
    type: 'human',
    ai_hints: {
      purpose: 'Testing',
      when_to_use: 'In tests',
      expected_edges: ['yes', 'no', 'timeout', 'error']
    }
  };
  
  getConfig(context: ExecutionContext): HumanNodeConfig {
    return {
      formSchema: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            enum: ['yes', 'no']
          }
        },
        required: ['answer']
      },
      uiHints: {
        title: 'Test Question',
        description: 'Please answer yes or no'
      },
      timeout: context.config?.timeout
    };
  }
  
  processInput(input: any, context: ExecutionContext): string {
    return input.answer;
  }
  
  validateInput(input: any, context: ExecutionContext): boolean {
    return input && ['yes', 'no'].includes(input.answer);
  }
}

describe('BaseHumanNode', () => {
  let node: TestHumanNode;
  let context: ExecutionContext;
  let eventEmitter: EventEmitter;
  let runtime: RuntimeContextImpl;
  let state: StateManager;
  
  beforeEach(() => {
    node = new TestHumanNode();
    eventEmitter = new EventEmitter();
    state = new StateManager({ test: 'data' });
    runtime = new RuntimeContextImpl('workflow-1', 'exec-1', eventEmitter);
    runtime.setCurrentNode('test-node-1');
    
    context = {
      state,
      runtime,
      config: {}
    };
  });
  
  describe('execute', () => {
    it('should emit HUMAN_INPUT_REQUIRED event and wait for input', async () => {
      const events: any[] = [];
      eventEmitter.on(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event) => {
        events.push(event);
      });
      
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait for event to be emitted
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify event was emitted
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: WorkflowEvent.HUMAN_INPUT_REQUIRED,
        workflowId: 'workflow-1',
        executionId: 'exec-1',
        data: expect.objectContaining({
          nodeName: 'testHuman',
          formSchema: expect.any(Object),
          uiHints: expect.any(Object)
        })
      });
      
      // Get the token and resume
      const tokenId = events[0].data.tokenId;
      runtime.resume(tokenId, { answer: 'yes' });
      
      // Wait for execution to complete
      const result = await executePromise;
      
      // Verify result
      expect(result).toEqual({
        yes: expect.any(Function)
      });
      
      // Verify edge data
      expect(result.yes()).toEqual({ answer: 'yes' });
    });
    
    it('should emit HUMAN_INPUT_RECEIVED event after input', async () => {
      const events: any[] = [];
      eventEmitter.on(WorkflowEvent.HUMAN_INPUT_RECEIVED, (event) => {
        events.push(event);
      });
      
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait and get token
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokens = runtime.getActivePauseTokens();
      expect(tokens).toHaveLength(1);
      
      // Resume with input
      runtime.resume(tokens[0].id, { answer: 'no' });
      
      // Wait for execution
      await executePromise;
      
      // Verify event
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        event: WorkflowEvent.HUMAN_INPUT_RECEIVED,
        data: expect.objectContaining({
          nodeName: 'testHuman',
          input: { answer: 'no' }
        })
      });
    });
    
    it('should handle timeout', async () => {
      context.config = { timeout: 100 }; // 100ms timeout
      
      // Start execution
      const result = await node.execute(context);
      
      // Should return timeout edge
      expect(result).toHaveProperty('timeout');
      expect(result.timeout()).toMatchObject({
        message: 'Human interaction timed out',
        timeout: 100
      });
    });
    
    it('should handle cancellation', async () => {
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait and cancel
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokens = runtime.getActivePauseTokens();
      runtime.cancel(tokens[0].id);
      
      // Wait for execution
      const result = await executePromise;
      
      // Should return error edge
      expect(result).toHaveProperty('error');
      expect(result.error()).toMatchObject({
        message: 'Execution cancelled'
      });
    });
    
    it('should validate input', async () => {
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait and resume with invalid input
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokens = runtime.getActivePauseTokens();
      runtime.resume(tokens[0].id, { answer: 'maybe' }); // Invalid
      
      // Wait for execution
      const result = await executePromise;
      
      // Should return error edge
      expect(result).toHaveProperty('error');
      expect(result.error()).toMatchObject({
        message: 'Invalid input received'
      });
    });
    
    it('should provide context data', async () => {
      const events: any[] = [];
      eventEmitter.on(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event) => {
        events.push(event);
      });
      
      // Add more state data
      state.set('user', { name: 'John' });
      state.set('amount', 1000);
      
      // Start execution
      node.execute(context);
      
      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify context data was included
      expect(events[0].data.contextData).toEqual({
        test: 'data',
        user: { name: 'John' },
        amount: 1000
      });
      
      // Clean up
      const tokens = runtime.getActivePauseTokens();
      runtime.cancel(tokens[0].id);
    });
  });
});