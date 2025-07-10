import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XLikePostConfig {
    postId: string;
}

@RegisterNode
export class XLikePostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xLikePost',
        description: 'Like a post on X',
        type: 'action',
        ai_hints: {
            purpose: 'Engage with content through likes',
            when_to_use: 'For automated engagement or content appreciation',
            expected_edges: ['liked', 'already_liked', 'post_not_found', 'rate_limited']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const likeConfig = config as XLikePostConfig;
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

        if (!likeConfig?.postId) {
            return {
                post_not_found: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to like'
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
            const response = await fetch(`https://api.twitter.com/2/users/${currentUserId}/likes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tweet_id: likeConfig.postId
                })
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    post_not_found: () => ({
                        error: 'Post not found',
                        postId: likeConfig.postId,
                        details: 'The post to like does not exist or has been deleted'
                    })
                };
            }

            if (response.status === 429) {
                const resetTime = response.headers.get('x-rate-limit-reset');
                return {
                    rate_limited: () => ({
                        error: 'Rate limit exceeded',
                        resetAt: resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : undefined,
                        details: 'Like rate limit reached. Please try again later.'
                    })
                };
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('already liked')) {
                    return {
                        already_liked: () => ({
                            message: 'Post already liked',
                            postId: likeConfig.postId,
                            likedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    post_not_found: () => ({
                        error: 'Failed to like post',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                liked: responseData.data.liked,
                postId: likeConfig.postId,
                likedAt: new Date().toISOString()
            };

            state.set('lastLikedPost', result);

            return {
                liked: () => result
            };

        } catch (error) {
            console.error('Error in xLikePost:', error);
            return {
                post_not_found: () => ({
                    error: 'Failed to like post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xLikePost = new XLikePostNode();