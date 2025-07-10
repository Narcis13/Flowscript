import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XStreamPostsConfig {
    rules: Array<{
        value: string;
        tag?: string;
    }>;
    expansions?: string[];
    postFields?: string[];
}

@RegisterNode
export class XStreamPostsNode implements Node {
    metadata: NodeMetadata = {
        name: 'xStreamPosts',
        description: 'Stream posts in real-time based on rules',
        type: 'action',
        ai_hints: {
            purpose: 'Real-time monitoring and data collection',
            when_to_use: 'For live monitoring, alerts, and real-time analysis',
            expected_edges: ['stream_started', 'stream_error', 'rule_limit', 'auth_error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const streamConfig = config as XStreamPostsConfig;
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

        if (!streamConfig?.rules || streamConfig.rules.length === 0) {
            return {
                stream_error: () => ({
                    error: 'Rules are required',
                    details: 'Provide at least one rule for the stream'
                })
            };
        }

        // Validate rules
        for (const rule of streamConfig.rules) {
            if (!rule.value) {
                return {
                    stream_error: () => ({
                        error: 'Invalid rule',
                        details: 'Each rule must have a value property'
                    })
                };
            }
            if (rule.value.length > 512) {
                return {
                    stream_error: () => ({
                        error: 'Rule too long',
                        ruleValue: rule.value,
                        length: rule.value.length,
                        maxLength: 512
                    })
                };
            }
        }

        try {
            // First, get existing rules
            const existingRulesResponse = await fetch('https://api.twitter.com/2/tweets/search/stream/rules', {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            if (!existingRulesResponse.ok) {
                return {
                    auth_error: () => ({
                        error: 'Failed to check existing rules',
                        status: existingRulesResponse.status,
                        details: 'Stream access may require elevated API access'
                    })
                };
            }

            const existingRules = await existingRulesResponse.json();

            // Delete existing rules if any
            if (existingRules.data && existingRules.data.length > 0) {
                const deleteIds = existingRules.data.map((r: any) => r.id);
                await fetch('https://api.twitter.com/2/tweets/search/stream/rules', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${bearerToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        delete: { ids: deleteIds }
                    })
                });
            }

            // Add new rules
            const addRulesResponse = await fetch('https://api.twitter.com/2/tweets/search/stream/rules', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    add: streamConfig.rules
                })
            });

            const addRulesData = await addRulesResponse.json();

            if (!addRulesResponse.ok) {
                const errorDetail = addRulesData.errors?.[0];
                if (errorDetail?.title === 'RulesCapExceeded') {
                    return {
                        rule_limit: () => ({
                            error: 'Rule limit exceeded',
                            details: 'You have reached the maximum number of stream rules',
                            maxRules: errorDetail.value
                        })
                    };
                }

                return {
                    stream_error: () => ({
                        error: 'Failed to add stream rules',
                        status: addRulesResponse.status,
                        details: addRulesData
                    })
                };
            }

            // Prepare stream connection parameters
            const params = new URLSearchParams();
            if (streamConfig.expansions?.length) {
                params.append('expansions', streamConfig.expansions.join(','));
            }
            if (streamConfig.postFields?.length) {
                params.append('tweet.fields', streamConfig.postFields.join(','));
            }

            const streamUrl = `https://api.twitter.com/2/tweets/search/stream${params.toString() ? '?' + params.toString() : ''}`;

            const result = {
                streamUrl,
                rules: addRulesData.data || [],
                rulesCount: addRulesData.meta.summary.created || 0,
                streamStartedAt: new Date().toISOString(),
                message: 'Stream configured. Connect to streamUrl to start receiving posts.'
            };

            state.set('activeStreamConfig', {
                url: streamUrl,
                rules: result.rules,
                startedAt: result.streamStartedAt
            });

            return {
                stream_started: () => result
            };

        } catch (error) {
            console.error('Error in xStreamPosts:', error);
            return {
                stream_error: () => ({
                    error: 'Failed to start stream',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xStreamPosts = new XStreamPostsNode();