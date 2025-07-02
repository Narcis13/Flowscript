import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class FetchDataNode implements Node {
  metadata: NodeMetadata = {
    name: 'fetchData',
    description: 'Retrieve data from various sources',
    type: 'action',
    ai_hints: {
      purpose: 'Data retrieval from various sources',
      when_to_use: 'When you need to fetch data from APIs, databases, files, or memory',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { source, sourceType, query, options = {} } = context.config || {};
    
    try {
      let data: any;
      
      switch (sourceType) {
        case 'api':
          const response = await fetch(source, {
            method: options.method || 'GET',
            headers: options.headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined
          });
          
          if (!response.ok) {
            throw new Error(`API fetch failed: ${response.status} ${response.statusText}`);
          }
          
          data = await response.json();
          break;
          
        case 'database':
          // Placeholder for database fetch logic
          // In a real implementation, this would use a database client
          data = { message: 'Database fetch not implemented', query };
          break;
          
        case 'file':
          // Placeholder for file system fetch logic
          // In a real implementation, this would use fs module
          data = { message: 'File fetch not implemented', path: source };
          break;
          
        case 'memory':
          // Fetch from workflow state using StateManager's get method
          data = context.state.get(source);
          break;
          
        default:
          throw new Error(`Unknown source type: ${sourceType}`);
      }
      
      return {
        success: () => data
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          source,
          sourceType
        })
      };
    }
  }
}

// Export the node instance for direct use
export const fetchData = new FetchDataNode();