import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XSearchPostsConfig {
    query: string;
    maxResults?: number;
    startTime?: string;
    endTime?: string;
    sortOrder?: 'recency' | 'relevancy';
    expansions?: string[];
    postFields?: string[];
    userFields?: string[];
}

@RegisterNode
export class XSearchPostsNode implements Node {
    metadata: NodeMetadata = {
        name: 'xSearchPosts',
        description: 'Search for posts using X search operators',
        type: 'action',
        ai_hints: {
            purpose: 'Find posts matching specific criteria',
            when_to_use: 'For content discovery, monitoring, or research',
            expected_edges: ['posts_found', 'no_results', 'query_error', 'rate_limited']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const searchConfig = config as XSearchPostsConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                query_error: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!searchConfig?.query) {
            return {
                query_error: () => ({
                    error: 'Search query is required',
                    details: 'Provide a search query using X search operators'
                })
            };
        }

        if (searchConfig.query.length > 512) {
            return {
                query_error: () => ({
                    error: 'Query too long',
                    length: searchConfig.query.length,
                    maxLength: 512
                })
            };
        }

        try {
            const params = new URLSearchParams({
                query: searchConfig.query
            });

            if (searchConfig.maxResults) {
                if (searchConfig.maxResults < 10 || searchConfig.maxResults > 100) {
                    return {
                        query_error: () => ({
                            error: 'Invalid max results',
                            value: searchConfig.maxResults,
                            validRange: '10-100'
                        })
                    };
                }
                params.append('max_results', searchConfig.maxResults.toString());
            }

            if (searchConfig.startTime) {
                params.append('start_time', searchConfig.startTime);
            }
            if (searchConfig.endTime) {
                params.append('end_time', searchConfig.endTime);
            }
            if (searchConfig.sortOrder) {
                params.append('sort_order', searchConfig.sortOrder);
            }
            if (searchConfig.expansions?.length) {
                params.append('expansions', searchConfig.expansions.join(','));
            }
            if (searchConfig.postFields?.length) {
                params.append('tweet.fields', searchConfig.postFields.join(','));
            }
            if (searchConfig.userFields?.length) {
                params.append('user.fields', searchConfig.userFields.join(','));
            }

            const response = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            const responseData = await response.json();

            if (response.status === 429) {
                const resetTime = response.headers.get('x-rate-limit-reset');
                return {
                    rate_limited: () => ({
                        error: 'Rate limit exceeded',
                        resetAt: resetTime ? new Date(parseInt(resetTime) * 1000).toISOString() : undefined,
                        details: responseData
                    })
                };
            }

            if (!response.ok) {
                return {
                    query_error: () => ({
                        error: 'Search failed',
                        status: response.status,
                        query: searchConfig.query,
                        details: responseData
                    })
                };
            }

            if (!responseData.data || responseData.data.length === 0) {
                return {
                    no_results: () => ({
                        query: searchConfig.query,
                        message: 'No posts found matching the search criteria',
                        searchedAt: new Date().toISOString()
                    })
                };
            }

            const result = {
                posts: responseData.data,
                resultCount: responseData.meta.result_count,
                nextToken: responseData.meta.next_token,
                includes: responseData.includes || {},
                query: searchConfig.query,
                searchedAt: new Date().toISOString()
            };

            state.set('lastSearchResults', result);

            return {
                posts_found: () => result
            };

        } catch (error) {
            console.error('Error in xSearchPosts:', error);
            return {
                query_error: () => ({
                    error: 'Search failed',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xSearchPosts = new XSearchPostsNode();