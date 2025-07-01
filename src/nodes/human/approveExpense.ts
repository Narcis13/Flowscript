/**
 * Human node for expense approval
 */

import { NodeMetadata } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { BaseHumanNode, HumanNodeConfig } from './BaseHumanNode';
import { RegisterNode } from '../registry';

/**
 * Expense approval human node
 */
@RegisterNode
export class ApproveExpenseNode extends BaseHumanNode {
  metadata: NodeMetadata = {
    name: 'approveExpense',
    description: 'Request human approval for an expense',
    type: 'human',
    ai_hints: {
      purpose: 'Get human approval for expense requests',
      when_to_use: 'When an expense needs manager approval based on amount or policy',
      expected_edges: ['approved', 'rejected', 'needsInfo', 'timeout', 'error'],
      example_usage: 'Use in expense approval workflows when amount exceeds auto-approval threshold'
    },
    humanInteraction: {
      timeout: 86400000 // 24 hours default
    }
  };
  
  getConfig(context: ExecutionContext): HumanNodeConfig {
    // Get expense data from state
    const expense = context.state.get('currentExpense') || {};
    const requester = context.state.get('requester') || {};
    
    return {
      formSchema: {
        type: 'object',
        properties: {
          decision: {
            type: 'string',
            title: 'Decision',
            enum: ['approved', 'rejected', 'needsInfo'],
            enumNames: ['Approve', 'Reject', 'Request More Information']
          },
          comments: {
            type: 'string',
            title: 'Comments',
            description: 'Add any comments or reasons for your decision'
          },
          additionalInfoNeeded: {
            type: 'string',
            title: 'Information Needed',
            description: 'If requesting more info, specify what is needed',
            'ui:widget': 'textarea',
            'ui:options': {
              rows: 3
            }
          }
        },
        required: ['decision'],
        dependencies: {
          decision: {
            oneOf: [
              {
                properties: {
                  decision: { const: 'needsInfo' },
                  additionalInfoNeeded: { 
                    type: 'string',
                    minLength: 1
                  }
                },
                required: ['additionalInfoNeeded']
              },
              {
                properties: {
                  decision: { 
                    enum: ['approved', 'rejected'] 
                  }
                }
              }
            ]
          }
        }
      },
      uiHints: {
        title: `Expense Approval Request`,
        description: `Please review and approve the expense request from ${requester.name || 'Unknown'}`,
        submitLabel: 'Submit Decision',
        cancelLabel: 'Cancel'
      },
      timeout: context.config?.timeout || 86400000, // 24 hours
      defaultValues: {
        decision: 'approved'
      }
    };
  }
  
  processInput(input: any, context: ExecutionContext): string {
    // Store the decision in state
    context.state.set('approvalDecision', input);
    
    // Return the appropriate edge based on decision
    return input.decision || 'error';
  }
  
  validateInput(input: any, context: ExecutionContext): boolean {
    // Ensure we have a decision
    if (!input || !input.decision) {
      return false;
    }
    
    // Validate decision is one of the expected values
    const validDecisions = ['approved', 'rejected', 'needsInfo'];
    if (!validDecisions.includes(input.decision)) {
      return false;
    }
    
    // If needsInfo, ensure we have additional info specified
    if (input.decision === 'needsInfo' && !input.additionalInfoNeeded) {
      return false;
    }
    
    return true;
  }
  
  protected getContextData(context: ExecutionContext): Record<string, any> {
    // Provide relevant context for the approval decision
    const expense = context.state.get('currentExpense') || {};
    const requester = context.state.get('requester') || {};
    const history = context.state.get('approvalHistory') || [];
    
    return {
      expense: {
        amount: expense.amount,
        category: expense.category,
        description: expense.description,
        date: expense.date,
        receipts: expense.receipts
      },
      requester: {
        name: requester.name,
        department: requester.department,
        email: requester.email
      },
      policy: {
        autoApprovalLimit: context.state.get('autoApprovalLimit') || 500,
        requiresReceipts: expense.amount > 50
      },
      history: history
    };
  }
}