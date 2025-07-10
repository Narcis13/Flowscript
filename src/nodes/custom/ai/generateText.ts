import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateText as aiGenerateText } from 'ai';
import { getModel, loadTools } from './utils';

interface GenerateTextConfig {
    model: string;
    prompt?: string;
    promptPath?: string;
    messages?: any[];
    messagesPath?: string;
    tools?: Record<string, any>;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

@RegisterNode
export class GenerateTextNode implements Node {
    metadata: NodeMetadata = {
        name: 'generateText',
        description: 'Generate text using AI models with optional tool support',
        type: 'action',
        ai_hints: {
            purpose: 'Single-shot text generation with AI models',
            when_to_use: 'When you need a complete AI response without streaming',
            expected_edges: ['success', 'error', 'toolCallRequired'],
            example_usage: 'Get AI to answer questions, generate content, or analyze data'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const textConfig = config as GenerateTextConfig;

        if (!textConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        // Get prompt or messages
        let prompt = textConfig.prompt;
        let messages = textConfig.messages;

        if (!prompt && textConfig.promptPath) {
            prompt = state.get(textConfig.promptPath);
        }

        if (!messages && textConfig.messagesPath) {
            messages = state.get(textConfig.messagesPath);
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
                model: getModel(textConfig.model),
                temperature: textConfig.temperature,
                maxTokens: textConfig.maxTokens
            };

            // Add system prompt if provided
            if (textConfig.systemPrompt) {
                requestParams.system = textConfig.systemPrompt;
            }

            // Use prompt or messages
            if (prompt) {
                requestParams.prompt = prompt;
            } else if (messages) {
                requestParams.messages = messages;
            }

            // Add tools if provided
            if (textConfig.tools) {
                requestParams.tools = loadTools(textConfig.tools);
            }

            const result = await aiGenerateText(requestParams);

            // Store result in state
            state.set('lastAiGeneration', {
                text: result.text,
                finishReason: result.finishReason,
                usage: result.usage,
                model: textConfig.model,
                timestamp: Date.now()
            });

            // Check if tool calls are required
            if (result.toolCalls && result.toolCalls.length > 0) {
                return {
                    toolCallRequired: () => ({
                        text: result.text,
                        toolCalls: result.toolCalls,
                        usage: result.usage
                    })
                };
            }

            return {
                success: () => ({
                    text: result.text,
                    finishReason: result.finishReason,
                    usage: result.usage,
                    response: result.response
                })
            };

        } catch (error) {
            console.error('Error in generateText:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'GENERATION_ERROR'
                })
            };
        }
    }
}

export const generateText = new GenerateTextNode();