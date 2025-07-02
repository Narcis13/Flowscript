import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class ProcessDataNode implements Node {
  metadata: NodeMetadata = {
    name: 'processData',
    description: 'Process and transform data batches',
    type: 'action',
    ai_hints: {
      purpose: 'Data processing and transformation',
      when_to_use: 'When you need to transform, aggregate, filter, or batch process data',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { inputPath, processingType, operation, outputPath, batchSize } = context.config || {};
    
    try {
      // Get input data from state
      const inputData = context.state.get(inputPath);
      
      if (inputData === undefined) {
        throw new Error(`No data found at path: ${inputPath}`);
      }
      
      let processedData: any;
      
      switch (processingType) {
        case 'transform':
          processedData = await applyTransformation(inputData, operation);
          break;
          
        case 'aggregate':
          processedData = await applyAggregation(inputData, operation);
          break;
          
        case 'filter':
          processedData = await applyFilter(inputData, operation);
          break;
          
        case 'batch':
          processedData = await processBatch(inputData, operation, batchSize || 100);
          break;
          
        default:
          throw new Error(`Unknown processing type: ${processingType}`);
      }
      
      // Store result in state if outputPath is provided
      if (outputPath) {
        context.state.set(outputPath, processedData);
      }
      
      return {
        success: () => ({
          processedData,
          itemsProcessed: Array.isArray(processedData) ? processedData.length : 1,
          processingType,
          operation: operation?.type
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          inputPath,
          processingType,
          operation
        })
      };
    }
  }
}

async function applyTransformation(data: any, operation: any): Promise<any> {
  switch (operation.type) {
    case 'map':
      if (!Array.isArray(data)) {
        throw new Error('Map operation requires array input');
      }
      return data.map(item => {
        // Apply transformation logic based on params
        if (operation.params?.fields) {
          const result: any = {};
          for (const field of operation.params.fields) {
            result[field] = item[field];
          }
          return result;
        }
        return item;
      });
      
    case 'format':
      // Format data according to params
      if (operation.params?.template) {
        return JSON.stringify(data, null, 2);
      }
      return data;
      
    default:
      return data;
  }
}

async function applyAggregation(data: any, operation: any): Promise<any> {
  if (!Array.isArray(data)) {
    throw new Error('Aggregation requires array input');
  }
  
  switch (operation.type) {
    case 'sum':
      const field = operation.params?.field;
      if (!field) return 0;
      return data.reduce((sum, item) => sum + (item[field] || 0), 0);
      
    case 'count':
      return data.length;
      
    case 'group':
      const groupBy = operation.params?.groupBy;
      if (!groupBy) return data;
      
      const groups: Record<string, any[]> = {};
      for (const item of data) {
        const key = item[groupBy];
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
      return groups;
      
    default:
      return data;
  }
}

async function applyFilter(data: any, operation: any): Promise<any> {
  if (!Array.isArray(data)) {
    throw new Error('Filter operation requires array input');
  }
  
  switch (operation.type) {
    case 'condition':
      const { field, operator, value } = operation.params || {};
      if (!field) return data;
      
      return data.filter(item => {
        switch (operator) {
          case 'equals':
            return item[field] === value;
          case 'notEquals':
            return item[field] !== value;
          case 'greaterThan':
            return item[field] > value;
          case 'lessThan':
            return item[field] < value;
          case 'contains':
            return String(item[field]).includes(value);
          default:
            return true;
        }
      });
      
    case 'unique':
      const uniqueField = operation.params?.field;
      if (!uniqueField) return data;
      
      const seen = new Set();
      return data.filter(item => {
        const key = item[uniqueField];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
    default:
      return data;
  }
}

async function processBatch(data: any, _operation: any, batchSize: number): Promise<any> {
  if (!Array.isArray(data)) {
    throw new Error('Batch processing requires array input');
  }
  
  const batches = [];
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    // Process each batch according to operation
    const processedBatch = {
      batchIndex: Math.floor(i / batchSize),
      items: batch,
      size: batch.length,
      processed: true
    };
    
    batches.push(processedBatch);
  }
  
  return {
    totalItems: data.length,
    batchSize,
    batchCount: batches.length,
    batches
  };
}

// Export the node instance for direct use
export const processData = new ProcessDataNode();