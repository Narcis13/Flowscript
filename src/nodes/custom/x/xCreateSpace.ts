import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XCreateSpaceConfig {
    title: string;
    scheduledStart?: string;
}

@RegisterNode
export class XCreateSpaceNode implements Node {
    metadata: NodeMetadata = {
        name: 'xCreateSpace',
        description: 'Create a new X Space for live audio conversation',
        type: 'action',
        ai_hints: {
            purpose: 'Host live audio conversations',
            when_to_use: 'For creating live events and discussions',
            expected_edges: ['space_created', 'creation_error', 'auth_error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const spaceConfig = config as XCreateSpaceConfig;
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

        if (!spaceConfig?.title) {
            return {
                creation_error: () => ({
                    error: 'Space title is required',
                    details: 'Provide a title for the Space'
                })
            };
        }

        if (spaceConfig.title.length > 70) {
            return {
                creation_error: () => ({
                    error: 'Space title too long',
                    length: spaceConfig.title.length,
                    maxLength: 70
                })
            };
        }

        // Validate scheduled start time if provided
        if (spaceConfig.scheduledStart) {
            const scheduledTime = new Date(spaceConfig.scheduledStart);
            const now = new Date();
            const minStartTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes from now
            const maxStartTime = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

            if (scheduledTime < minStartTime) {
                return {
                    creation_error: () => ({
                        error: 'Scheduled start time too soon',
                        details: 'Space must be scheduled at least 5 minutes in the future'
                    })
                };
            }

            if (scheduledTime > maxStartTime) {
                return {
                    creation_error: () => ({
                        error: 'Scheduled start time too far',
                        details: 'Space cannot be scheduled more than 14 days in advance'
                    })
                };
            }
        }

        try {
            const requestBody: any = {
                title: spaceConfig.title
            };

            if (spaceConfig.scheduledStart) {
                requestBody.scheduled_start = spaceConfig.scheduledStart;
            }

            const response = await fetch('https://api.twitter.com/2/spaces', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json();

            if (response.status === 403) {
                return {
                    auth_error: () => ({
                        error: 'Insufficient permissions to create Space',
                        details: 'Your account may not have access to create Spaces'
                    })
                };
            }

            if (!response.ok) {
                return {
                    creation_error: () => ({
                        error: 'Failed to create Space',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                spaceId: responseData.data.id,
                title: responseData.data.title,
                state: responseData.data.state,
                scheduledStart: responseData.data.scheduled_start,
                createdAt: responseData.data.created_at || new Date().toISOString(),
                hostIds: responseData.data.host_ids || [],
                isTicketed: responseData.data.is_ticketed || false
            };

            state.set('lastCreatedSpace', result);

            return {
                space_created: () => result
            };

        } catch (error) {
            console.error('Error in xCreateSpace:', error);
            return {
                creation_error: () => ({
                    error: 'Failed to create Space',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xCreateSpace = new XCreateSpaceNode();