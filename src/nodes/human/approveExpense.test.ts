/**
 * Tests for ApproveExpenseNode
 */

import { ApproveExpenseNode } from './approveExpense';
import { ExecutionContext } from '../../core/types/context';
import { StateManager } from '../../core/state';
import { RuntimeContextImpl } from '../../core/runtime';
import { EventEmitter } from 'events';
import { WorkflowEvent } from '../../core/types/events';
import { getNodeRegistry } from '../registry';

describe('ApproveExpenseNode', () => {
  let node: ApproveExpenseNode;
  let context: ExecutionContext;
  let eventEmitter: EventEmitter;
  let runtime: RuntimeContextImpl;
  let state: StateManager;
  
  beforeEach(() => {
    node = new ApproveExpenseNode();
    eventEmitter = new EventEmitter();
    state = new StateManager({
      currentExpense: {
        amount: 1500,
        category: 'Travel',
        description: 'Client meeting in NYC',
        date: '2024-01-15',
        receipts: ['receipt1.pdf', 'receipt2.pdf']
      },
      requester: {
        name: 'Jane Smith',
        department: 'Sales',
        email: 'jane.smith@company.com'
      },
      autoApprovalLimit: 500
    });
    
    runtime = new RuntimeContextImpl('workflow-1', 'exec-1', eventEmitter);
    runtime.setCurrentNode('approve-expense-1');
    
    context = {
      state,
      runtime,
      config: {}
    };
  });
  
  describe('metadata', () => {
    it('should have correct metadata', () => {
      expect(node.metadata.name).toBe('approveExpense');
      expect(node.metadata.type).toBe('human');
      expect(node.metadata.ai_hints.expected_edges).toContain('approved');
      expect(node.metadata.ai_hints.expected_edges).toContain('rejected');
      expect(node.metadata.ai_hints.expected_edges).toContain('needsInfo');
    });
    
    it('should be registered in node registry', () => {
      const registry = getNodeRegistry();
      expect(registry.has('approveExpense')).toBe(true);
    });
  });
  
  describe('getConfig', () => {
    it('should return proper form schema', () => {
      const config = node.getConfig(context);
      
      expect(config.formSchema).toMatchObject({
        type: 'object',
        properties: {
          decision: expect.objectContaining({
            type: 'string',
            enum: ['approved', 'rejected', 'needsInfo']
          }),
          comments: expect.any(Object),
          additionalInfoNeeded: expect.any(Object)
        },
        required: ['decision']
      });
    });
    
    it('should include expense details in UI hints', () => {
      const config = node.getConfig(context);
      
      expect(config.uiHints?.description).toContain('Jane Smith');
      expect(config.defaultValues).toEqual({ decision: 'approved' });
    });
    
    it('should use custom timeout if provided', () => {
      context.config = { timeout: 3600000 }; // 1 hour
      const config = node.getConfig(context);
      
      expect(config.timeout).toBe(3600000);
    });
  });
  
  describe('execute', () => {
    it('should handle approval', async () => {
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait for pause
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Approve the expense
      const tokens = runtime.getActivePauseTokens();
      runtime.resume(tokens[0].id, {
        decision: 'approved',
        comments: 'Looks good, approved for reimbursement'
      });
      
      // Get result
      const result = await executePromise;
      
      // Verify result
      expect(result).toHaveProperty('approved');
      expect(result.approved()).toEqual({
        decision: 'approved',
        comments: 'Looks good, approved for reimbursement'
      });
      
      // Verify state was updated
      expect(state.get('approvalDecision')).toEqual({
        decision: 'approved',
        comments: 'Looks good, approved for reimbursement'
      });
    });
    
    it('should handle rejection', async () => {
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait and reject
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokens = runtime.getActivePauseTokens();
      runtime.resume(tokens[0].id, {
        decision: 'rejected',
        comments: 'Amount exceeds budget for this quarter'
      });
      
      // Get result
      const result = await executePromise;
      
      expect(result).toHaveProperty('rejected');
    });
    
    it('should handle needsInfo with required additional info', async () => {
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait and request more info
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokens = runtime.getActivePauseTokens();
      runtime.resume(tokens[0].id, {
        decision: 'needsInfo',
        additionalInfoNeeded: 'Please provide itemized receipts for meals'
      });
      
      // Get result
      const result = await executePromise;
      
      expect(result).toHaveProperty('needsInfo');
    });
    
    it('should validate needsInfo requires additional info', async () => {
      // Start execution
      const executePromise = node.execute(context);
      
      // Wait and send invalid needsInfo
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokens = runtime.getActivePauseTokens();
      runtime.resume(tokens[0].id, {
        decision: 'needsInfo'
        // Missing additionalInfoNeeded
      });
      
      // Get result
      const result = await executePromise;
      
      // Should return error edge due to validation failure
      expect(result).toHaveProperty('error');
    });
    
    it('should provide proper context data', async () => {
      const events: any[] = [];
      eventEmitter.on(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event) => {
        events.push(event);
      });
      
      // Start execution
      node.execute(context);
      
      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify context data
      const contextData = events[0].data.contextData;
      expect(contextData).toMatchObject({
        expense: {
          amount: 1500,
          category: 'Travel',
          description: 'Client meeting in NYC'
        },
        requester: {
          name: 'Jane Smith',
          department: 'Sales'
        },
        policy: {
          autoApprovalLimit: 500,
          requiresReceipts: true
        }
      });
      
      // Clean up
      const tokens = runtime.getActivePauseTokens();
      runtime.cancel(tokens[0].id);
    });
  });
});