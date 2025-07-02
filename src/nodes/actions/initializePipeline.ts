import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class InitializePipelineNode implements Node {
  metadata: NodeMetadata = {
    name: 'initializePipeline',
    description: 'Initialize a workflow pipeline with context and configuration',
    type: 'action',
    ai_hints: {
      purpose: 'Pipeline initialization and setup',
      when_to_use: 'At the start of a workflow to set up initial state and configuration',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { 
      pipelineId, 
      configuration = {}, 
      initialData = {},
      metadata = {},
      clearState = false 
    } = context.config || {};
    
    try {
      // Clear state if requested
      if (clearState) {
        // Get all keys and clear them
        const currentState = context.state.get('$');
        for (const key of Object.keys(currentState)) {
          context.state.set(key, undefined);
        }
      }
      
      // Initialize pipeline metadata
      context.state.set('pipeline', {
        id: pipelineId || `pipeline-${Date.now()}`,
        startTime: new Date().toISOString(),
        status: 'running',
        metadata,
        configuration
      });
      
      // Set initial data
      if (Object.keys(initialData).length > 0) {
        for (const [key, value] of Object.entries(initialData)) {
          context.state.set(key, value);
        }
      }
      
      // Initialize common pipeline structures
      context.state.set('pipeline.errors', []);
      context.state.set('pipeline.warnings', []);
      context.state.set('pipeline.metrics', {
        itemsProcessed: 0,
        startTime: Date.now(),
        lastUpdateTime: Date.now()
      });
      
      // Set up any required configurations
      if (configuration.retryPolicy) {
        context.state.set('pipeline.retryPolicy', configuration.retryPolicy);
      }
      
      if (configuration.timeout) {
        context.state.set('pipeline.timeout', configuration.timeout);
      }
      
      return {
        success: () => ({
          pipelineId: context.state.get('pipeline.id'),
          initialized: true,
          configuration,
          timestamp: new Date().toISOString()
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          failedAt: 'pipeline_initialization'
        })
      };
    }
  }
}

// Export the node instance for direct use
export const initializePipeline = new InitializePipelineNode();