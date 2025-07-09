import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class MarkAsReadNode implements Node {
    metadata: NodeMetadata = {
        name: 'markAsRead',
        description: 'Marks an email as read in Gmail',
        type: 'action',
        ai_hints: {
            purpose: 'Mark an email message as read',
            when_to_use: 'When you need to mark an email as read',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Mark email as read using message ID'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");
        const profile = state.get("gmail_profile");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            if (!config?.messageId) {
                return { config_error: () => ({ error: "Message ID is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // Remove the UNREAD label to mark as read
            await gmail.users.messages.modify({
                userId: config.userId || profile?.emailAddress || 'me',
                id: config.messageId,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });

            const resultPayload = {
                messageId: config.messageId,
                markedAsReadAt: new Date().toISOString()
            };

            state.set('lastEmailMarkedAsRead', resultPayload);

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in markAsRead:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ messageId: config?.messageId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to mark email as read',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const markAsRead = new MarkAsReadNode();