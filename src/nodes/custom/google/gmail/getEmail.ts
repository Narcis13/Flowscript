import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class GetEmailNode implements Node {
    metadata: NodeMetadata = {
        name: 'getEmail',
        description: 'Gets a specific email by ID from Gmail',
        type: 'action',
        ai_hints: {
            purpose: 'Retrieve a specific email message by its ID',
            when_to_use: 'When you need to get the full content of a specific email',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Get email content using message ID'
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

            const response = await gmail.users.messages.get({
                userId: config.userId || profile?.emailAddress || 'me',
                id: config.messageId,
                format: config.format || 'full'
            });

            const message = response.data;

            if (!message) {
                return { not_found: () => ({ messageId: config.messageId }) };
            }

            // Helper function to extract headers
            const findHeader = (headers: any[], name: string): string => {
                const header = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
                return header?.value || '';
            };

            // Helper function to extract body
            const extractBody = (payload: any): { text?: string; html?: string } => {
                const result: { text?: string; html?: string } = {};

                const extractFromPart = (part: any) => {
                    if (part.mimeType === 'text/plain' && part.body?.data) {
                        result.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    } else if (part.mimeType === 'text/html' && part.body?.data) {
                        result.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    }

                    if (part.parts) {
                        part.parts.forEach(extractFromPart);
                    }
                };

                if (payload) {
                    extractFromPart(payload);
                }

                return result;
            };

            const headers = message.payload?.headers || [];
            const body = extractBody(message.payload);

            const resultPayload = {
                id: message.id,
                threadId: message.threadId,
                from: findHeader(headers, 'From'),
                to: findHeader(headers, 'To'),
                cc: findHeader(headers, 'Cc'),
                subject: findHeader(headers, 'Subject'),
                date: findHeader(headers, 'Date'),
                snippet: message.snippet,
                body: body,
                labelIds: message.labelIds,
                internalDate: message.internalDate,
                sizeEstimate: message.sizeEstimate
            };

            state.set('lastEmailRetrieved', { 
                messageId: config.messageId, 
                subject: resultPayload.subject,
                retrievedAt: new Date().toISOString() 
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in getEmail:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ messageId: config?.messageId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to get email',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const getEmail = new GetEmailNode();