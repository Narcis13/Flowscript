/**
 * Schema Converter for FlowScript Nodes to JSON Schema
 * 
 * This module converts FlowScript node configurations to JSON Schema format,
 * which is required by the MCP protocol for tool parameter definitions.
 * 
 * The converter analyzes node metadata and common patterns to generate
 * appropriate schemas that AI models can understand and use.
 * 
 * @example
 * const schema = SchemaConverter.nodeToJSONSchema(httpRequestNode);
 * // Returns JSON Schema for the node's configuration parameters
 */

import { Node, NodeMetadata } from '../../core/types/node';

/**
 * JSON Schema type definitions
 * These follow the JSON Schema Draft 7 specification
 */
export interface JSONSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: any[];
  default?: any;
  examples?: any[];
  additionalProperties?: boolean | JSONSchema;
  // Number-specific
  minimum?: number;
  maximum?: number;
  // String-specific
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  // Array-specific
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

/**
 * Schema conversion options
 */
export interface SchemaConversionOptions {
  /** Include examples in the schema */
  includeExamples?: boolean;
  
  /** Add descriptions from AI hints */
  includeAIHints?: boolean;
  
  /** Make all properties required by default */
  strictRequired?: boolean;
}

/**
 * Common node configuration patterns
 * These are patterns we've identified across FlowScript nodes
 */
export const CommonConfigPatterns = {
  /** HTTP Request configuration */
  httpRequest: {
    url: { type: 'string', format: 'uri', description: 'Target URL for the request' },
    method: { 
      type: 'string', 
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      default: 'GET',
      description: 'HTTP method'
    },
    headers: { 
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'HTTP headers'
    },
    body: { 
      description: 'Request body (for non-GET requests)'
    },
    timeout: {
      type: 'number',
      minimum: 0,
      default: 30000,
      description: 'Request timeout in milliseconds'
    }
  },
  
  /** Data validation configuration */
  validation: {
    schema: {
      type: 'object',
      description: 'JSON Schema for validation'
    },
    strict: {
      type: 'boolean',
      default: true,
      description: 'Strict validation mode'
    }
  },
  
  /** Loop control configuration */
  loop: {
    maxIterations: {
      type: 'number',
      minimum: 1,
      default: 100,
      description: 'Maximum number of iterations'
    },
    condition: {
      type: 'string',
      description: 'Loop condition expression'
    }
  },
  
  /** Human interaction configuration */
  humanInteraction: {
    prompt: {
      type: 'string',
      description: 'Message to display to the user'
    },
    timeout: {
      type: 'number',
      minimum: 0,
      description: 'Timeout in milliseconds (0 = no timeout)'
    },
    formSchema: {
      type: 'object',
      description: 'JSON Schema for form inputs'
    }
  }
} as const;

/**
 * Main Schema Converter class
 */
export class SchemaConverter {
  /**
   * Convert a FlowScript node to a JSON Schema for its configuration
   * 
   * @param node - The FlowScript node to convert
   * @param options - Conversion options
   * @returns JSON Schema for the node's configuration
   */
  static nodeToJSONSchema(
    node: Node,
    options: SchemaConversionOptions = {}
  ): JSONSchema {
    const metadata = node.metadata;
    const schema: JSONSchema = {
      type: 'object',
      description: this.generateSchemaDescription(metadata, options),
      properties: {},
      additionalProperties: false
    };
    
    // Infer schema based on node name and type
    const inferredProperties = this.inferProperties(metadata);
    if (inferredProperties) {
      schema.properties = inferredProperties.properties || {};
      schema.required = inferredProperties.required;
    }
    
    // Add common properties based on node type
    if (metadata.type === 'human' && metadata.humanInteraction) {
      this.addHumanInteractionSchema(schema, metadata.humanInteraction);
    }
    
    // Add examples if requested
    if (options.includeExamples && metadata.ai_hints.example_usage) {
      schema.examples = this.generateExamples(metadata);
    }
    
    return schema;
  }
  
  /**
   * Generate a comprehensive description for the schema
   */
  private static generateSchemaDescription(
    metadata: NodeMetadata,
    options: SchemaConversionOptions
  ): string {
    let description = metadata.description;
    
    if (options.includeAIHints && metadata.ai_hints) {
      description += `\n\nPurpose: ${metadata.ai_hints.purpose}`;
      description += `\nUse when: ${metadata.ai_hints.when_to_use}`;
      if (metadata.ai_hints.expected_edges.length > 0) {
        description += `\nPossible outcomes: ${metadata.ai_hints.expected_edges.join(', ')}`;
      }
    }
    
    return description;
  }
  
