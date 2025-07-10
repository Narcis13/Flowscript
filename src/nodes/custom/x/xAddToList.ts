import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XAddToListConfig {
    listId: string;
    userId: string;
}

@RegisterNode
export class XAddToListNode implements Node {
    metadata: NodeMetadata = {
        name: 'xAddToList',
        description: 'Add a user to an existing list',
        type: 'action',
        ai_hints: {
            purpose: 'Manage list membership',
            when_to_use: 'For building and maintaining curated user lists',
            expected_edges: ['user_added', 'already_member', 'list_not_found', 'user_not_found']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const addConfig = config as XAddToListConfig;
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

        if (!addConfig?.listId) {
            return {
                list_not_found: () => ({
                    error: 'List ID is required',
                    details: 'Provide the ID of the list to add user to'
                })
            };
        }

        if (!addConfig.userId) {
            return {
                user_not_found: () => ({
                    error: 'User ID is required',
                    details: 'Provide the ID of the user to add to the list'
                })
            };
        }

        try {
            const response = await fetch(`https://api.twitter.com/2/lists/${addConfig.listId}/members`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: addConfig.userId
                })
            });

            const responseData = await response.json();

            if (response.status === 404) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('list')) {
                    return {
                        list_not_found: () => ({
                            error: 'List not found',
                            listId: addConfig.listId,
                            details: 'The specified list does not exist'
                        })
                    };
                } else {
                    return {
                        user_not_found: () => ({
                            error: 'User not found',
                            userId: addConfig.userId,
                            details: 'The specified user does not exist'
                        })
                    };
                }
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('already a member')) {
                    return {
                        already_member: () => ({
                            message: 'User is already a member of this list',
                            listId: addConfig.listId,
                            userId: addConfig.userId,
                            addedAt: new Date().toISOString()
                        })
                    };
                }

                return {
                    user_not_found: () => ({
                        error: 'Failed to add user to list',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                isMember: responseData.data.is_member,
                listId: addConfig.listId,
                userId: addConfig.userId,
                addedAt: new Date().toISOString()
            };

            // Update last list operation in state
            state.set('lastListOperation', {
                operation: 'add_member',
                ...result
            });

            return {
                user_added: () => result
            };

        } catch (error) {
            console.error('Error in xAddToList:', error);
            return {
                user_not_found: () => ({
                    error: 'Failed to add user to list',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xAddToList = new XAddToListNode();