import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class IncrementCounterNode implements Node {
  metadata: NodeMetadata = {
    name: 'incrementCounter',
    description: 'Increment a counter in state by a specified amount',
    type: 'action',
    ai_hints: {
      purpose: 'Counter management and increment operations',
      when_to_use: 'When you need to track counts, iterations, or accumulate values',
      expected_edges: ['success', 'limit_reached', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { 
      counterPath = 'counter',
      incrementBy = 1,
      limit,
      resetOnLimit = false,
      createIfMissing = true
    } = context.config || {};
    
    try {
      // Get current counter value
      let currentValue = context.state.get(counterPath);
      
      // Initialize if missing
      if (currentValue === undefined || currentValue === null) {
        if (createIfMissing) {
          currentValue = 0;
        } else {
          throw new Error(`Counter not found at path: ${counterPath}`);
        }
      }
      
      // Ensure it's a number
      if (typeof currentValue !== 'number') {
        throw new Error(`Value at ${counterPath} is not a number: ${typeof currentValue}`);
      }
      
      // Calculate new value
      const newValue = currentValue + incrementBy;
      
      // Check limit if specified
      if (limit !== undefined && newValue >= limit) {
        if (resetOnLimit) {
          // Reset counter
          context.state.set(counterPath, 0);
          
          return {
            limit_reached: () => ({
              previousValue: currentValue,
              limit,
              reset: true,
              counterPath
            })
          };
        } else {
          // Keep at limit
          context.state.set(counterPath, limit);
          
          return {
            limit_reached: () => ({
              previousValue: currentValue,
              newValue: limit,
              limit,
              counterPath
            })
          };
        }
      }
      
      // Update counter
      context.state.set(counterPath, newValue);
      
      return {
        success: () => ({
          previousValue: currentValue,
          newValue,
          incrementBy,
          counterPath
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          counterPath
        })
      };
    }
  }
}

// Export the node instance for direct use
export const incrementCounter = new IncrementCounterNode();