import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class SearchEmailsNode implements Node {
    metadata: NodeMetadata = {
        name: 'searchEmails',
        description: 'Searches emails in Gmail using advanced query syntax',
        type: 'action',
        ai_hints: {
            purpose: 'Search for emails using Gmail search operators',
            when_to_use: 'When you need to find emails based on specific criteria',
            expected_edges: ['success', 'no_results', 'error', 'config_error'],
            example_usage: 'Search emails with queries like "from:user@example.com subject:invoice after:2023/1/1"'
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

            if (!config?.query) {
                return { config_error: () => ({ error: "Search query is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            // Build search parameters
            const searchParams = {
                userId: config.userId || profile?.emailAddress || 'me',
                q: config.query,
                maxResults: config.maxResults || 50,
                pageToken: config.pageToken,
                includeSpamTrash: config.includeSpamTrash || false
            };

            // Remove undefined parameters
            Object.keys(searchParams).forEach(key => 
                searchParams[key as keyof typeof searchParams] === undefined && 
                delete searchParams[key as keyof typeof searchParams]
            );

            const response = await gmail.users.messages.list(searchParams);
            const messages = response.data.messages || [];

            if (messages.length === 0) {
                return { 
                    no_results: () => ({ 
                        query: config.query,
                        totalResults: 0 
                    }) 
                };
            }

            // If detailed results are requested, fetch full message data
            let results = messages;
            if (config.getDetails) {
                const detailPromises = messages
                    .filter(msg => msg.id != null)
                    .slice(0, config.maxResults || 50) // Limit to prevent too many API calls
                    .map(msg =>
                        gmail.users.messages.get({
                            userId: searchParams.userId,
                            id: msg.id!,
                            format: 'metadata',
                            metadataHeaders: ['From', 'To', 'Subject', 'Date']
                        })
                    );

                const detailedMessages = await Promise.all(detailPromises);
                
                results = detailedMessages.map(res => {
                    const message = res.data;
                    const headers = message?.payload?.headers || [];
                    
                    const findHeader = (name: string): string => {
                        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
                        return header?.value || '';
                    };

                    return {
                        id: message.id,
                        threadId: message.threadId,
                        from: findHeader('From'),
                        to: findHeader('To'),
                        subject: findHeader('Subject'),
                        date: findHeader('Date'),
                        snippet: message.snippet
                    };
                });
            }

            const resultPayload = {
                query: config.query,
                messages: results,
                totalResults: response.data.resultSizeEstimate || messages.length,
                nextPageToken: response.data.nextPageToken
            };

            state.set('lastEmailSearch', {
                query: config.query,
                resultsCount: messages.length,
                searchedAt: new Date().toISOString()
            });

            return { success: () => resultPayload };

        } catch (error) {
            console.error('Error in searchEmails:', error);
            return {
                error: () => ({
                    message: 'Failed to search emails',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const searchEmails = new SearchEmailsNode();