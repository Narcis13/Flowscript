import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { embedMany } from 'ai';
import { getEmbeddingModel, chunkArray } from './utils';

interface EmbedMultipleConfig {
    model: string;
    texts?: string[];
    textsPath?: string;
    chunkSize?: number;
    dimensions?: number;
}

@RegisterNode
export class EmbedMultipleNode implements Node {
    metadata: NodeMetadata = {
        name: 'embedMultiple',
        description: 'Generate embeddings for multiple texts',
        type: 'action',
        ai_hints: {
            purpose: 'Batch embedding generation for efficiency',
            when_to_use: 'When processing multiple texts for vector storage',
            expected_edges: ['success', 'error'],
            example_usage: 'Index documents, batch similarity processing'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const embedConfig = config as EmbedMultipleConfig;

        if (!embedConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        // Get texts
        let texts = embedConfig.texts;
        
        if (!texts && embedConfig.textsPath) {
            texts = state.get(embedConfig.textsPath);
        }

        if (!texts || !Array.isArray(texts)) {
            return {
                error: () => ({
                    message: 'Texts array is required',
                    code: 'MISSING_TEXTS'
                })
            };
        }

        if (texts.length === 0) {
            return {
                error: () => ({
                    message: 'Texts array cannot be empty',
                    code: 'EMPTY_TEXTS'
                })
            };
        }

        // Ensure all items are strings
        const values = texts.map(text => 
            typeof text === 'string' ? text : JSON.stringify(text)
        );

        try {
            // Chunk the texts for batch processing
            const chunkSize = embedConfig.chunkSize || 100;
            const chunks = chunkArray(values, chunkSize);
            
            const allEmbeddings: number[][] = [];
            let totalUsage = {
                promptTokens: 0,
                totalTokens: 0
            };

            // Process each chunk
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                
                const requestParams: any = {
                    model: getEmbeddingModel(embedConfig.model),
                    values: chunk
                };

                // Add dimensions if specified
                if (embedConfig.dimensions) {
                    requestParams.experimental_providerMetadata = {
                        openai: {
                            dimensions: embedConfig.dimensions
                        }
                    };
                }

                const result = await embedMany(requestParams);
                
                allEmbeddings.push(...result.embeddings);
                
                // Aggregate usage
                if (result.usage) {
                    totalUsage.promptTokens += result.usage.promptTokens || 0;
                    totalUsage.totalTokens += result.usage.totalTokens || 0;
                }

                // Update progress in state
                state.set('embeddingProgress', {
                    processed: allEmbeddings.length,
                    total: values.length,
                    currentChunk: i + 1,
                    totalChunks: chunks.length
                });
            }

            // Store result in state
            state.set('lastEmbeddings', {
                embeddings: allEmbeddings,
                count: allEmbeddings.length,
                usage: totalUsage,
                model: embedConfig.model,
                dimensions: allEmbeddings[0]?.length || 0,
                timestamp: Date.now()
            });

            return {
                success: () => ({
                    embeddings: allEmbeddings,
                    count: allEmbeddings.length,
                    usage: totalUsage,
                    dimensions: allEmbeddings[0]?.length || 0,
                    chunksProcessed: chunks.length
                })
            };

        } catch (error) {
            console.error('Error in embedMultiple:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'EMBEDDING_ERROR'
                })
            };
        }
    }
}

export const embedMultiple = new EmbedMultipleNode();