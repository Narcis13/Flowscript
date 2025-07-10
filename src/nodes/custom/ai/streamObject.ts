import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { streamObject as aiStreamObject } from 'ai';
import { getModel, parseSchema } from './utils';

interface StreamObjectConfig {
    model: string;
    schema: any;
    output?: 'object' | 'array' | 'enum';
    prompt?: string;
    promptPath?: string;
    messages?: any[];
    messagesPath?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    mode?: 'json' | 'tool' | 'auto';
}

@RegisterNode
export class StreamObjectNode implements Node {
    metadata: NodeMetadata = {
        name: 'streamObject',
        description: 'Stream structured object generation',
        type: 'action',
        ai_hints: {
            purpose: "Stream partial objects as they're generated",
            when_to_use: 'For progressive UI updates with structured data',
            expected_edges: ['streaming', 'complete', 'error'],
            example_usage: 'Real-time form generation, progressive data extraction'
        }
    };

    async execute({ state, runtime, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const streamConfig = config as StreamObjectConfig;

        if (!streamConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!streamConfig?.schema) {
            return {
                error: () => ({
                    message: 'Schema is required',
                    code: 'MISSING_SCHEMA'
                })
            };
        }

        // Get prompt or messages
        let prompt = streamConfig.prompt;
        let messages = streamConfig.messages;

        if (!prompt && streamConfig.promptPath) {
            prompt = state.get(streamConfig.promptPath);
        }

        if (!messages && streamConfig.messagesPath) {
            messages = state.get(streamConfig.messagesPath);
        }

        if (!prompt && !messages) {
            return {
                error: () => ({
                    message: 'Either prompt or messages is required',
                    code: 'MISSING_INPUT'
                })
            };
        }

        try {
            // Parse schema
            const parsedSchema = parseSchema(streamConfig.schema);

            const requestParams: any = {
                model: getModel(streamConfig.model),
                schema: parsedSchema,
                output: streamConfig.output || 'object',
                temperature: streamConfig.temperature,
                maxTokens: streamConfig.maxTokens,
                mode: streamConfig.mode || 'auto'
            };

            // Add system prompt if provided
            if (streamConfig.systemPrompt) {
                requestParams.system = streamConfig.systemPrompt;
            }

            // Use prompt or messages
            if (prompt) {
                requestParams.prompt = prompt;
            } else if (messages) {
                requestParams.messages = messages;
            }

            const result = await aiStreamObject(requestParams);

            // Store stream reference
            state.set('activeObjectStream', {
                streamId: runtime?.executionId || Date.now().toString(),
                model: streamConfig.model,
                schema: streamConfig.schema,
                startedAt: Date.now()
            });

            // Handle streaming in background
            (async () => {
                try {
                    let finalObject: any;

                    // Stream partial objects
                    for await (const partialObject of result.partialObjectStream) {
                        finalObject = partialObject;
                        
                        // Emit partial object event
                        if (runtime) {
                            runtime.emit({
                                type: 'ai_partial_object',
                                data: partialObject,
                                streamId: runtime.executionId
                            });
                        }

                        // Update state with partial object
                        state.set('lastPartialObject', {
                            data: partialObject,
                            timestamp: Date.now()
                        });
                    }

                    // Wait for the full response
                    const fullResult = await result.object;

                    // Store final result
                    state.set('lastStreamedObject', {
                        object: fullResult,
                        usage: result.usage,
                        finishReason: result.finishReason,
                        model: streamConfig.model,
                        timestamp: Date.now()
                    });

                    // Emit completion event
                    if (runtime) {
                        runtime.emit({
                            type: 'ai_object_complete',
                            object: fullResult,
                            usage: result.usage,
                            finishReason: result.finishReason
                        });
                    }

                } catch (streamError) {
                    console.error('Error during object streaming:', streamError);
                    if (runtime) {
                        runtime.emit({
                            type: 'ai_object_stream_error',
                            error: streamError instanceof Error ? streamError.message : String(streamError)
                        });
                    }
                }
            })();

            return {
                streaming: () => ({
                    streamType: 'object',
                    output: streamConfig.output || 'object',
                    schema: streamConfig.schema,
                    streamId: runtime?.executionId || Date.now().toString(),
                    startedAt: Date.now()
                })
            };

        } catch (error) {
            console.error('Error in streamObject:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'STREAM_ERROR'
                })
            };
        }
    }
}

export const streamObject = new StreamObjectNode();