import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XGetPostConfig {
    postId: string;
    expansions?: string[];
    postFields?: string[];
    userFields?: string[];
    mediaFields?: string[];
}

@RegisterNode
export class XGetPostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xGetPost',
        description: 'Retrieve a specific post by ID',
        type: 'action',
        ai_hints: {
            purpose: 'Fetch detailed post information',
            when_to_use: 'When analyzing specific posts or getting current metrics',
            expected_edges: ['post_found', 'post_not_found', 'private_post', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const getConfig = config as XGetPostConfig;
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

        if (!getConfig?.postId) {
            return {
                error: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to retrieve'
                })
            };
        }

        try {
            const params = new URLSearchParams();
            
            if (getConfig.expansions?.length) {
                params.append('expansions', getConfig.expansions.join(','));
            }
            if (getConfig.postFields?.length) {
                params.append('tweet.fields', getConfig.postFields.join(','));
            }
            if (getConfig.userFields?.length) {
                params.append('user.fields', getConfig.userFields.join(','));
            }
            if (getConfig.mediaFields?.length) {
                params.append('media.fields', getConfig.mediaFields.join(','));
            }

            const url = `https://api.twitter.com/2/tweets/${getConfig.postId}${params.toString() ? '?' + params.toString() : ''}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    post_not_found: () => ({
                        error: 'Post not found',
                        postId: getConfig.postId,
                        details: 'The post does not exist or has been deleted'
                    })
                };
            }

            if (response.status === 403) {
                return {
                    private_post: () => ({
                        error: 'Post is private',
                        postId: getConfig.postId,
                        details: 'You do not have permission to view this post'
                    })
                };
            }

            if (!response.ok) {
                return {
                    error: () => ({
                        error: 'Failed to retrieve post',
                        status: response.status,
                        postId: getConfig.postId,
                        details: responseData
                    })
                };
            }

            const result = {
                post: responseData.data,
                includes: responseData.includes || {},
                retrievedAt: new Date().toISOString()
            };

            state.set('lastRetrievedPost', result);

            return {
                post_found: () => result
            };

        } catch (error) {
            console.error('Error in xGetPost:', error);
            return {
                error: () => ({
                    error: 'Failed to retrieve post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xGetPost = new XGetPostNode();