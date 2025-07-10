import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XCreatePostConfig {
    text?: string;
    mediaIds?: string[];
    poll?: {
        options: string[];
        durationMinutes: number;
    };
    replySettings?: 'everyone' | 'mentionedUsers' | 'following';
    inReplyToTweetId?: string;
    quoteTweetId?: string;
}

@RegisterNode
export class XCreatePostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xCreatePost',
        description: 'Create a new post on X platform',
        type: 'action',
        ai_hints: {
            purpose: 'Publish content to X',
            when_to_use: 'When creating original posts, replies, or quote tweets',
            expected_edges: ['post_created', 'content_error', 'rate_limited', 'auth_error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const postConfig = config as XCreatePostConfig;
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

        // Validate content
        if (!postConfig?.text && !postConfig?.mediaIds?.length) {
            return {
                content_error: () => ({
                    error: 'Post must contain either text or media',
                    details: 'Provide text content or media IDs'
                })
            };
        }

        if (postConfig.text && postConfig.text.length > 280) {
            return {
                content_error: () => ({
                    error: 'Post text exceeds character limit',
                    length: postConfig.text.length,
                    limit: 280
                })
            };
        }

        if (postConfig.poll) {
            if (postConfig.poll.options.length < 2 || postConfig.poll.options.length > 4) {
                return {
                    content_error: () => ({
                        error: 'Poll must have 2-4 options',
                        optionsCount: postConfig.poll.options.length
                    })
                };
            }
            if (postConfig.poll.durationMinutes < 5 || postConfig.poll.durationMinutes > 10080) {
                return {
                    content_error: () => ({
                        error: 'Poll duration must be between 5 minutes and 7 days',
                        duration: postConfig.poll.durationMinutes
                    })
                };
            }
        }

        try {
            const requestBody: any = {};
            
            if (postConfig.text) {
                requestBody.text = postConfig.text;
            }
            
            if (postConfig.mediaIds?.length) {
                requestBody.media = {
                    media_ids: postConfig.mediaIds
                };
            }
            
            if (postConfig.poll) {
                requestBody.poll = {
                    options: postConfig.poll.options,
                    duration_minutes: postConfig.poll.durationMinutes
                };
            }
            
            if (postConfig.replySettings) {
                requestBody.reply_settings = postConfig.replySettings;
            }
            
            if (postConfig.inReplyToTweetId) {
                requestBody.reply = {
                    in_reply_to_tweet_id: postConfig.inReplyToTweetId
                };
            }
            
            if (postConfig.quoteTweetId) {
                requestBody.quote_tweet_id = postConfig.quoteTweetId;
            }

            const response = await fetch('https://api.twitter.com/2/tweets', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
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
                    content_error: () => ({
                        error: 'Failed to create post',
                        status: response.status,
                        details: responseData
                    })
                };
            }

            const result = {
                postId: responseData.data.id,
                text: responseData.data.text,
                createdAt: new Date().toISOString(),
                authorId: responseData.data.author_id,
                editHistoryTweetIds: responseData.data.edit_history_tweet_ids
            };

            state.set('lastCreatedPost', result);

            return {
                post_created: () => result
            };

        } catch (error) {
            console.error('Error in xCreatePost:', error);
            return {
                content_error: () => ({
                    error: 'Failed to create post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xCreatePost = new XCreatePostNode();