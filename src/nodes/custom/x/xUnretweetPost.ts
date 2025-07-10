import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XUnretweetPostConfig {
    postId: string;
}

@RegisterNode
export class XUnretweetPostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xUnretweetPost',
        description: 'Remove a retweet',
        type: 'action',
        ai_hints: {
            purpose: 'Manage shared content',
            when_to_use: 'For correcting accidental retweets or content management',
            expected_edges: ['unretweeted', 'not_retweeted', 'post_not_found', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const unretweetConfig = config as XUnretweetPostConfig;
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

        if (!unretweetConfig?.postId) {
            return {
                error: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to unretweet'
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
            const response = await fetch(`https://api.twitter.com/2/users/${currentUserId}/retweets/${unretweetConfig.postId}`, {
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
                        postId: unretweetConfig.postId,
                        details: 'The post does not exist or has been deleted'
                    })
                };
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('not retweeted')) {
                    return {
                        not_retweeted: () => ({
                            message: 'Post was not retweeted',
                            postId: unretweetConfig.postId,
                            unretweetedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    error: () => ({
                        error: 'Failed to unretweet post',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                retweeted: responseData.data.retweeted,
                postId: unretweetConfig.postId,
                unretweetedAt: new Date().toISOString()
            };

            state.set('lastUnretweetedPost', result);

            return {
                unretweeted: () => result
            };

        } catch (error) {
            console.error('Error in xUnretweetPost:', error);
            return {
                error: () => ({
                    error: 'Failed to unretweet post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xUnretweetPost = new XUnretweetPostNode();