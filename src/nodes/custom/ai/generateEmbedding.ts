import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { embed } from 'ai';
import { getEmbeddingModel } from './utils';

interface GenerateEmbeddingConfig {
    model: string;
    text?: string;
    textPath?: string;
    dimensions?: number;
}

@RegisterNode
export class GenerateEmbeddingNode implements Node {
    metadata: NodeMetadata = {
        name: 'generateEmbedding',
        description: 'Generate embeddings for text',
        type: 'action',
        ai_hints: {
            purpose: 'Convert text to vector embeddings',
            when_to_use: 'For semantic search, similarity, or RAG applications',
            expected_edges: ['success', 'error'],
            example_usage: 'Create searchable embeddings, find similar content'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const embedConfig = config as GenerateEmbeddingConfig;

        if (!embedConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        // Get text
        let text = embedConfig.text;
        
        if (!text && embedConfig.textPath) {
            text = state.get(embedConfig.textPath);
        }

        if (!text) {
            return {
                error: () => ({
                    message: 'Text is required',
                    code: 'MISSING_TEXT'
                })
            };
        }

        // Ensure text is a string
        if (typeof text !== 'string') {
            text = JSON.stringify(text);
        }

        try {
            const requestParams: any = {
                model: getEmbeddingModel(embedConfig.model),
                value: text
            };

            // Add dimensions if specified
            if (embedConfig.dimensions) {
                requestParams.experimental_providerMetadata = {
                    openai: {
                        dimensions: embedConfig.dimensions
                    }
                };
            }

            const result = await embed(requestParams);

            // Store result in state
            state.set('lastEmbedding', {
                embedding: result.embedding,
                usage: result.usage,
                model: embedConfig.model,
                textLength: text.length,
                dimensions: result.embedding.length,
                timestamp: Date.now()
            });

            return {
                success: () => ({
                    embedding: result.embedding,
                    usage: result.usage,
                    dimensions: result.embedding.length,
                    textLength: text.length
                })
            };

        } catch (error) {
            console.error('Error in generateEmbedding:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'EMBEDDING_ERROR'
                })
            };
        }
    }
}

export const generateEmbedding = new GenerateEmbeddingNode();