/**
 * Generic human form input node
 */

import { NodeMetadata } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { BaseHumanNode, HumanNodeConfig } from './BaseHumanNode';
import { RegisterNode } from '../registry';

/**
 * Generic form input human node
 */
@RegisterNode
export class FormInputNode extends BaseHumanNode {
  metadata: NodeMetadata = {
    name: 'formInput',
    description: 'Collect user input through a form',
    type: 'human',
    ai_hints: {
      purpose: 'Collect structured data from human users',
      when_to_use: 'When you need to gather information from users through a form interface',
      expected_edges: ['submitted', 'cancelled', 'timeout', 'error'],
      example_usage: 'Use for data collection, surveys, or any structured user input'
    }
  };
  
  getConfig(context: ExecutionContext): HumanNodeConfig {
    // Get form configuration from node config
    const formConfig = context.config?.form || {};
    
    return {
      formSchema: formConfig.schema || {
        type: 'object',
        properties: {
          input: {
            type: 'string',
            title: 'Input',
            description: 'Please provide your input'
          }
        },
        required: ['input']
      },
      uiHints: {
        title: formConfig.title || 'User Input Required',
        description: formConfig.description || 'Please fill out the form below',
        submitLabel: formConfig.submitLabel || 'Submit',
        cancelLabel: formConfig.cancelLabel || 'Cancel'
      },
      timeout: context.config?.timeout,
      defaultValues: formConfig.defaultValues || {}
    };
  }
  
  processInput(input: any, context: ExecutionContext): string {
    // Check if user cancelled
    if (input && input._cancelled) {
      return 'cancelled';
    }
    
    // Store the form data in state
    const stateKey = context.config?.stateKey || 'formData';
    context.state.set(stateKey, input);
    
    return 'submitted';
  }
  
  validateInput(input: any, context: ExecutionContext): boolean {
    // Basic validation - ensure we have input
    if (!input) {
      return false;
    }
    
    // Allow cancellation
    if (input._cancelled) {
      return true;
    }
    
    // If custom validation function is provided, use it
    if (context.config?.validate && typeof context.config.validate === 'function') {
      return context.config.validate(input);
    }
    
    return true;
  }
  
  protected getContextData(context: ExecutionContext): Record<string, any> {
    // If specific context keys are provided, return only those
    if (context.config?.contextKeys && Array.isArray(context.config.contextKeys)) {
      const contextData: Record<string, any> = {};
      for (const key of context.config.contextKeys) {
        contextData[key] = context.state.get(key);
      }
      return contextData;
    }
    
    // Otherwise return all state
    return context.state.getState();
  }
}

// Export the node instance for direct use
export const formInput = new FormInputNode();