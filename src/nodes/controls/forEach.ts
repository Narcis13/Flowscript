/**
 * ForEach loop controller node
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

@RegisterNode
export class ForEachNode implements Node {
  metadata: NodeMetadata = {
    name: 'forEach',
    description: 'Iterates over array items',
    type: 'control',
    ai_hints: {
      purpose: 'Array iteration',
      when_to_use: 'When you need to process each item in an array',
      expected_edges: ['next_iteration', 'exit_loop'],
      example_usage: 'Process list of documents, iterate through users, batch operations'
    }
  };

  async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
    if (!config?.items) {
      throw new Error('Items path is required in config');
    }

    if (!config?.as) {
      throw new Error('Iterator variable name (as) is required in config');
    }

    try {
      // Get the array to iterate over
      const items = state.get(config.items);
      
      // Validate it's an array
      if (!Array.isArray(items)) {
        return {
          exit_loop: () => ({
            error: 'Items is not an array',
            itemsPath: config.items,
            itemsType: typeof items
          })
        };
      }

      // Get current index from state
      const currentIndex = state.get('$._loopIndex') || 0;
      
      if (currentIndex < items.length) {
        // Continue iteration
        return {
          next_iteration: () => ({
            [config.as]: items[currentIndex],
            _loopIndex: currentIndex + 1,
            _totalItems: items.length,
            _isFirst: currentIndex === 0,
            _isLast: currentIndex === items.length - 1
          })
        };
      } else {
        // Exit loop - reset loop index
        return {
          exit_loop: () => ({ 
            _loopIndex: 0,
            totalProcessed: items.length
          })
        };
      }
    } catch (error) {
      return {
        exit_loop: () => ({
          error: error instanceof Error ? error.message : String(error),
          itemsPath: config.items
        })
      };
    }
  }
}

export const forEach = new ForEachNode();