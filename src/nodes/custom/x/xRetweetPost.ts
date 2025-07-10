import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XRetweetPostConfig {
    postId: string;
}

@RegisterNode
export class XRetweetPostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xRetweetPost',
        description: 'Retweet a post',
        type: 'action',
        ai_hints: {
            purpose: 'Share content with followers',
            when_to_use: 'For content amplification and sharing',
            expected_edges: ['retweeted', 'already_retweeted', 'post_not_found', 'rate_limited']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const retweetConfig = config as XRetweetPostConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');
        const currentUserId = state.get('x_current_user_id');

        if (!authType || !bearerToken) {
            return {
                post_not_found: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!retweetConfig?.postId) {
            return {
                post_not_found: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to retweet'
                })
            };
        }

        if (!currentUserId) {
            return {
                post_not_found: () => ({
                    error: 'Current user ID not found',
                    details: 'Unable to determine authenticated user ID'
                })
            };
        }

        try {
            const response = await fetch(`https://api.twitter.com/2/users/${currentUserId}/retweets`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tweet_id: retweetConfig.postId
                })
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    post_not_found: () => ({
                        error: 'Post not found',
                        postId: retweetConfig.postId,
                        details: 'The post to retweet does not exist or has been deleted'
                    })
                };
            }

            if (response.status === 429) {
                const resetTime = response.headers.get('x-rate-limit-reset');
                return {
                    rate_limited: () => ({
                        error: 'Rate limit exceeded',
                        resetAt: resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : undefined,
                        details: 'Retweet rate limit reached. Please try again later.'
                    })
                };
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('already retweeted')) {
                    return {
                        already_retweeted: () => ({
                            message: 'Post already retweeted',
                            postId: retweetConfig.postId,
                            retweetedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    post_not_found: () => ({
                        error: 'Failed to retweet post',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                retweeted: responseData.data.retweeted,
                postId: retweetConfig.postId,
                retweetedAt: new Date().toISOString()
            };

            state.set('lastRetweetedPost', result);

            return {
                retweeted: () => result
            };

        } catch (error) {
            console.error('Error in xRetweetPost:', error);
            return {
                post_not_found: () => ({
                    error: 'Failed to retweet post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xRetweetPost = new XRetweetPostNode();