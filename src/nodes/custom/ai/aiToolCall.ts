import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateText } from 'ai';
import { getModel, loadTool } from './utils';

interface AiToolCallConfig {
    model: string;
    toolName: string;
    toolChoice?: any;
    prompt?: string;
    promptPath?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

@RegisterNode
export class AiToolCallNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiToolCall',
        description: 'Execute AI with specific tool requirements',
        type: 'action',
        ai_hints: {
            purpose: 'Force AI to use specific tools',
            when_to_use: 'When you need AI to execute specific functions',
            expected_edges: ['toolExecuted', 'toolFailed', 'error'],
            example_usage: 'Structured workflows requiring specific AI actions'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const toolConfig = config as AiToolCallConfig;

        if (!toolConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!toolConfig?.toolName) {
            return {
                error: () => ({
                    message: 'Tool name is required',
                    code: 'MISSING_TOOL_NAME'
                })
            };
        }

        // Get prompt
        let prompt = toolConfig.prompt;
        
        if (!prompt && toolConfig.promptPath) {
            prompt = state.get(toolConfig.promptPath);
        }

        if (!prompt) {
            return {
                error: () => ({
                    message: 'Prompt is required',
                    code: 'MISSING_PROMPT'
                })
            };
        }

        try {
            // Load the specified tool
            const tool = loadTool(toolConfig.toolName);
            
            const requestParams: any = {
                model: getModel(toolConfig.model),
                prompt,
                temperature: toolConfig.temperature,
                maxTokens: toolConfig.maxTokens,
                tools: {
                    [toolConfig.toolName]: tool
                },
                toolChoice: toolConfig.toolChoice || { 
                    type: 'tool', 
                    toolName: toolConfig.toolName 
                }
            };

            // Add system prompt if provided
            if (toolConfig.systemPrompt) {
                requestParams.system = toolConfig.systemPrompt;
            }

            const result = await generateText(requestParams);

            // Check if the specified tool was called
            const toolCall = result.toolCalls?.find(tc => tc.toolName === toolConfig.toolName);

            if (toolCall) {
                // Execute the tool with the AI-provided arguments
                let toolResult;
                try {
                    toolResult = await tool.execute(toolCall.args);
                } catch (toolError) {
                    return {
                        toolFailed: () => ({
                            reason: 'Tool execution failed',
                            toolName: toolConfig.toolName,
                            args: toolCall.args,
                            error: toolError instanceof Error ? toolError.message : String(toolError)
                        })
                    };
                }

                // Store result in state
                state.set('lastToolCall', {
                    toolName: toolConfig.toolName,
                    args: toolCall.args,
                    result: toolResult,
                    aiText: result.text,
                    timestamp: Date.now()
                });

                return {
                    toolExecuted: () => ({
                        toolName: toolConfig.toolName,
                        args: toolCall.args,
                        result: toolResult,
                        aiText: result.text,
                        usage: result.usage
                    })
                };
            }

            // Tool was not called
            return {
                toolFailed: () => ({
                    reason: 'Tool not called',
                    requestedTool: toolConfig.toolName,
                    actualTools: result.toolCalls?.map(tc => tc.toolName) || [],
                    text: result.text
                })
            };

        } catch (error) {
            console.error('Error in aiToolCall:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'TOOL_CALL_ERROR'
                })
            };
        }
    }
}

export const aiToolCall = new AiToolCallNode();