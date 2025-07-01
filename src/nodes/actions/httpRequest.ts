/**
 * HTTPRequest action node - makes HTTP requests
 */

import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';
import { RegisterNode } from '../registry';

@RegisterNode
export class HTTPRequestNode implements Node {
  metadata: NodeMetadata = {
    name: 'httpRequest',
    description: 'Makes HTTP requests to external APIs',
    type: 'action',
    ai_hints: {
      purpose: 'External API communication',
      when_to_use: 'When you need to fetch data from or send data to external services',
      expected_edges: ['success', 'error', 'timeout'],
      example_usage: 'Call REST APIs, fetch data, send webhooks'
    }
  };

  async execute({ config }: ExecutionContext): Promise<SimpleEdgeMap> {
    try {
      if (!config?.url) {
        throw new Error('URL is required in config');
      }

      const headers: Record<string, string> = config.headers || {};
      const options: RequestInit = {
        method: config.method || 'GET',
        headers: headers,
      };

      // Add body for non-GET requests
      if (config.body && config.method !== 'GET') {
        options.body = typeof config.body === 'string' 
          ? config.body 
          : JSON.stringify(config.body);
        
        // Set content-type if not already set
        if (!headers['Content-Type'] && typeof config.body === 'object') {
          headers['Content-Type'] = 'application/json';
        }
      }

      // Add timeout
      const timeout = config.timeout || 30000;
      const controller = new AbortController();
      options.signal = controller.signal;
      
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(config.url, options);
        clearTimeout(timeoutId);

        const responseData = await response.text();
        let parsedData: any;
        
        try {
          parsedData = JSON.parse(responseData);
        } catch {
          parsedData = responseData;
        }

        if (response.ok) {
          return {
            success: () => ({
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              data: parsedData
            })
          };
        } else {
          return {
            error: () => ({
              status: response.status,
              statusText: response.statusText,
              data: parsedData
            })
          };
        }
      } catch (err) {
        clearTimeout(timeoutId);
        
        if (err instanceof Error && err.name === 'AbortError') {
          return {
            timeout: () => ({
              message: 'Request timed out',
              timeout: timeout
            })
          };
        }
        
        throw err;
      }
    } catch (error) {
      return {
        error: () => ({
          message: error instanceof Error ? error.message : String(error),
          url: config?.url
        })
      };
    }
  }
}

export const httpRequest = new HTTPRequestNode();