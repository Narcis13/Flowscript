import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class SendEmailNode implements Node {
    metadata: NodeMetadata = {
        name: 'sendEmail',
        description: 'Sends an email using Gmail',
        type: 'action',
        ai_hints: {
            purpose: 'Send an email through Gmail',
            when_to_use: 'When you need to send an email message',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Send email with subject and body to recipients'
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

            // Validate required fields
            if (!config?.to) {
                return { config_error: () => ({ error: "Recipient email address (to) is required" }) };
            }

            if (!config?.subject && !config?.body) {
                return { config_error: () => ({ error: "Either subject or body is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // Build email message
            const emailLines = [];
            
            // Add headers
            emailLines.push(`From: ${profile?.emailAddress || 'me'}`);
            emailLines.push(`To: ${config.to}`);
            
            if (config.cc) {
                emailLines.push(`Cc: ${config.cc}`);
            }
            
            if (config.bcc) {
                emailLines.push(`Bcc: ${config.bcc}`);
            }
            
            emailLines.push(`Subject: ${config.subject || '(No Subject)'}`);
            emailLines.push('Content-Type: text/plain; charset=utf-8');
            emailLines.push('');
            emailLines.push(config.body || '');

            // Convert to base64
            const message = emailLines.join('\r\n');
            const encodedMessage = Buffer.from(message).toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            // Send email
            const result = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            const resultPayload = {
                messageId: result.data.id,
                threadId: result.data.threadId,
                to: config.to,
                subject: config.subject || '(No Subject)',
                sentAt: new Date().toISOString()
            };

            state.set('lastEmailSent', resultPayload);

            return { success: () => resultPayload };

        } catch (error) {
            console.error('Error in sendEmail:', error);
            return {
                error: () => ({
                    message: 'Failed to send email',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const sendEmail = new SendEmailNode();