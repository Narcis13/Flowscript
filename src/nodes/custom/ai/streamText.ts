import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { streamText as aiStreamText } from 'ai';
import { getModel, loadTools } from './utils';

interface StreamTextConfig {
    model: string;
    prompt?: string;
    promptPath?: string;
    messages?: any[];
    messagesPath?: string;
    tools?: Record<string, any>;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    onChunk?: boolean;
}

@RegisterNode
export class StreamTextNode implements Node {
    metadata: NodeMetadata = {
        name: 'streamText',
        description: 'Stream text generation for real-time responses',
        type: 'action',
        ai_hints: {
            purpose: 'Stream AI responses for better UX with long outputs',
            when_to_use: 'When generating long content or need real-time feedback',
            expected_edges: ['streaming', 'complete', 'error', 'toolCallStreaming'],
            example_usage: 'Chat interfaces, real-time content generation'
        }
    };

    async execute({ state, runtime, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const streamConfig = config as StreamTextConfig;

        if (!streamConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
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
            const requestParams: any = {
                model: getModel(streamConfig.model),
                temperature: streamConfig.temperature,
                maxTokens: streamConfig.maxTokens
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

            // Add tools if provided
            if (streamConfig.tools) {
                requestParams.tools = loadTools(streamConfig.tools);
            }

            const result = await aiStreamText(requestParams);

            // Store stream reference for potential interruption
            state.set('activeAiStream', {
                streamId: runtime?.executionId || Date.now().toString(),
                model: streamConfig.model,
                startedAt: Date.now()
            });

            // Handle streaming in background
            (async () => {
                try {
                    let fullText = '';
                    let hasToolCalls = false;

                    for await (const chunk of result.textStream) {
                        fullText += chunk;
                        
                        // Emit chunk event if runtime is available
                        if (runtime) {
                            runtime.emit({
                                type: 'ai_stream_chunk',
                                chunk,
                                accumulatedText: fullText
                            });
                        }

                        // Update state if onChunk is enabled
                        if (streamConfig.onChunk) {
                            state.set('lastStreamChunk', {
                                chunk,
                                accumulatedText: fullText,
                                timestamp: Date.now()
                            });
                        }
                    }

                    // Wait for the full response
                    const finalResult = await result.response;

                    // Check for tool calls
                    if (finalResult.toolCalls && finalResult.toolCalls.length > 0) {
                        hasToolCalls = true;
                    }

                    // Store final result
                    state.set('lastStreamResult', {
                        text: fullText,
                        finishReason: finalResult.finishReason,
                        usage: finalResult.usage,
                        toolCalls: finalResult.toolCalls,
                        model: streamConfig.model,
                        timestamp: Date.now()
                    });

                    // Emit completion event
                    if (runtime) {
                        runtime.emit({
                            type: 'ai_stream_complete',
                            text: fullText,
                            finishReason: finalResult.finishReason,
                            usage: finalResult.usage,
                            hasToolCalls
                        });
                    }

                } catch (streamError) {
                    console.error('Error during streaming:', streamError);
                    if (runtime) {
                        runtime.emit({
                            type: 'ai_stream_error',
                            error: streamError instanceof Error ? streamError.message : String(streamError)
                        });
                    }
                }
            })();

            return {
                streaming: () => ({
                    streamId: runtime?.executionId || Date.now().toString(),
                    startedAt: Date.now(),
                    model: streamConfig.model
                })
            };

        } catch (error) {
            console.error('Error in streamText:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'STREAM_ERROR'
                })
            };
        }
    }
}

export const streamText = new StreamTextNode();