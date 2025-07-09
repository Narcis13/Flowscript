//list emails from gmail

import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class ListEmailsNode implements Node {
    metadata: NodeMetadata = {
        name: 'listEmails',
        description: 'Lists emails from a Gmail account',
        type: 'action',
        ai_hints: {
            purpose: 'List emails from a Gmail account',
            when_to_use: 'When you need to retrieve a list of emails from a Gmail account',
            expected_edges: ['success', 'error'],
            example_usage: 'List emails from a Gmail account'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        console.log('========== ListEmailsNode.execute() START ==========');
        const { config, state } = context;
        console.log('Config:', config);
        const accessToken = state.get("google_token");
        
        const profile = state.get("gmail_profile");
        console.log('Access token:', accessToken ? 'present' : 'missing');
        console.log('Profile:', profile);
        console.log(`Listing emails for user: ${profile?.emailAddress || 'unknown'}`);  
        interface EmailHeader {
            name?: string | null | undefined;
            value?: string | null | undefined;
        }

        const findHeader = (headers: EmailHeader[] | undefined, name: string): string => {
            const header = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
            return header?.value || '';
        };
        try {
            console.log('Inside try block');
            if (!accessToken) {
                console.log('No access token found, returning config_error');
                return { config_error: () => ({ error: "Configuration Error"}) };
            }
            const oauth2Client = new google.auth.OAuth2();
                        oauth2Client.setCredentials({ access_token: accessToken });
                        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            
                        const requestParams = {
                            userId: config?.userId || profile?.emailAddress || "me",
                            q: config?.query,
                            labelIds: config?.labelIds,
                            maxResults: config?.maxResults || 25,
                            pageToken: config?.pageToken,
                            includeSpamTrash: config?.includeSpamTrash || false,
                        };
                        Object.keys(requestParams).forEach(key => requestParams[key as keyof typeof requestParams] === undefined && delete requestParams[key as keyof typeof requestParams]);
            
                        const listResponse = await gmail.users.messages.list(requestParams);
                        const messageStubs = listResponse.data.messages || [];
            
                        if (messageStubs.length === 0) {
                            console.log(` No emails found for query.`);
                            return { no_results: () => ({ emails: [], nextPageToken: null, resultSizeEstimate: 0 }) };
                        }
            
                        let finalEmails = messageStubs;
            
                        // --- NEW LOGIC TO GET FULL DETAILS ---
                        if (config?.getFullDetails) {
                           // console.log(`[${this.self.id}] getFullDetails is true. Fetching details for ${messageStubs.length} emails.`);
            
                            const detailPromises = messageStubs
                                .filter(stub => stub.id != null)
                                .map(stub =>
                                    gmail.users.messages.get({
                                        userId: requestParams.userId,
                                        id: stub.id!,
                                        // Optimization: 'metadata' is faster than 'full'
                                        format: 'metadata',
                                        // Optimization: Specify only needed headers
                                        metadataHeaders: ['From', 'Subject', 'Date'],
                                    })
                                );
            
                            // Await all 'get' requests concurrently for performance
                            const detailedResponses = await Promise.all(detailPromises);
            
                            finalEmails = detailedResponses.map(res => {
                                const message = res.data;
                                const headers = message?.payload?.headers;
                                return {
                                    id: message.id,
                                    threadId: message.threadId,
                                    from: findHeader(headers, 'From'),
                                    subject: findHeader(headers, 'Subject'),
                                    date: findHeader(headers, 'Date'),
                                    snippet: message.snippet,
                                };
                            });
                        }
                        // --- END OF NEW LOGIC ---
            
                        const resultPayload = {
                            emails: finalEmails,
                            nextPageToken: listResponse.data.nextPageToken || null,
                            resultSizeEstimate: listResponse.data.resultSizeEstimate || 0,
                        };
            
                        state.set('lastGmailListAttempt', { status: 'success', resultsCount: finalEmails.length });
                       // console.log(`[${this.self.id}] Successfully processed ${finalEmails.length} emails.`);
                        console.log(finalEmails[0])
                        return { success: () => resultPayload };
        } catch (error) {
            console.error('Error in listEmails:', error);
            console.error('Full error object:', JSON.stringify(error, null, 2));
            return {
                error: () => ({
                    message: 'Cannot list emails from Gmail account',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

console.log('Creating listEmails node instance...');
export const listEmails = new ListEmailsNode();
console.log('listEmails node instance created:', listEmails);
