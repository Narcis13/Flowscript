import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XUnfollowUserConfig {
    targetUserId: string;
}

@RegisterNode
export class XUnfollowUserNode implements Node {
    metadata: NodeMetadata = {
        name: 'xUnfollowUser',
        description: 'Unfollow a user on X',
        type: 'action',
        ai_hints: {
            purpose: 'Manage following relationships',
            when_to_use: 'For account cleanup or relationship management',
            expected_edges: ['unfollowed', 'not_following', 'user_not_found', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const unfollowConfig = config as XUnfollowUserConfig;
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

        if (!unfollowConfig?.targetUserId) {
            return {
                error: () => ({
                    error: 'Target user ID is required',
                    details: 'Provide the ID of the user to unfollow'
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
            const response = await fetch(`https://api.twitter.com/2/users/${currentUserId}/following/${unfollowConfig.targetUserId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    user_not_found: () => ({
                        error: 'Target user not found',
                        targetUserId: unfollowConfig.targetUserId,
                        details: 'The user to unfollow does not exist'
                    })
                };
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('not following')) {
                    return {
                        not_following: () => ({
                            message: 'Not following this user',
                            targetUserId: unfollowConfig.targetUserId,
                            unfollowedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    error: () => ({
                        error: 'Failed to unfollow user',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                following: responseData.data.following,
                targetUserId: unfollowConfig.targetUserId,
                unfollowedAt: new Date().toISOString()
            };

            state.set('lastUnfollowedUser', result);

            return {
                unfollowed: () => result
            };

        } catch (error) {
            console.error('Error in xUnfollowUser:', error);
            return {
                error: () => ({
                    error: 'Failed to unfollow user',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xUnfollowUser = new XUnfollowUserNode();