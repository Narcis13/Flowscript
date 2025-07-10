import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XGetSpaceConfig {
    spaceId: string;
    expansions?: string[];
    spaceFields?: string[];
}

@RegisterNode
export class XGetSpaceNode implements Node {
    metadata: NodeMetadata = {
        name: 'xGetSpace',
        description: 'Retrieve information about a specific Space',
        type: 'action',
        ai_hints: {
            purpose: 'Monitor and analyze Spaces',
            when_to_use: 'For Space discovery and analysis',
            expected_edges: ['space_found', 'space_not_found', 'space_ended', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const spaceConfig = config as XGetSpaceConfig;
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

        if (!spaceConfig?.spaceId) {
            return {
                error: () => ({
                    error: 'Space ID is required',
                    details: 'Provide the ID of the Space to retrieve'
                })
            };
        }

        try {
            const params = new URLSearchParams();
            
            if (spaceConfig.expansions?.length) {
                params.append('expansions', spaceConfig.expansions.join(','));
            }
            if (spaceConfig.spaceFields?.length) {
                params.append('space.fields', spaceConfig.spaceFields.join(','));
            }

            const url = `https://api.twitter.com/2/spaces/${spaceConfig.spaceId}${params.toString() ? '?' + params.toString() : ''}`;

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 404) {
                return {
                    space_not_found: () => ({
                        error: 'Space not found',
                        spaceId: spaceConfig.spaceId,
                        details: 'The Space does not exist or has been deleted'
                    })
                };
            }

            if (!response.ok) {
                return {
                    error: () => ({
                        error: 'Failed to retrieve Space',
                        status: response.status,
                        spaceId: spaceConfig.spaceId,
                        details: responseData
                    })
                };
            }

            const spaceData = responseData.data;
            
            // Check if space has ended
            if (spaceData.state === 'ended') {
                return {
                    space_ended: () => ({
                        spaceId: spaceData.id,
                        title: spaceData.title,
                        state: spaceData.state,
                        endedAt: spaceData.ended_at,
                        participantCount: spaceData.participant_count,
                        message: 'This Space has ended'
                    })
                };
            }

            const result = {
                space: {
                    id: spaceData.id,
                    title: spaceData.title,
                    state: spaceData.state,
                    createdAt: spaceData.created_at,
                    startedAt: spaceData.started_at,
                    scheduledStart: spaceData.scheduled_start,
                    endedAt: spaceData.ended_at,
                    hostIds: spaceData.host_ids || [],
                    speakerIds: spaceData.speaker_ids || [],
                    participantCount: spaceData.participant_count || 0,
                    subscriberCount: spaceData.subscriber_count || 0,
                    isTicketed: spaceData.is_ticketed || false,
                    lang: spaceData.lang
                },
                includes: responseData.includes || {},
                retrievedAt: new Date().toISOString()
            };

            state.set('lastRetrievedSpace', result);

            return {
                space_found: () => result
            };

        } catch (error) {
            console.error('Error in xGetSpace:', error);
            return {
                error: () => ({
                    error: 'Failed to retrieve Space',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xGetSpace = new XGetSpaceNode();