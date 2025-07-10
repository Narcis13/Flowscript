import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XGetUserPostsConfig {
    userId: string;
    maxResults?: number;
    startTime?: string;
    endTime?: string;
    excludeReplies?: boolean;
    excludeRetweets?: boolean;
    expansions?: string[];
    postFields?: string[];
}

@RegisterNode
export class XGetUserPostsNode implements Node {
    metadata: NodeMetadata = {
        name: 'xGetUserPosts',
        description: "Retrieve posts from a user's timeline",
        type: 'action',
        ai_hints: {
            purpose: "Analyze user's posting behavior and content",
            when_to_use: 'For user analysis, content curation, or monitoring',
            expected_edges: ['posts_retrieved', 'no_posts', 'private_account', 'user_not_found']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const postsConfig = config as XGetUserPostsConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                user_not_found: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!postsConfig?.userId) {
            return {
                user_not_found: () => ({
                    error: 'User ID is required',
                    details: 'Provide the ID of the user whose posts to retrieve'
                })
            };
        }

        try {
            const params = new URLSearchParams();

            if (postsConfig.maxResults) {
                if (postsConfig.maxResults < 5 || postsConfig.maxResults > 100) {
                    return {
                        user_not_found: () => ({
                            error: 'Invalid max results',
                            value: postsConfig.maxResults,
                            validRange: '5-100'
                        })
                    };
                }
                params.append('max_results', postsConfig.maxResults.toString());
            }

            if (postsConfig.startTime) {
                params.append('start_time', postsConfig.startTime);
            }
            if (postsConfig.endTime) {
                params.append('end_time', postsConfig.endTime);
            }
            if (postsConfig.excludeReplies !== undefined) {
                params.append('exclude', postsConfig.excludeReplies ? 'replies' : '');
            }
            if (postsConfig.excludeRetweets !== undefined) {
                params.append('exclude', postsConfig.excludeRetweets ? 'retweets' : '');
            }
            if (postsConfig.expansions?.length) {
                params.append('expansions', postsConfig.expansions.join(','));
            }
            if (postsConfig.postFields?.length) {
                params.append('tweet.fields', postsConfig.postFields.join(','));
            }

            const url = `https://api.twitter.com/2/users/${postsConfig.userId}/tweets?${params.toString()}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    user_not_found: () => ({
                        error: 'User not found',
                        userId: postsConfig.userId,
                        details: 'The specified user does not exist'
                    })
                };
            }

            if (response.status === 403) {
                return {
                    private_account: () => ({
                        error: 'User account is private',
                        userId: postsConfig.userId,
                        details: 'You do not have permission to view this user\'s posts'
                    })
                };
            }

            if (!response.ok) {
                return {
                    user_not_found: () => ({
                        error: 'Failed to retrieve user posts',
                        status: response.status,
                        userId: postsConfig.userId,
                        details: responseData
                    })
                };
            }

            if (!responseData.data || responseData.data.length === 0) {
                return {
                    no_posts: () => ({
                        userId: postsConfig.userId,
                        message: 'No posts found for this user in the specified time range',
                        retrievedAt: new Date().toISOString()
                    })
                };
            }

            const result = {
                posts: responseData.data,
                postCount: responseData.meta.result_count,
                nextToken: responseData.meta.next_token,
                includes: responseData.includes || {},
                userId: postsConfig.userId,
                retrievedAt: new Date().toISOString()
            };

            state.set('lastUserPosts', result);

            return {
                posts_retrieved: () => result
            };

        } catch (error) {
            console.error('Error in xGetUserPosts:', error);
            return {
                user_not_found: () => ({
                    error: 'Failed to retrieve user posts',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xGetUserPosts = new XGetUserPostsNode();