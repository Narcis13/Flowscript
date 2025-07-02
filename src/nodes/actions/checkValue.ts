/**
 * CheckValue action node - checks if a value matches expected
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

@RegisterNode
export class CheckValueNode implements Node {
  metadata: NodeMetadata = {
    name: 'checkValue',
    description: 'Checks if a value at a path matches expected value',
    type: 'action',
    ai_hints: {
      purpose: 'Value comparison',
      when_to_use: 'When you need to branch based on a value',
      expected_edges: ['match', 'noMatch', 'error'],
      example_usage: 'Check status, verify response, compare values'
    }
  };

  async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
    try {
      if (!config?.path) {
        throw new Error('Path is required in config');
      }

      const actual = state.get(config.path);
      const expected = config.value;
      
      // Simple equality check
      const matches = actual === expected;
      
      if (matches) {
        return {
          match: () => ({
            path: config.path,
            actual,
            expected,
            timestamp: Date.now()
          })
        };
      } else {
        return {
          noMatch: () => ({
            path: config.path,
            actual,
            expected,
            timestamp: Date.now()
          })
        };
      }
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

export const checkValue = new CheckValueNode();