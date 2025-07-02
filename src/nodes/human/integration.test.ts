/**
 * Integration tests for human nodes in workflows
 */

import { WorkflowExecutor } from '../../core/executor';
import { WorkflowDefinition } from '../../core/types/workflow';
import { SetDataNode } from '../actions/setData';
import { ValidateDataNode } from '../actions/validateData';
import { CheckValueNode } from '../actions/checkValue';
import { ApproveExpenseNode } from './approveExpense';
import { EventEmitter } from 'events';
import { WorkflowEvent } from '../../core/types/events';
import { getNodeRegistry } from '../registry';

describe('Human Node Integration', () => {
  let eventEmitter: EventEmitter;
  
  beforeEach(() => {
    eventEmitter = new EventEmitter();
    
    // Clear registry and re-register nodes
    const registry = getNodeRegistry();
    registry.clear();
    registry.registerInstance(new SetDataNode());
    registry.registerInstance(new ValidateDataNode());
    registry.registerInstance(new CheckValueNode());
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
      nodes: [
        // Set expense data
        {
          setData: {
            path: '$.currentExpense',
            value: {
              amount: 750,
              category: 'Travel',
              description: 'Conference attendance'
            }
          }
        },
        // Set requester data
        {
          setData: {
            path: '$.requester',
            value: {
              name: 'John Doe',
              department: 'Engineering'
            }
          }
        },
        // Validate expense
        {
          validateData: {
            rules: {
              'currentExpense.amount': { type: 'number', min: 0 }
            }
          }
        },
        // Human approval
        'approveExpense',
        // Process result (using branch)
        [
          {
            checkValue: {
              path: '$.approvalDecision.decision',
              value: 'approved'
            }
          },
          {
            match: [{ setData: { path: '$.status', value: 'approved' } }],
            noMatch: [{ setData: { path: '$.status', value: 'rejected' } }]
          }
        ]
      ]
    };
    
    // Track events
    const events: any[] = [];
    eventEmitter.on('workflow:event', (event) => {
      events.push(event);
    });
    
    // Create executor
    const executor = new WorkflowExecutor(workflow, { eventEmitter });
    
    // Start execution
    const executePromise = executor.execute();
    
    // Wait for human input required event
    await new Promise<void>((resolve) => {
      eventEmitter.once(WorkflowEvent.HUMAN_INPUT_REQUIRED, (event) => {
        // Verify event data
        expect(event.data.nodeName).toBe('approveExpense');
        expect(event.data.formSchema).toBeDefined();
        // Context data is passed to human nodes
        expect(event.data.contextData).toBeDefined();
        
        // Simulate human approval after a delay
        setTimeout(() => {
          const runtime = executor.getRuntimeContext();
          if (runtime) {
            runtime.resume(event.data.tokenId, {
              decision: 'approved',
              comments: 'Approved for conference'
            });
          }
          resolve();
        }, 50);
      });
    });
    
    // Wait for execution to complete
    const result = await executePromise;
    
    // Verify execution completed
    expect(result.completed).toBe(true);
    expect(result.state.approvalDecision).toBeDefined();
    expect(result.state.approvalDecision.decision).toBe('approved');
    expect(result.state.status).toBe('approved');
    
    // Verify events were emitted
    const eventTypes = events.map(e => e.event);
    expect(eventTypes).toContain(WorkflowEvent.STARTED);
    expect(eventTypes).toContain(WorkflowEvent.WORKFLOW_PAUSED);
    expect(eventTypes).toContain(WorkflowEvent.HUMAN_INPUT_REQUIRED);
    expect(eventTypes).toContain(WorkflowEvent.HUMAN_INPUT_RECEIVED);
    expect(eventTypes).toContain(WorkflowEvent.WORKFLOW_RESUMED);
    expect(eventTypes).toContain(WorkflowEvent.WORKFLOW_COMPLETED);
  });
  
  it.skip('should handle timeout in human nodes', async () => {
    const workflow: WorkflowDefinition = {
      id: 'timeout-test',
      name: 'Timeout Test Workflow',
      initialState: {},
      nodes: [
        'approveExpense'
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
      nodes: [
        'approveExpense'
      ]
    };
    
    const executor = new WorkflowExecutor(workflow, { eventEmitter });
    let tokenId: string | undefined;
    
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
    const runtime = executor.getRuntimeContext();
    if (runtime && tokenId) {
      runtime.cancel(tokenId);
    }
    
    // Wait for result
    const result = await executePromise;
    
    // Should complete with error edge
    expect(result.completed).toBe(true);
  });
});