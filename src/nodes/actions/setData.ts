/**
 * SetData action node - sets data in the state
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

@RegisterNode
export class SetDataNode implements Node {
  metadata: NodeMetadata = {
    name: 'setData',
    description: 'Sets data at a specified path in the state',
    type: 'action',
    ai_hints: {
      purpose: 'State modification',
      when_to_use: 'When you need to store or update data in the workflow state',
      expected_edges: ['success', 'error'],
      example_usage: 'Set user data, store API responses, update counters'
    }
  };

  async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
    try {
      if (!config?.path) {
        throw new Error('Path is required in config');
      }

      const value = config.value !== undefined ? config.value : config.data;
      
      // Set the data
      state.set(config.path, value);
      
      return {
        success: () => ({
          path: config.path,
          value: value,
          timestamp: Date.now()
        })
      };
    } catch (error) {
      return {
        error: () => ({
          message: error instanceof Error ? error.message : String(error),
          path: config?.path
        })
      };
    }
  }
}

export const setData = new SetDataNode();