import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateText } from 'ai';
import { getModel, convertToModelMessages, loadConversationTools } from './utils';

interface ContinueConversationConfig {
    model: string;
    userMessage: string;
    maxSteps?: number;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    includeTools?: boolean;
}

@RegisterNode
export class ContinueConversationNode implements Node {
    metadata: NodeMetadata = {
        name: 'continueConversation',
        description: 'Continue an AI conversation with context',
        type: 'action',
        ai_hints: {
            purpose: 'Maintain conversation context across multiple turns',
            when_to_use: 'For chat interfaces and multi-turn interactions',
            expected_edges: ['responded', 'toolsUsed', 'error'],
            example_usage: 'Chatbots, conversational AI, context-aware responses'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const convConfig = config as ContinueConversationConfig;

        if (!convConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!convConfig?.userMessage) {
            return {
                error: () => ({
                    message: 'User message is required',
                    code: 'MISSING_USER_MESSAGE'
                })
            };
        }

        try {
            // Get conversation history from state
            let messages = state.get('conversation.messages') || state.get('conversationMessages') || [];
            
            // Ensure messages is an array
            if (!Array.isArray(messages)) {
                messages = [];
            }

            // Add the new user message
            messages.push({ 
                role: 'user', 
                content: convConfig.userMessage 
            });

            const requestParams: any = {
                model: getModel(convConfig.model),
                messages: convertToModelMessages(messages),
                temperature: convConfig.temperature,
                maxTokens: convConfig.maxTokens,
                maxSteps: convConfig.maxSteps || 5
            };

            // Add system prompt if provided
            if (convConfig.systemPrompt) {
                requestParams.system = convConfig.systemPrompt;
            }

            // Add tools if requested
            if (convConfig.includeTools !== false) {
                requestParams.tools = loadConversationTools();
            }

            const result = await generateText(requestParams);

            // Update conversation history with assistant response
            messages.push({
                role: 'assistant',
                content: result.text
            });

            // If tools were used, add tool messages
            if (result.toolCalls && result.toolCalls.length > 0) {
                for (const toolCall of result.toolCalls) {
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify({
                            toolName: toolCall.toolName,
                            args: toolCall.args,
                            result: toolCall.result
                        })
                    });
                }
            }

            // Store updated conversation in state
            state.set('conversation', {
                messages,
                lastUpdate: Date.now(),
                turnCount: messages.filter(m => m.role === 'user').length
            });

            state.set('conversationMessages', messages); // Alternative path for backward compatibility

            // Determine which edge to return
            if (result.toolCalls && result.toolCalls.length > 0) {
                return {
                    toolsUsed: () => ({
                        assistantMessage: result.text,
                        messages,
                        toolCalls: result.toolCalls.map(tc => ({
                            toolName: tc.toolName,
                            args: tc.args,
                            result: tc.result
                        })),
                        usage: result.usage,
                        turnCount: messages.filter(m => m.role === 'user').length
                    })
                };
            }

            return {
                responded: () => ({
                    assistantMessage: result.text,
                    messages,
                    toolsUsed: false,
                    usage: result.usage,
                    turnCount: messages.filter(m => m.role === 'user').length
                })
            };

        } catch (error) {
            console.error('Error in continueConversation:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'CONVERSATION_ERROR'
                })
            };
        }
    }
}

export const continueConversation = new ContinueConversationNode();