  /**
   * Infer properties based on node metadata
   * This is where we apply our knowledge of common FlowScript patterns
   */
  private static inferProperties(metadata: NodeMetadata): {
    properties: Record<string, JSONSchema>;
    required?: string[];
  } | null {
    // Check for known node patterns
    switch (metadata.name) {
      case 'httpRequest':
        return {
          properties: CommonConfigPatterns.httpRequest,
          required: ['url']
        };
        
      case 'validateData':
        return {
          properties: CommonConfigPatterns.validation,
          required: ['schema']
        };
        
      case 'whileCondition':
      case 'forEach':
        return {
          properties: CommonConfigPatterns.loop,
          required: ['condition']
        };
        
      case 'checkValue':
        return {
          properties: {
            expression: {
              type: 'string',
              description: 'Expression to evaluate (uses state variables)'
            },
            expectedValue: {
              description: 'Expected value for comparison'
            },
            operator: {
              type: 'string',
              enum: ['==', '!=', '>', '<', '>=', '<=', 'includes', 'matches'],
              default: '==',
              description: 'Comparison operator'
            }
          },
          required: ['expression']
        };
        
      case 'setData':
        return {
          properties: {
            updates: {
              type: 'object',
              description: 'Key-value pairs to set in state',
              additionalProperties: true
            }
          },
          required: ['updates']
        };
        
      case 'delay':
        return {
          properties: {
            duration: {
              type: 'number',
              minimum: 0,
              description: 'Delay duration in milliseconds'
            }
          },
          required: ['duration']
        };
        
      default:
        // For unknown nodes, try to infer from name
        return this.inferFromName(metadata.name);
    }
  }
  
  /**
   * Try to infer configuration from node name
   */
  private static inferFromName(name: string): {
    properties: Record<string, JSONSchema>;
    required?: string[];
  } | null {
    // Common patterns in node names
    if (name.includes('fetch') || name.includes('get')) {
      return {
        properties: {
          source: {
            type: 'string',
            description: 'Data source identifier or URL'
          },
          parameters: {
            type: 'object',
            description: 'Additional parameters',
            additionalProperties: true
          }
        }
      };
    }
    
    if (name.includes('send') || name.includes('notify')) {
      return {
        properties: {
          recipient: {
            type: 'string',
            description: 'Recipient identifier or address'
          },
          message: {
            type: 'string',
            description: 'Message content'
          },
          options: {
            type: 'object',
            description: 'Additional options',
            additionalProperties: true
          }
        },
        required: ['recipient', 'message']
      };
    }
    
    if (name.includes('process') || name.includes('transform')) {
      return {
        properties: {
          input: {
            description: 'Input data to process'
          },
          operation: {
            type: 'string',
            description: 'Operation or transformation to apply'
          },
          options: {
            type: 'object',
            description: 'Processing options',
            additionalProperties: true
          }
        }
      };
    }
    
    // Default fallback for unknown patterns
    return {
      properties: {
        config: {
          type: 'object',
          description: 'Node-specific configuration',
          additionalProperties: true
        }
      }
    };
  }
  
  /**
   * Add human interaction schema properties
   */
  private static addHumanInteractionSchema(
    schema: JSONSchema,
    humanInteraction: any
  ): void {
    if (!schema.properties) {
      schema.properties = {};
    }
    
    // Add human interaction specific properties
    Object.assign(schema.properties, {
      prompt: {
        type: 'string',
        description: 'Message or instructions to show the human user'
      },
      timeout: {
        type: 'number',
        minimum: 0,
        default: humanInteraction.timeout || 0,
        description: 'Time to wait for human response (0 = indefinite)'
      }
    });
    
    // If there's a form schema, include it
    if (humanInteraction.formSchema) {
      schema.properties.expectedInputs = {
        type: 'object',
        description: 'Expected structure of human input',
        properties: humanInteraction.formSchema.properties || {},
        required: humanInteraction.formSchema.required || []
      };
    }
  }
  
  /**
   * Generate examples based on node metadata
   */
  private static generateExamples(metadata: NodeMetadata): any[] {
    const examples: any[] = [];
    
    // Add basic example based on inferred schema
    switch (metadata.name) {
      case 'httpRequest':
        examples.push({
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer token123'
          }
        });
        break;
        
      case 'setData':
        examples.push({
          updates: {
            processedCount: 10,
            status: 'completed',
            timestamp: '2024-01-01T00:00:00Z'
          }
        });
        break;
        
      case 'checkValue':
        examples.push({
          expression: 'state.count',
          operator: '>',
          expectedValue: 5
        });
        break;
    }
    
    return examples;
  }
  
  /**
   * Validate that a configuration matches the generated schema
   * This is useful for debugging and testing
   */
  static validateConfig(
    config: any,
    schema: JSONSchema
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    
    // Basic type checking
    if (schema.type && typeof config !== schema.type) {
      errors.push(`Expected type ${schema.type}, got ${typeof config}`);
    }
    
    // Check required properties
    if (schema.required && schema.properties) {
      for (const prop of schema.required) {
        if (!(prop in config)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }
    
    // Validate properties
    if (schema.properties && typeof config === 'object') {
      for (const [key, value] of Object.entries(config)) {
        if (schema.additionalProperties === false && !(key in schema.properties)) {
          errors.push(`Unexpected property: ${key}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}