import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XRateLimitCheckConfig {
    endpoint: string;
}

@RegisterNode
export class XRateLimitCheckNode implements Node {
    metadata: NodeMetadata = {
        name: 'xRateLimitCheck',
        description: 'Check rate limit status for X API endpoints',
        type: 'action',
        ai_hints: {
            purpose: 'Prevent rate limit violations',
            when_to_use: 'Before making API calls in high-volume workflows',
            expected_edges: ['within_limits', 'approaching_limit', 'rate_limited', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const checkConfig = config as XRateLimitCheckConfig;
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

        if (!checkConfig?.endpoint) {
            return {
                error: () => ({
                    error: 'Endpoint is required',
                    details: 'Provide the endpoint to check rate limits for'
                })
            };
        }

        try {
            // Make a request to the rate limit status endpoint
            const response = await fetch('https://api.twitter.com/2/users/me', {
                method: 'HEAD',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            // Extract rate limit headers
            const rateLimit = response.headers.get('x-rate-limit-limit');
            const rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
            const rateLimitReset = response.headers.get('x-rate-limit-reset');

            if (!rateLimit || !rateLimitRemaining || !rateLimitReset) {
                return {
                    error: () => ({
                        error: 'Unable to retrieve rate limit information',
                        endpoint: checkConfig.endpoint
                    })
                };
            }

            const limit = parseInt(rateLimit);
            const remaining = parseInt(rateLimitRemaining);
            const resetTimestamp = parseInt(rateLimitReset);
            const resetAt = new Date(resetTimestamp * 1000);
            const percentRemaining = (remaining / limit) * 100;

            const rateLimitInfo = {
                endpoint: checkConfig.endpoint,
                limit,
                remaining,
                resetAt: resetAt.toISOString(),
                percentRemaining: Math.round(percentRemaining),
                minutesUntilReset: Math.round((resetAt.getTime() - Date.now()) / 60000)
            };

            // Store rate limit info in state
            state.set(`x_rate_limit_${checkConfig.endpoint}`, rateLimitInfo);

            if (remaining === 0) {
                return {
                    rate_limited: () => ({
                        ...rateLimitInfo,
                        message: 'Rate limit exhausted'
                    })
                };
            }

            if (percentRemaining < 10) {
                return {
                    approaching_limit: () => ({
                        ...rateLimitInfo,
                        message: 'Approaching rate limit',
                        warning: `Only ${remaining} requests remaining (${percentRemaining}%)`
                    })
                };
            }

            return {
                within_limits: () => ({
                    ...rateLimitInfo,
                    message: 'Within rate limits'
                })
            };

        } catch (error) {
            console.error('Error in xRateLimitCheck:', error);
            return {
                error: () => ({
                    error: 'Failed to check rate limit',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xRateLimitCheck = new XRateLimitCheckNode();