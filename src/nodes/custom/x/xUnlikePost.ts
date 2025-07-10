import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XUnlikePostConfig {
    postId: string;
}

@RegisterNode
export class XUnlikePostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xUnlikePost',
        description: 'Remove like from a post',
        type: 'action',
        ai_hints: {
            purpose: 'Manage engagement history',
            when_to_use: 'For correcting accidental likes or engagement cleanup',
            expected_edges: ['unliked', 'not_liked', 'post_not_found', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const unlikeConfig = config as XUnlikePostConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');
        const currentUserId = state.get('x_current_user_id');

        if (!authType || !bearerToken) {
            return {
                error: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!unlikeConfig?.postId) {
            return {
                error: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to unlike'
                })
            };
        }

        if (!currentUserId) {
            return {
                error: () => ({
                    error: 'Current user ID not found',
                    details: 'Unable to determine authenticated user ID'
                })
            };
        }

        try {
            const response = await fetch(`https://api.twitter.com/2/users/${currentUserId}/likes/${unlikeConfig.postId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    post_not_found: () => ({
                        error: 'Post not found',
                        postId: unlikeConfig.postId,
                        details: 'The post does not exist or has been deleted'
                    })
                };
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('not liked')) {
                    return {
                        not_liked: () => ({
                            message: 'Post was not liked',
                            postId: unlikeConfig.postId,
                            unlikedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    error: () => ({
                        error: 'Failed to unlike post',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                liked: responseData.data.liked,
                postId: unlikeConfig.postId,
                unlikedAt: new Date().toISOString()
            };

            state.set('lastUnlikedPost', result);

            return {
                unliked: () => result
            };

        } catch (error) {
            console.error('Error in xUnlikePost:', error);
            return {
                error: () => ({
                    error: 'Failed to unlike post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xUnlikePost = new XUnlikePostNode();