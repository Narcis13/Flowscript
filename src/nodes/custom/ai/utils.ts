import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { tool } from 'ai';

// Create provider instances with API keys
const openaiProvider = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || ''
});

const anthropicProvider = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Model mapping with environment variable support
export function getModel(modelName: string) {
    const models: Record<string, any> = {
        // OpenAI models
        'gpt-4': openaiProvider('gpt-4'),
        'gpt-4-turbo': openaiProvider('gpt-4-turbo'),
        'gpt-3.5-turbo': openaiProvider('gpt-3.5-turbo'),
        'gpt-4o': openaiProvider('gpt-4o'),
        'gpt-4o-mini': openaiProvider('gpt-4o-mini'),
        
        // Anthropic models
        'claude-3-opus': anthropicProvider('claude-3-opus-20240229'),
        'claude-3-sonnet': anthropicProvider('claude-3-sonnet-20240229'),
        'claude-3-haiku': anthropicProvider('claude-3-haiku-20240307'),
        'claude-3-5-sonnet': anthropicProvider('claude-3-5-sonnet-20241022')
    };

    return models[modelName] || models['gpt-4o-mini']; // Default model
}

// Embedding model mapping
export function getEmbeddingModel(modelName: string) {
    const models: Record<string, any> = {
        'text-embedding-3-small': openaiProvider.embedding('text-embedding-3-small'),
        'text-embedding-3-large': openaiProvider.embedding('text-embedding-3-large'),
        'text-embedding-ada-002': openaiProvider.embedding('text-embedding-ada-002')
    };

    return models[modelName] || models['text-embedding-3-small'];
}

// Parse schema from string or object
export function parseSchema(schema: any): z.ZodSchema {
    if (typeof schema === 'string') {
        // Simple parsing for basic types
        const typeMap: Record<string, z.ZodSchema> = {
            'string': z.string(),
            'number': z.number(),
            'boolean': z.boolean(),
            'array': z.array(z.any()),
            'object': z.object({})
        };
        return typeMap[schema] || z.any();
    }
    
    // If it's already a Zod schema, return it
    if (schema._def) {
        return schema;
    }
    
    // Convert plain object to Zod schema
    return z.object(schema);
}

// Load tools from configuration
export function loadTools(tools: Record<string, any>): Record<string, any> {
    const loadedTools: Record<string, any> = {};
    
    for (const [name, config] of Object.entries(tools)) {
        loadedTools[name] = tool({
            description: config.description || `Tool: ${name}`,
            parameters: parseSchema(config.parameters || z.object({})),
            execute: config.execute || (async (args: any) => ({ result: `Executed ${name}` }))
        });
    }
    
    return loadedTools;
}

// Load a single tool
export function loadTool(toolName: string): any {
    // This is a placeholder - in a real implementation, tools would be loaded from a registry
    return tool({
        description: `Tool: ${toolName}`,
        parameters: z.object({
            input: z.string()
        }),
        execute: async ({ input }) => ({ result: `Executed ${toolName} with ${input}` })
    });
}

// Convert state messages to model messages
export function convertToModelMessages(messages: any[]): any[] {
    return messages.map(msg => {
        if (typeof msg === 'string') {
            return { role: 'user', content: msg };
        }
        return {
            role: msg.role || 'user',
            content: msg.content || msg.text || msg.message || ''
        };
    });
}

// Load conversation tools
export function loadConversationTools(): Record<string, any> {
    return {
        search: tool({
            description: 'Search for information',
            parameters: z.object({
                query: z.string()
            }),
            execute: async ({ query }) => ({ 
                result: `Search results for: ${query}` 
            })
        }),
        calculate: tool({
            description: 'Perform calculations',
            parameters: z.object({
                expression: z.string()
            }),
            execute: async ({ expression }) => {
                try {
                    // Simple eval for demo - in production use a proper expression parser
                    const result = eval(expression);
                    return { result: result.toString() };
                } catch (error) {
                    return { error: 'Invalid expression' };
                }
            }
        })
    };
}

// Chunk array for batch processing
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// Validate code syntax (placeholder implementation)
export async function validateCode(code: string, _language: string): Promise<boolean> {
    // This is a placeholder - in production, use proper syntax validators
    // For now, just check if code is not empty
    return code.trim().length > 0;
}

// Model capabilities helper
export const modelCapabilities = {
    'gpt-4': { 
        cost: 'high', 
        capabilities: ['complex-reasoning', 'tools', 'vision'],
        speed: 'medium',
        contextWindow: 128000
    },
    'gpt-4o': { 
        cost: 'high', 
        capabilities: ['complex-reasoning', 'tools', 'vision'],
        speed: 'fast',
        contextWindow: 128000
    },
    'gpt-4o-mini': { 
        cost: 'low', 
        capabilities: ['reasoning', 'tools'],
        speed: 'fast',
        contextWindow: 128000
    },
    'gpt-3.5-turbo': { 
        cost: 'low', 
        capabilities: ['basic-reasoning', 'tools'],
        speed: 'very-fast',
        contextWindow: 16385
    },
    'claude-3-opus': {
        cost: 'high',
        capabilities: ['complex-reasoning', 'tools', 'vision', 'long-context'],
        speed: 'medium',
        contextWindow: 200000
    },
    'claude-3-5-sonnet': {
        cost: 'medium',
        capabilities: ['reasoning', 'tools', 'vision', 'long-context'],
        speed: 'fast',
        contextWindow: 200000
    },
    'claude-3-haiku': {
        cost: 'low',
        capabilities: ['basic-reasoning', 'tools'],
        speed: 'very-fast',
        contextWindow: 200000
    }
};