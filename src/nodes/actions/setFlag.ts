import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class SetFlagNode implements Node {
  metadata: NodeMetadata = {
    name: 'setFlag',
    description: 'Set or toggle boolean flags in workflow state',
    type: 'action',
    ai_hints: {
      purpose: 'Boolean flag management',
      when_to_use: 'When you need to set, clear, or toggle boolean flags for workflow control',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { 
      flagPath,
      operation = 'set',
      value = true,
      createIfMissing = true
    } = context.config || {};
    
    try {
      if (!flagPath) {
        throw new Error('flagPath is required');
      }
      
      // Get current flag value
      let currentValue = context.state.get(flagPath);
      
      // Handle missing flag
      if (currentValue === undefined || currentValue === null) {
        if (!createIfMissing && operation !== 'set') {
          throw new Error(`Flag not found at path: ${flagPath}`);
        }
        currentValue = false; // Default to false for missing flags
      }
      
      let newValue: boolean;
      
      switch (operation) {
        case 'set':
          newValue = value;
          break;
          
        case 'clear':
          newValue = false;
          break;
          
        case 'toggle':
          // Convert current value to boolean if needed
          newValue = !Boolean(currentValue);
          break;
          
        case 'setIf':
          // Only set if condition is met (value should be an object with condition and newValue)
          if (typeof value === 'object' && value.condition && value.newValue !== undefined) {
            const conditionMet = evaluateCondition(value.condition, context.state);
            newValue = conditionMet ? value.newValue : Boolean(currentValue);
          } else {
            throw new Error('setIf operation requires value with condition and newValue');
          }
          break;
          
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      
      // Update flag
      context.state.set(flagPath, newValue);
      
      return {
        success: () => ({
          flagPath,
          previousValue: currentValue,
          newValue,
          operation,
          changed: currentValue !== newValue
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          flagPath,
          operation
        })
      };
    }
  }
}

function evaluateCondition(condition: any, state: any): boolean {
  if (typeof condition === 'boolean') {
    return condition;
  }
  
  if (typeof condition === 'object') {
    const { path, operator, value } = condition;
    
    if (!path) {
      return false;
    }
    
    const stateValue = state.get(path);
    
    switch (operator) {
      case 'equals':
      case '==':
        return stateValue == value;
        
      case 'strictEquals':
      case '===':
        return stateValue === value;
        
      case 'notEquals':
      case '!=':
        return stateValue != value;
        
      case 'greaterThan':
      case '>':
        return stateValue > value;
        
      case 'lessThan':
      case '<':
        return stateValue < value;
        
      case 'greaterOrEqual':
      case '>=':
        return stateValue >= value;
        
      case 'lessOrEqual':
      case '<=':
        return stateValue <= value;
        
      case 'exists':
        return stateValue !== undefined && stateValue !== null;
        
      case 'notExists':
        return stateValue === undefined || stateValue === null;
        
      case 'truthy':
        return Boolean(stateValue);
        
      case 'falsy':
        return !Boolean(stateValue);
        
      default:
        return false;
    }
  }
  
  return false;
}

// Export the node instance for direct use
export const setFlag = new SetFlagNode();