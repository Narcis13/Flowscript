import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XGetPostMetricsConfig {
    postIds: string[];
    metricTypes: ('public' | 'organic' | 'promoted')[];
}

@RegisterNode
export class XGetPostMetricsNode implements Node {
    metadata: NodeMetadata = {
        name: 'xGetPostMetrics',
        description: 'Retrieve engagement metrics for posts',
        type: 'action',
        ai_hints: {
            purpose: 'Analyze post performance and engagement',
            when_to_use: 'For analytics and performance tracking',
            expected_edges: ['metrics_retrieved', 'post_not_found', 'insufficient_access', 'error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const metricsConfig = config as XGetPostMetricsConfig;
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

        if (!metricsConfig?.postIds || metricsConfig.postIds.length === 0) {
            return {
                error: () => ({
                    error: 'Post IDs are required',
                    details: 'Provide at least one post ID to get metrics for'
                })
            };
        }

        if (metricsConfig.postIds.length > 100) {
            return {
                error: () => ({
                    error: 'Too many post IDs',
                    count: metricsConfig.postIds.length,
                    maxAllowed: 100
                })
            };
        }

        if (!metricsConfig.metricTypes || metricsConfig.metricTypes.length === 0) {
            return {
                error: () => ({
                    error: 'Metric types are required',
                    details: 'Specify at least one metric type: public, organic, or promoted'
                })
            };
        }

        try {
            const params = new URLSearchParams({
                ids: metricsConfig.postIds.join(','),
                'tweet.fields': 'public_metrics,organic_metrics,promoted_metrics,created_at'
            });

            const response = await fetch(`https://api.twitter.com/2/tweets?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 403) {
                return {
                    insufficient_access: () => ({
                        error: 'Insufficient access level',
                        details: 'Your API access level does not include metrics access',
                        requiredAccess: 'Organic and promoted metrics require elevated access'
                    })
                };
            }

            if (!response.ok) {
                return {
                    error: () => ({
                        error: 'Failed to retrieve metrics',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const metricsResults = [];
            const notFoundIds = [];

            // Process each post
            for (const postId of metricsConfig.postIds) {
                const postData = responseData.data?.find((p: any) => p.id === postId);
                
                if (!postData) {
                    notFoundIds.push(postId);
                    continue;
                }

                const metrics: any = {
                    postId: postData.id,
                    createdAt: postData.created_at,
                    retrievedAt: new Date().toISOString()
                };

                // Add requested metric types
                if (metricsConfig.metricTypes.includes('public') && postData.public_metrics) {
                    metrics.publicMetrics = {
                        retweetCount: postData.public_metrics.retweet_count || 0,
                        replyCount: postData.public_metrics.reply_count || 0,
                        likeCount: postData.public_metrics.like_count || 0,
                        quoteCount: postData.public_metrics.quote_count || 0,
                        bookmarkCount: postData.public_metrics.bookmark_count || 0,
                        impressionCount: postData.public_metrics.impression_count || 0
                    };
                }

                if (metricsConfig.metricTypes.includes('organic') && postData.organic_metrics) {
                    metrics.organicMetrics = {
                        impressionCount: postData.organic_metrics.impression_count || 0,
                        retweetCount: postData.organic_metrics.retweet_count || 0,
                        replyCount: postData.organic_metrics.reply_count || 0,
                        likeCount: postData.organic_metrics.like_count || 0
                    };
                }

                if (metricsConfig.metricTypes.includes('promoted') && postData.promoted_metrics) {
                    metrics.promotedMetrics = {
                        impressionCount: postData.promoted_metrics.impression_count || 0,
                        retweetCount: postData.promoted_metrics.retweet_count || 0,
                        replyCount: postData.promoted_metrics.reply_count || 0,
                        likeCount: postData.promoted_metrics.like_count || 0
                    };
                }

                metricsResults.push(metrics);
            }

            if (notFoundIds.length === metricsConfig.postIds.length) {
                return {
                    post_not_found: () => ({
                        error: 'No posts found',
                        postIds: notFoundIds,
                        details: 'None of the specified posts exist or are accessible'
                    })
                };
            }

            const result = {
                metrics: metricsResults,
                notFoundIds: notFoundIds,
                retrievedCount: metricsResults.length,
                requestedCount: metricsConfig.postIds.length
            };

            state.set('lastPostMetrics', result);

            return {
                metrics_retrieved: () => result
            };

        } catch (error) {
            console.error('Error in xGetPostMetrics:', error);
            return {
                error: () => ({
                    error: 'Failed to retrieve post metrics',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xGetPostMetrics = new XGetPostMetricsNode();