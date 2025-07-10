import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XGetUserMentionsConfig {
    userId: string;
    maxResults?: number;
    startTime?: string;
    endTime?: string;
    expansions?: string[];
    postFields?: string[];
}

@RegisterNode
export class XGetUserMentionsNode implements Node {
    metadata: NodeMetadata = {
        name: 'xGetUserMentions',
        description: 'Retrieve posts mentioning a specific user',
        type: 'action',
        ai_hints: {
            purpose: 'Monitor mentions and engagement for users',
            when_to_use: 'For reputation monitoring or engagement tracking',
            expected_edges: ['mentions_found', 'no_mentions', 'private_account', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const mentionsConfig = config as XGetUserMentionsConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                error: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!mentionsConfig?.userId) {
            return {
                error: () => ({
                    error: 'User ID is required',
                    details: 'Provide the ID of the user whose mentions to retrieve'
                })
            };
        }

        try {
            const params = new URLSearchParams();

            if (mentionsConfig.maxResults) {
                if (mentionsConfig.maxResults < 5 || mentionsConfig.maxResults > 100) {
                    return {
                        error: () => ({
                            error: 'Invalid max results',
                            value: mentionsConfig.maxResults,
                            validRange: '5-100'
                        })
                    };
                }
                params.append('max_results', mentionsConfig.maxResults.toString());
            }

            if (mentionsConfig.startTime) {
                params.append('start_time', mentionsConfig.startTime);
            }
            if (mentionsConfig.endTime) {
                params.append('end_time', mentionsConfig.endTime);
            }
            if (mentionsConfig.expansions?.length) {
                params.append('expansions', mentionsConfig.expansions.join(','));
            }
            if (mentionsConfig.postFields?.length) {
                params.append('tweet.fields', mentionsConfig.postFields.join(','));
            }

            const url = `https://api.twitter.com/2/users/${mentionsConfig.userId}/mentions?${params.toString()}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 403) {
                return {
                    private_account: () => ({
                        error: 'Cannot retrieve mentions for private account',
                        userId: mentionsConfig.userId,
                        details: 'The user account is private or protected'
                    })
                };
            }

            if (!response.ok) {
                return {
                    error: () => ({
                        error: 'Failed to retrieve mentions',
                        status: response.status,
                        userId: mentionsConfig.userId,
                        details: responseData
                    })
                };
            }

            if (!responseData.data || responseData.data.length === 0) {
                return {
                    no_mentions: () => ({
                        userId: mentionsConfig.userId,
                        message: 'No mentions found for this user in the specified time range',
                        retrievedAt: new Date().toISOString()
                    })
                };
            }

            const result = {
                mentions: responseData.data,
                mentionCount: responseData.meta.result_count,
                nextToken: responseData.meta.next_token,
                includes: responseData.includes || {},
                userId: mentionsConfig.userId,
                retrievedAt: new Date().toISOString()
            };

            state.set('lastUserMentions', result);

            return {
                mentions_found: () => result
            };

        } catch (error) {
            console.error('Error in xGetUserMentions:', error);
            return {
                error: () => ({
                    error: 'Failed to retrieve mentions',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xGetUserMentions = new XGetUserMentionsNode();