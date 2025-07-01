/**
 * ValidateData action node implementation
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

/**
 * Mock validation function - replace with actual implementation
 */
async function validateAgainstSchema(data: any): Promise<boolean> {
  // Basic validation logic - can be replaced with JSON Schema validation
  if (data === null || data === undefined) {
    return false;
  }
  
  // Example: Check if it's an object with required fields
  if (typeof data === 'object' && !Array.isArray(data)) {
    // Add your validation logic here
    return true;
  }
  
  return false;
}

/**
 * Mock function to get validation errors
 */
function getValidationErrors(data: any): string[] {
  const errors: string[] = [];
  
  if (data === null || data === undefined) {
    errors.push('Data is null or undefined');
  }
  
  if (typeof data !== 'object') {
    errors.push('Data must be an object');
  }
  
  // Add more validation error logic as needed
  return errors;
}

/**
 * ValidateData node - validates input data against a schema
 */
@RegisterNode
export class ValidateDataNode implements Node {
  metadata: NodeMetadata = {
    name: 'validateData',
    description: 'Validates input data against schema',
    type: 'action',
    ai_hints: {
      purpose: 'Data validation',
      when_to_use: 'When input needs to be verified',
      expected_edges: ['valid', 'invalid', 'error']
    }
  };

  async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
    try {
      const data = state.get(config?.dataPath || '$.input');
      const isValid = await validateAgainstSchema(data);
      
      if (isValid) {
        return {
          valid: () => ({ validatedAt: Date.now() })
        };
      } else {
        return {
          invalid: () => ({ errors: getValidationErrors(data) })
        };
      }
    } catch (error) {
      return {
        error: () => ({ message: error instanceof Error ? error.message : String(error) })
      };
    }
  }
}

// Export the node instance for direct use
export const validateData = new ValidateDataNode();