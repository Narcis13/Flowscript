/**
 * Integration tests for human nodes in workflows
 */

import { WorkflowExecutor } from '../../core/executor';
import { WorkflowDefinition } from '../../core/types/workflow';
import { SetDataNode } from '../actions/setData';
import { ValidateDataNode } from '../actions/validateData';
import { ApproveExpenseNode } from './approveExpense';
import { EventEmitter } from 'events';
import { WorkflowEvent } from '../../core/types/events';
import { getNodeRegistry } from '../registry';

describe('Human Node Integration', () => {
  let eventEmitter: EventEmitter;
  
  beforeEach(() => {
    eventEmitter = new EventEmitter();
    
    // Ensure nodes are registered
    const registry = getNodeRegistry();
    registry.registerInstance(new SetDataNode());
    registry.registerInstance(new ValidateDataNode());
    registry.registerInstance(new ApproveExpenseNode());
  });
  
  it('should execute workflow with human approval', async () => {
    // Create workflow with human approval
    const workflow: WorkflowDefinition = {
      id: 'expense-approval',
      name: 'Expense Approval Workflow',
      initialState: {
        autoApprovalLimit: 500
      },
      elements: [
        // Set expense data
        new SetDataNode(),
        // Validate expense
        new ValidateDataNode(),
        // Human approval
        new ApproveExpenseNode(),
        // Process result (using branch)
        {
          type: 'branch',
          condition: new ValidateDataNode(), // Check approval status
          branches: {
            valid: [new SetDataNode()], // Approved - process payment
            invalid: [new SetDataNode()] // Rejected - notify requester
          }
        }
      ]
    };
    
    // Track events
    const events: any[] = [];
    eventEmitter.on('workflow:event', (event) => {
      events.push(event);
    });
    
    // Create executor
    const executor = new WorkflowExecutor(workflow, { eventEmitter });
    
    // Configure nodes
    const nodeConfigs = {
      setData: {
        updates: {
          currentExpense: {
            amount: 750,
            category: 'Travel',
            description: 'Conference attendance'
          },
          requester: {
            name: 'John Doe',
            department: 'Engineering'
          }
        }
      },
      validateData: {
        rules: {
          'currentExpense.amount': { type: 'number', min: 0 }
        }
      }
    };
    
    // Start execution
    const executePromise = executor.execute({
      initialState: {
        ...workflow.initialState,
        _nodeConfigs: nodeConfigs
      }
    });
    
    // Wait for human input required event
    await new Promise<void>((resolve) => {
      eventEmitter.once(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event) => {
        // Verify event data
        expect(event.data.nodeName).toBe('approveExpense');
        expect(event.data.formSchema).toBeDefined();
        expect(event.data.contextData.expense.amount).toBe(750);
        
        // Simulate human approval after a delay
        setTimeout(() => {
          const runtime = (executor as any).runtimeContext;
          runtime.resume(event.data.tokenId, {
            decision: 'approved',
            comments: 'Approved for conference'
          });
          resolve();
        }, 50);
      });
    });
    
    // Wait for execution to complete
    const result = await executePromise;
    
    // Verify execution completed
    expect(result.completed).toBe(true);
    expect(result.state.approvalDecision).toEqual({
      decision: 'approved',
      comments: 'Approved for conference'
    });
    
    // Verify events were emitted
    const eventTypes = events.map(e => e.event);
    expect(eventTypes).toContain(WorkflowEvent.STARTED);
    expect(eventTypes).toContain(WorkflowEvent.WORKFLOW_PAUSED);
    expect(eventTypes).toContain(WorkflowEvent.HUMAN_INPUT_REQUIRED);
    expect(eventTypes).toContain(WorkflowEvent.HUMAN_INPUT_RECEIVED);
    expect(eventTypes).toContain(WorkflowEvent.WORKFLOW_RESUMED);
    expect(eventTypes).toContain(WorkflowEvent.WORKFLOW_COMPLETED);
  });
  
  it('should handle timeout in human nodes', async () => {
    const workflow: WorkflowDefinition = {
      id: 'timeout-test',
      name: 'Timeout Test Workflow',
      initialState: {},
      elements: [
        new ApproveExpenseNode()
      ]
    };
    
    const executor = new WorkflowExecutor(workflow, { 
      eventEmitter,
      timeout: 60000 // Workflow timeout
    });
    
    // Execute with very short timeout
    const result = await executor.execute({
      initialState: {
        currentExpense: { amount: 100 },
        requester: { name: 'Test User' },
        _nodeConfigs: {
          approveExpense: { timeout: 50 } // 50ms timeout
        }
      }
    });
    
    // Should complete but with timeout edge
    expect(result.completed).toBe(true);
    expect(result.state).toBeDefined();
    
    // The last executed node should have returned timeout edge
    const nodeEvents = await new Promise<any[]>((resolve) => {
      const nodeCompleted: any[] = [];
      eventEmitter.on(WorkflowEvent.NODE_COMPLETED, (event) => {
        nodeCompleted.push(event);
      });
      
      setTimeout(() => resolve(nodeCompleted), 100);
    });
    
    // Should have timeout edge
    expect(nodeEvents.some(e => e.data.edge === 'timeout')).toBe(true);
  });
  
  it('should handle cancellation of human tasks', async () => {
    const workflow: WorkflowDefinition = {
      id: 'cancel-test',
      name: 'Cancel Test Workflow',
      initialState: {},
      elements: [
        new ApproveExpenseNode()
      ]
    };
    
    const executor = new WorkflowExecutor(workflow, { eventEmitter });
    let tokenId: string;
    
    // Listen for pause event
    eventEmitter.once(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event) => {
      tokenId = event.data.tokenId;
    });
    
    // Start execution
    const executePromise = executor.execute({
      initialState: {
        currentExpense: { amount: 100 },
        requester: { name: 'Test User' }
      }
    });
    
    // Wait for pause then cancel
    await new Promise(resolve => setTimeout(resolve, 50));
    const runtime = (executor as any).runtimeContext;
    runtime.cancel(tokenId);
    
    // Wait for result
    const result = await executePromise;
    
    // Should complete with error edge
    expect(result.completed).toBe(true);
  });
});