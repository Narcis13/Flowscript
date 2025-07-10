import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XCreateListConfig {
    name: string;
    description?: string;
    private?: boolean;
}

@RegisterNode
export class XCreateListNode implements Node {
    metadata: NodeMetadata = {
        name: 'xCreateList',
        description: 'Create a new X list',
        type: 'action',
        ai_hints: {
            purpose: 'Organize users into curated lists',
            when_to_use: 'For content curation and user organization',
            expected_edges: ['list_created', 'name_taken', 'limit_reached', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const listConfig = config as XCreateListConfig;
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

        if (!listConfig?.name) {
            return {
                error: () => ({
                    error: 'List name is required',
                    details: 'Provide a name for the list'
                })
            };
        }

        if (listConfig.name.length > 25) {
            return {
                error: () => ({
                    error: 'List name too long',
                    length: listConfig.name.length,
                    maxLength: 25
                })
            };
        }

        if (listConfig.description && listConfig.description.length > 100) {
            return {
                error: () => ({
                    error: 'List description too long',
                    length: listConfig.description.length,
                    maxLength: 100
                })
            };
        }

        try {
            const requestBody: any = {
                name: listConfig.name
            };

            if (listConfig.description) {
                requestBody.description = listConfig.description;
            }

            if (listConfig.private !== undefined) {
                requestBody.private = listConfig.private;
            }

            const response = await fetch('https://api.twitter.com/2/lists', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            if (response.status === 403) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('limit')) {
                    return {
                        limit_reached: () => ({
                            error: 'List limit reached',
                            details: 'You have reached the maximum number of lists allowed'
                        })
                    };
                }
            }

            if (!response.ok) {
                const errorDetail = responseData.errors?.[0]?.detail;
                if (errorDetail?.includes('name already exists')) {
                    return {
                        name_taken: () => ({
                            error: 'List name already exists',
                            name: listConfig.name,
                            details: 'Please choose a different name for your list'
                        })
                    };
                }

                return {
                    error: () => ({
                        error: 'Failed to create list',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                listId: responseData.data.id,
                name: responseData.data.name,
                description: responseData.data.description,
                private: responseData.data.private,
                memberCount: responseData.data.member_count || 0,
                followerCount: responseData.data.follower_count || 0,
                createdAt: new Date().toISOString()
            };

            state.set('lastCreatedList', result);

            return {
                list_created: () => result
            };

        } catch (error) {
            console.error('Error in xCreateList:', error);
            return {
                error: () => ({
                    error: 'Failed to create list',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xCreateList = new XCreateListNode();