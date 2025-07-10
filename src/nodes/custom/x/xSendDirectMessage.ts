import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XSendDirectMessageConfig {
    recipientId: string;
    text?: string;
    mediaId?: string;
}

@RegisterNode
export class XSendDirectMessageNode implements Node {
    metadata: NodeMetadata = {
        name: 'xSendDirectMessage',
        description: 'Send a direct message to a user',
        type: 'action',
        ai_hints: {
            purpose: 'Private communication with users',
            when_to_use: 'For customer support, notifications, or private conversations',
            expected_edges: ['message_sent', 'recipient_not_found', 'dm_disabled', 'rate_limited']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const messageConfig = config as XSendDirectMessageConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                recipient_not_found: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!messageConfig?.recipientId) {
            return {
                recipient_not_found: () => ({
                    error: 'Recipient ID is required',
                    details: 'Provide the ID of the user to send message to'
                })
            };
        }

        if (!messageConfig.text && !messageConfig.mediaId) {
            return {
                recipient_not_found: () => ({
                    error: 'Message content required',
                    details: 'Provide either text or media ID for the message'
                })
            };
        }

        if (messageConfig.text && messageConfig.text.length > 10000) {
            return {
                recipient_not_found: () => ({
                    error: 'Message text too long',
                    length: messageConfig.text.length,
                    maxLength: 10000
                })
            };
        }

        try {
            const requestBody: any = {
                event_type: 'MessageCreate',
                message_create: {
                    target: {
                        recipient_id: messageConfig.recipientId
                    },
                    message_data: {}
                }
            };

            if (messageConfig.text) {
                requestBody.message_create.message_data.text = messageConfig.text;
            }

            if (messageConfig.mediaId) {
                requestBody.message_create.message_data.attachment = {
                    type: 'media',
                    media: {
                        id: messageConfig.mediaId
                    }
                };
            }

            const response = await fetch('https://api.twitter.com/2/dm_conversations/with/:participant_id/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dm_conversation_id: await this.getOrCreateConversation(messageConfig.recipientId, bearerToken),
                    ...requestBody
                })
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    recipient_not_found: () => ({
                        error: 'Recipient not found',
                        recipientId: messageConfig.recipientId,
                        details: 'The user does not exist or has been suspended'
                    })
                };
            }

            if (response.status === 403) {
                return {
                    dm_disabled: () => ({
                        error: 'Direct messages disabled',
                        recipientId: messageConfig.recipientId,
                        details: 'The recipient has disabled direct messages or you are not allowed to message them'
                    })
                };
            }

            if (response.status === 429) {
                const resetTime = response.headers.get('x-rate-limit-reset');
                return {
                    rate_limited: () => ({
                        error: 'Rate limit exceeded',
                        resetAt: resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : undefined,
                        details: 'Direct message rate limit reached'
                    })
                };
            }

            if (!response.ok) {
                return {
                    recipient_not_found: () => ({
                        error: 'Failed to send direct message',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                messageId: responseData.data.dm_event_id,
                conversationId: responseData.data.dm_conversation_id,
                recipientId: messageConfig.recipientId,
                text: messageConfig.text,
                hasMedia: !!messageConfig.mediaId,
                sentAt: new Date().toISOString()
            };

            state.set('lastDirectMessage', result);

            return {
                message_sent: () => result
            };

        } catch (error) {
            console.error('Error in xSendDirectMessage:', error);
            return {
                recipient_not_found: () => ({
                    error: 'Failed to send direct message',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }

    private async getOrCreateConversation(recipientId: string, bearerToken: string): Promise<string> {
        // In a real implementation, this would check for existing conversation
        // or create a new one. For now, we'll use a placeholder approach.
        // The actual X API v2 DM endpoints work differently.
        return `conv_${recipientId}`;
    }
}

export const xSendDirectMessage = new XSendDirectMessageNode();