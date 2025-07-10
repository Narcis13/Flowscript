import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XFollowUserConfig {
    targetUserId: string;
}

@RegisterNode
export class XFollowUserNode implements Node {
    metadata: NodeMetadata = {
        name: 'xFollowUser',
        description: 'Follow a user on X',
        type: 'action',
        ai_hints: {
            purpose: 'Build social connections and networks',
            when_to_use: 'For automated follow strategies or relationship building',
            expected_edges: ['followed', 'already_following', 'user_not_found', 'follow_limit']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const followConfig = config as XFollowUserConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');
        const currentUserId = state.get('x_current_user_id');

        if (!authType || !bearerToken) {
            return {
                user_not_found: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!followConfig?.targetUserId) {
            return {
                user_not_found: () => ({
                    error: 'Target user ID is required',
                    details: 'Provide the ID of the user to follow'
                })
            };
        }

        // For following, we need the authenticated user's ID
        // In a real implementation, this would be obtained during auth
        if (!currentUserId) {
            return {
                user_not_found: () => ({
                    error: 'Current user ID not found',
                    details: 'Unable to determine authenticated user ID'
                })
            };
        }

        try {
            const response = await fetch(`https://api.twitter.com/2/users/${currentUserId}/following`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    target_user_id: followConfig.targetUserId
                })
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    user_not_found: () => ({
                        error: 'Target user not found',
                        targetUserId: followConfig.targetUserId,
                        details: 'The user to follow does not exist'
                    })
                };
            }

            if (response.status === 429) {
                return {
                    follow_limit: () => ({
                        error: 'Follow limit reached',
                        details: 'You have reached the follow limit. Please try again later.',
                        resetAt: response.headers.get('x-rate-limit-reset') 
                            ? new Date(parseInt(response.headers.get('x-rate-limit-reset')!) * 1000).toISOString() 
                            : undefined
                    })
                };
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('already following')) {
                    return {
                        already_following: () => ({
                            message: 'Already following this user',
                            targetUserId: followConfig.targetUserId,
                            followedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    user_not_found: () => ({
                        error: 'Failed to follow user',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                following: responseData.data.following,
                pendingFollow: responseData.data.pending_follow,
                targetUserId: followConfig.targetUserId,
                followedAt: new Date().toISOString()
            };

            state.set('lastFollowedUser', result);

            return {
                followed: () => result
            };

        } catch (error) {
            console.error('Error in xFollowUser:', error);
            return {
                user_not_found: () => ({
                    error: 'Failed to follow user',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xFollowUser = new XFollowUserNode();