/**
 * WhileCondition loop controller node
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';
import { evaluateExpression } from '../../utils/expression';

@RegisterNode
export class WhileConditionNode implements Node {
  metadata: NodeMetadata = {
    name: 'whileCondition',
    description: 'Loops while condition is true',
    type: 'control',
    ai_hints: {
      purpose: 'Loop control',
      when_to_use: 'When you need to repeat operations while a condition remains true',
      expected_edges: ['next_iteration', 'exit_loop'],
      example_usage: 'Retry until success, process until empty, wait for condition'
    }
  };

  async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
    if (!config?.condition) {
      throw new Error('Condition is required in config');
    }

    try {
      // Evaluate the condition expression
      const condition = evaluateExpression(config.condition, state);
      
      if (condition) {
        return {
          next_iteration: () => ({
            iteration: (state.get('$._loopIteration') || 0) + 1,
            conditionResult: true
          })
        };
      } else {
        return {
          exit_loop: () => ({
            totalIterations: state.get('$._loopIteration') || 0,
            conditionResult: false
          })
        };
      }
    } catch (error) {
      // If expression evaluation fails, exit the loop
      return {
        exit_loop: () => ({
          error: error instanceof Error ? error.message : String(error),
          conditionResult: false
        })
      };
    }
  }
}

export const whileCondition = new WhileConditionNode();