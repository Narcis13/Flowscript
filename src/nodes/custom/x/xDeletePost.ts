import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XDeletePostConfig {
    postId: string;
}

@RegisterNode
export class XDeletePostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xDeletePost',
        description: 'Delete a post by ID',
        type: 'action',
        ai_hints: {
            purpose: 'Remove posts from X',
            when_to_use: 'When posts need to be removed due to errors or content issues',
            expected_edges: ['post_deleted', 'post_not_found', 'delete_error', 'auth_error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const deleteConfig = config as XDeletePostConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                auth_error: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!deleteConfig?.postId) {
            return {
                delete_error: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to delete'
                })
            };
        }

        try {
            const response = await fetch(`https://api.twitter.com/2/tweets/${deleteConfig.postId}`, {
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
                        postId: deleteConfig.postId,
                        details: 'The specified post does not exist or has already been deleted'
                    })
                };
            }

            if (!response.ok) {
                return {
                    delete_error: () => ({
                        error: 'Failed to delete post',
                        status: response.status,
                        postId: deleteConfig.postId,
                        details: responseData
                    })
                };
            }

            const result = {
                deleted: responseData.data.deleted,
                postId: deleteConfig.postId,
                deletedAt: new Date().toISOString()
            };

            state.set('lastDeletedPost', result);

            return {
                post_deleted: () => result
            };

        } catch (error) {
            console.error('Error in xDeletePost:', error);
            return {
                delete_error: () => ({
                    error: 'Failed to delete post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xDeletePost = new XDeletePostNode();