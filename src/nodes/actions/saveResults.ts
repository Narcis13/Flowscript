import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class SaveResultsNode implements Node {
  metadata: NodeMetadata = {
    name: 'saveResults',
    description: 'Persist processing results to various destinations',
    type: 'action',
    ai_hints: {
      purpose: 'Data persistence to various destinations',
      when_to_use: 'When you need to save data to files, databases, APIs, or workflow state',
      expected_edges: ['success', 'error']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { inputPath, destination, destinationType, format = 'json', options = {} } = context.config || {};
    
    try {
      // Get data to save from state
      const data = context.state.get(inputPath);
      
      if (data === undefined) {
        throw new Error(`No data found at path: ${inputPath}`);
      }
      
      // Format data based on specified format
      const formattedData = formatData(data, format);
      
      let saveResult: any;
      
      switch (destinationType) {
        case 'file':
          // Simulate file save
          saveResult = {
            type: 'file',
            path: destination,
            size: JSON.stringify(formattedData).length,
            format,
            timestamp: new Date().toISOString()
          };
          break;
          
        case 'database':
          // Simulate database save
          saveResult = {
            type: 'database',
            table: options.tableName || 'results',
            recordsAffected: Array.isArray(data) ? data.length : 1,
            operation: options.append ? 'append' : 'replace',
            timestamp: new Date().toISOString()
          };
          break;
          
        case 'api':
          // Simulate API call to save data
          const response = await fetch(destination, {
            method: options.method || 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...options.headers
            },
            body: JSON.stringify(formattedData)
          });
          
          if (!response.ok) {
            throw new Error(`API save failed: ${response.status} ${response.statusText}`);
          }
          
          saveResult = {
            type: 'api',
            endpoint: destination,
            status: response.status,
            timestamp: new Date().toISOString()
          };
          break;
          
        case 'state':
          // Save to workflow state
          if (options.append) {
            const existingData = context.state.get(destination);
            if (Array.isArray(existingData)) {
              context.state.set(destination, [...existingData, ...(Array.isArray(data) ? data : [data])]);
            } else {
              context.state.set(destination, data);
            }
          } else {
            context.state.set(destination, data);
          }
          
          saveResult = {
            type: 'state',
            path: destination,
            operation: options.append ? 'append' : 'replace',
            timestamp: new Date().toISOString()
          };
          break;
          
        default:
          throw new Error(`Unknown destination type: ${destinationType}`);
      }
      
      return {
        success: () => ({
          saved: true,
          ...saveResult,
          itemsSaved: Array.isArray(data) ? data.length : 1
        })
      };
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          inputPath,
          destination,
          destinationType
        })
      };
    }
  }
}

function formatData(data: any, format: string): any {
  switch (format) {
    case 'json':
      return data;
      
    case 'csv':
      // Simple CSV conversion for arrays of objects
      if (!Array.isArray(data)) {
        return String(data);
      }
      
      if (data.length === 0) {
        return '';
      }
      
      // Get headers from first object
      const headers = Object.keys(data[0]);
      const csvRows = [headers.join(',')];
      
      // Convert each object to CSV row
      for (const item of data) {
        const values = headers.map(header => {
          const value = item[header];
          // Escape values containing commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        });
        csvRows.push(values.join(','));
      }
      
      return csvRows.join('\n');
      
    case 'xml':
      // Simple XML conversion
      return convertToXml(data);
      
    case 'raw':
      return String(data);
      
    default:
      return data;
  }
}

function convertToXml(data: any, rootName = 'root'): string {
  if (Array.isArray(data)) {
    const items = data.map((item) => 
      convertToXml(item, 'item')
    ).join('\n');
    return `<${rootName}>\n${items}\n</${rootName}>`;
  }
  
  if (typeof data === 'object' && data !== null) {
    const elements = Object.entries(data).map(([key, value]) => {
      if (typeof value === 'object') {
        return convertToXml(value, key);
      }
      return `  <${key}>${escapeXml(String(value))}</${key}>`;
    }).join('\n');
    return `<${rootName}>\n${elements}\n</${rootName}>`;
  }
  
  return `<${rootName}>${escapeXml(String(data))}</${rootName}>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Export the node instance for direct use
export const saveResults = new SaveResultsNode();