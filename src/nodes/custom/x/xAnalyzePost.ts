import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XAnalyzePostConfig {
    postId: string;
    analysisTypes: ('sentiment' | 'entities' | 'context' | 'language')[];
}

@RegisterNode
export class XAnalyzePostNode implements Node {
    metadata: NodeMetadata = {
        name: 'xAnalyzePost',
        description: 'Analyze post for sentiment, entities, and context annotations',
        type: 'action',
        ai_hints: {
            purpose: 'Extract insights from post content',
            when_to_use: 'For content analysis, moderation, or classification',
            expected_edges: ['analysis_complete', 'content_flagged', 'analysis_error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const analyzeConfig = config as XAnalyzePostConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                analysis_error: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!analyzeConfig?.postId) {
            return {
                analysis_error: () => ({
                    error: 'Post ID is required',
                    details: 'Provide the ID of the post to analyze'
                })
            };
        }

        if (!analyzeConfig.analysisTypes || analyzeConfig.analysisTypes.length === 0) {
            return {
                analysis_error: () => ({
                    error: 'Analysis types required',
                    details: 'Specify at least one analysis type: sentiment, entities, context, or language'
                })
            };
        }

        try {
            // First, get the post content with context annotations
            const params = new URLSearchParams({
                'tweet.fields': 'text,lang,context_annotations,entities,created_at,public_metrics',
                'expansions': 'author_id,referenced_tweets.id'
            });

            const response = await fetch(`https://api.twitter.com/2/tweets/${analyzeConfig.postId}?${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            if (!response.ok) {
                return {
                    analysis_error: () => ({
                        error: 'Failed to retrieve post for analysis',
                        status: response.status,
                        postId: analyzeConfig.postId
                    })
                };
            }

            const postData = await response.json();
            const post = postData.data;
            const analysis: any = {
                postId: post.id,
                text: post.text,
                createdAt: post.created_at,
                analyzedAt: new Date().toISOString()
            };

            // Perform requested analyses
            if (analyzeConfig.analysisTypes.includes('sentiment')) {
                analysis.sentiment = this.analyzeSentiment(post.text);
            }

            if (analyzeConfig.analysisTypes.includes('entities') && post.entities) {
                analysis.entities = {
                    hashtags: post.entities.hashtags || [],
                    mentions: post.entities.mentions || [],
                    urls: post.entities.urls || [],
                    cashtags: post.entities.cashtags || []
                };
            }

            if (analyzeConfig.analysisTypes.includes('context') && post.context_annotations) {
                analysis.contextAnnotations = post.context_annotations.map((annotation: any) => ({
                    domain: {
                        id: annotation.domain.id,
                        name: annotation.domain.name,
                        description: annotation.domain.description
                    },
                    entity: {
                        id: annotation.entity.id,
                        name: annotation.entity.name,
                        description: annotation.entity.description
                    }
                }));
            }

            if (analyzeConfig.analysisTypes.includes('language')) {
                analysis.language = {
                    code: post.lang,
                    confidence: 0.95 // Placeholder - X API provides lang code
                };
            }

            // Check for potentially problematic content
            const contentFlags = this.checkContentFlags(post.text);
            if (contentFlags.length > 0) {
                state.set('lastFlaggedContent', {
                    postId: post.id,
                    flags: contentFlags,
                    flaggedAt: new Date().toISOString()
                });

                return {
                    content_flagged: () => ({
                        ...analysis,
                        flags: contentFlags,
                        severity: this.calculateSeverity(contentFlags)
                    })
                };
            }

            state.set('lastPostAnalysis', analysis);

            return {
                analysis_complete: () => analysis
            };

        } catch (error) {
            console.error('Error in xAnalyzePost:', error);
            return {
                analysis_error: () => ({
                    error: 'Failed to analyze post',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }

    private analyzeSentiment(text: string): { score: number; label: string; confidence: number } {
        // Simplified sentiment analysis - in production, use a proper NLP service
        const positiveWords = ['love', 'great', 'awesome', 'excellent', 'good', 'wonderful', 'fantastic', 'happy'];
        const negativeWords = ['hate', 'terrible', 'awful', 'bad', 'horrible', 'sad', 'angry', 'disappointed'];
        
        const lowerText = text.toLowerCase();
        let score = 0;
        
        positiveWords.forEach(word => {
            if (lowerText.includes(word)) score += 1;
        });
        
        negativeWords.forEach(word => {
            if (lowerText.includes(word)) score -= 1;
        });

        const normalizedScore = Math.max(-1, Math.min(1, score / 3));
        
        return {
            score: normalizedScore,
            label: normalizedScore > 0.2 ? 'positive' : normalizedScore < -0.2 ? 'negative' : 'neutral',
            confidence: Math.min(0.9, Math.abs(normalizedScore) + 0.5)
        };
    }

    private checkContentFlags(text: string): string[] {
        const flags = [];
        const lowerText = text.toLowerCase();

        // Simple content flagging - in production, use a proper moderation API
        const profanityPatterns = ['spam', 'scam', 'phishing'];
        const violencePatterns = ['threat', 'kill', 'violence'];
        
        if (profanityPatterns.some(pattern => lowerText.includes(pattern))) {
            flags.push('potential_spam');
        }
        
        if (violencePatterns.some(pattern => lowerText.includes(pattern))) {
            flags.push('potential_violence');
        }
        
        if (text.split(' ').filter(word => word.startsWith('#')).length > 10) {
            flags.push('excessive_hashtags');
        }
        
        if ((text.match(/https?:\/\//g) || []).length > 3) {
            flags.push('excessive_links');
        }

        return flags;
    }

    private calculateSeverity(flags: string[]): 'low' | 'medium' | 'high' {
        if (flags.includes('potential_violence')) return 'high';
        if (flags.includes('potential_spam')) return 'medium';
        return 'low';
    }
}

export const xAnalyzePost = new XAnalyzePostNode();