import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';

@RegisterNode
export class GoogleConnectNode implements Node {
    metadata: NodeMetadata = {
        name: 'googleConnect',
        description: 'Connects to a Google account',
        type: 'action',
        ai_hints: {
            purpose: 'Connect to a Google account',
            when_to_use: 'When you need to connect to a Google account',
            expected_edges: ['success', 'error'],
            example_usage: 'Connect to a Google account'
        }
    }

    async execute({ config,state }: ExecutionContext): Promise<SimpleEdgeMap> {
       const email = config?.email;
       console.log(`Connecting to Google account for ${email}`);
       if (!email) {
        return {
            error: () => ({
                message: 'Error connecting to Google account'
            })
        }
       }
       const apiUrl = `http://localhost:3013/api/auth/gmail/profile?email=${encodeURIComponent(email)}`;
       state.set('lastGmailConnectAttempt', { email, apiUrl, timestamp: Date.now() });
       try {
        console.log(`Attempting to fetch from: ${apiUrl}`);
        const response = await fetch(apiUrl);
        console.log(`Response status: ${response.status}`);
        if (!response.ok) {


               
                state.set('lastGmailConnectError', { email,  timestamp: Date.now() });
                return {
                    error: () => ({
                        message: "Failed to fetch Gmail profile from the authentication service.",
                     
                        status: response.status
                    })
                };
        }
        const data = await response.json() as { profile: any, token: string };


        state.set("gmail_profile", data.profile);
        state.set("google_token", data.token);
        console.log(`Successfully connected. Profile for ${data.profile.emailAddress} and token have been stored in state.`);
        return { success: () => data };
       } catch (error) {
        console.error('Error in googleConnect:', error);
        return {
            error: () => ({
                message: 'Cannot connecting to Google account',
                details: error instanceof Error ? error.message : String(error)
            })
        }
       }
    }
}

export const googleConnect = new GoogleConnectNode();