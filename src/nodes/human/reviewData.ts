/**
 * Human node for data review and confirmation
 */

import { NodeMetadata } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { BaseHumanNode, HumanNodeConfig } from './BaseHumanNode';
import { RegisterNode } from '../registry';

/**
 * Data review and confirmation human node
 */
@RegisterNode
export class ReviewDataNode extends BaseHumanNode {
  metadata: NodeMetadata = {
    name: 'reviewData',
    description: 'Present data for human review and confirmation',
    type: 'human',
    ai_hints: {
      purpose: 'Allow humans to review and confirm or modify data before proceeding',
      when_to_use: 'When data needs human verification before critical operations',
      expected_edges: ['confirmed', 'modified', 'rejected', 'timeout', 'error'],
      example_usage: 'Use before final submission, data updates, or critical actions'
    }
  };
  
  getConfig(context: ExecutionContext): HumanNodeConfig {
    // Get data to review from config or state
    const dataToReview = context.config?.dataKey 
      ? context.state.get(context.config.dataKey)
      : context.state.getState();
    
    // Build dynamic schema based on data
    const properties: Record<string, any> = {};
    const required: string[] = [];
    
    // Add confirmation field
    properties.confirmation = {
      type: 'string',
      title: 'Action',
      enum: ['confirm', 'modify', 'reject'],
      enumNames: ['Confirm Data', 'Modify Data', 'Reject'],
      default: 'confirm'
    };
    required.push('confirmation');
    
    // Add fields for each data item if modifying
    if (context.config?.allowModification !== false) {
      Object.entries(dataToReview).forEach(([key, value]) => {
        if (typeof value !== 'object' || value === null) {
          properties[`data_${key}`] = {
            type: typeof value === 'number' ? 'number' : 'string',
            title: this.formatFieldName(key),
            default: value
          };
        }
      });
    }
    
    // Add reason field for rejection
    properties.reason = {
      type: 'string',
      title: 'Reason',
      description: 'Please provide a reason',
      'ui:widget': 'textarea'
    };
    
    return {
      formSchema: {
        type: 'object',
        properties,
        required,
        dependencies: {
          confirmation: {
            oneOf: [
              {
                properties: {
                  confirmation: { const: 'reject' },
                  reason: { type: 'string', minLength: 1 }
                },
                required: ['reason']
              },
              {
                properties: {
                  confirmation: { enum: ['confirm', 'modify'] }
                }
              }
            ]
          }
        }
      },
      uiHints: {
        title: context.config?.title || 'Review Data',
        description: context.config?.description || 'Please review the data below and confirm, modify, or reject',
        submitLabel: 'Submit',
        cancelLabel: 'Cancel'
      },
      timeout: context.config?.timeout,
      defaultValues: {
        confirmation: 'confirm'
      }
    };
  }
  
  processInput(input: any, context: ExecutionContext): string {
    const action = input.confirmation;
    
    // Store the review result
    context.state.set('reviewResult', {
      action,
      reason: input.reason,
      timestamp: Date.now()
    });
    
    // Handle modifications
    if (action === 'modify') {
      const updates: Record<string, any> = {};
      
      // Extract modified data fields
      Object.entries(input).forEach(([key, value]) => {
        if (key.startsWith('data_')) {
          const dataKey = key.substring(5);
          updates[dataKey] = value;
        }
      });
      
      // Update state with modifications
      if (Object.keys(updates).length > 0) {
        if (context.config?.dataKey) {
          // Update specific data object
          const currentData = context.state.get(context.config.dataKey) || {};
          context.state.set(context.config.dataKey, {
            ...currentData,
            ...updates
          });
        } else {
          // Update root state
          context.state.update(updates);
        }
        
        context.state.set('dataModified', true);
        context.state.set('modifications', updates);
      }
      
      return 'modified';
    }
    
    // Map action to edge
    switch (action) {
      case 'confirm':
        return 'confirmed';
      case 'reject':
        return 'rejected';
      default:
        return 'error';
    }
  }
  
  validateInput(input: any, _context: ExecutionContext): boolean {
    if (!input || !input.confirmation) {
      return false;
    }
    
    const validActions = ['confirm', 'modify', 'reject'];
    if (!validActions.includes(input.confirmation)) {
      return false;
    }
    
    // If rejecting, ensure reason is provided
    if (input.confirmation === 'reject' && !input.reason) {
      return false;
    }
    
    return true;
  }
  
  protected getContextData(context: ExecutionContext): Record<string, any> {
    // Get the data to be reviewed
    const dataToReview = context.config?.dataKey 
      ? { [context.config.dataKey]: context.state.get(context.config.dataKey) }
      : context.state.getState();
    
    return {
      dataForReview: dataToReview,
      metadata: {
        timestamp: Date.now(),
        source: context.config?.source || 'workflow'
      }
    };
  }
  
  private formatFieldName(key: string): string {
    // Convert camelCase or snake_case to Title Case
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }
}