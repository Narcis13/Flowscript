/**
 * Delay action node - adds delays to workflow execution
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

@RegisterNode
export class DelayNode implements Node {
  metadata: NodeMetadata = {
    name: 'delay',
    description: 'Delays workflow execution for a specified duration',
    type: 'action',
    ai_hints: {
      purpose: 'Timing control',
      when_to_use: 'When you need to wait before proceeding, rate limiting, or scheduling',
      expected_edges: ['complete', 'cancelled'],
      example_usage: 'Wait between API calls, delay retry attempts, scheduled tasks'
    }
  };

  async execute({ config }: ExecutionContext): Promise<SimpleEdgeMap> {
    try {
      const duration = config?.duration || config?.ms || 1000;
      const startTime = Date.now();
      
      // Create a promise that resolves after the delay
      const delayPromise = new Promise(resolve => setTimeout(resolve, duration));
      
      // For now, we'll just wait
      // In a real implementation, this could be cancellable via runtime events
      await delayPromise;
      
      return {
        complete: () => ({
          duration: duration,
          startTime: startTime,
          endTime: Date.now(),
          actualDuration: Date.now() - startTime
        })
      };
    } catch (error) {
      // If the delay is interrupted (future implementation)
      return {
        cancelled: () => ({
          message: 'Delay was cancelled',
          duration: config?.duration || config?.ms || 1000,
          startTime: Date.now()
        })
      };
    }
  }
}

export const delay = new DelayNode();