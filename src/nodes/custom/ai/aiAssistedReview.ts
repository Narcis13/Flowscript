import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateObject } from 'ai';
import { getModel } from './utils';
import { z } from 'zod';

interface AiAssistedReviewConfig {
    model: string;
    content: string;
    reviewCriteria: string;
    temperature?: number;
    requireFeedback?: boolean;
    allowRevisions?: boolean;
}

@RegisterNode
export class AiAssistedReviewNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiAssistedReview',
        description: 'AI prepares content for human review',
        type: 'human',
        ai_hints: {
            purpose: 'Combine AI analysis with human judgment',
            when_to_use: 'For quality control and decision support',
            expected_edges: ['approved', 'rejected', 'needsRevision'],
            example_usage: 'Content moderation, document review'
        },
        humanInteraction: {
            formSchema: {
                type: 'object',
                properties: {
                    decision: {
                        type: 'string',
                        enum: ['approve', 'reject', 'revise'],
                        title: 'Review Decision',
                        description: 'Select your decision based on the AI analysis'
                    },
                    feedback: { 
                        type: 'string',
                        title: 'Feedback',
                        description: 'Provide additional feedback or reasoning'
                    },
                    revisions: { 
                        type: 'array', 
                        items: { type: 'string' },
                        title: 'Requested Revisions',
                        description: 'List specific changes needed (if revising)'
                    }
                },
                required: ['decision']
            }
        }
    };

    async execute({ state, runtime, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const reviewConfig = config as AiAssistedReviewConfig;

        if (!reviewConfig?.model) {
            return {
                needsRevision: () => ({
                    error: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!reviewConfig?.content) {
            return {
                needsRevision: () => ({
                    error: 'Content is required',
                    code: 'MISSING_CONTENT'
                })
            };
        }

        if (!reviewConfig?.reviewCriteria) {
            return {
                needsRevision: () => ({
                    error: 'Review criteria is required',
                    code: 'MISSING_CRITERIA'
                })
            };
        }

        try {
            // First, get AI analysis
            const analysisSchema = z.object({
                summary: z.string(),
                issues: z.array(z.string()),
                recommendations: z.array(z.string()),
                riskScore: z.number().min(0).max(10),
                strengths: z.array(z.string()).optional(),
                suggestedDecision: z.enum(['approve', 'reject', 'revise']).optional()
            });

            const analysisPrompt = `Analyze the following content for review based on these criteria:\n\n` +
                `Criteria: ${reviewConfig.reviewCriteria}\n\n` +
                `Content: ${reviewConfig.content}\n\n` +
                `Provide a summary, identify issues, make recommendations, and assess risk (0-10 scale).`;

            const aiAnalysis = await generateObject({
                model: getModel(reviewConfig.model),
                schema: analysisSchema,
                prompt: analysisPrompt,
                temperature: reviewConfig.temperature || 0.3
            });

            // Store AI analysis in state
            state.set('lastAiReviewAnalysis', {
                analysis: aiAnalysis.object,
                content: reviewConfig.content,
                criteria: reviewConfig.reviewCriteria,
                timestamp: Date.now()
            });

            // Present to human with AI insights
            if (runtime) {
                runtime.emit({
                    type: 'human_interaction_required',
                    nodeInfo: {
                        name: 'aiAssistedReview',
                        formSchema: this.metadata.humanInteraction?.formSchema,
                        contextData: {
                            content: reviewConfig.content,
                            aiAnalysis: aiAnalysis.object,
                            reviewCriteria: reviewConfig.reviewCriteria
                        }
                    }
                });

                // Pause execution and wait for human response
                const pauseToken = runtime.pause();
                const response = await runtime.waitForResume(pauseToken);

                // Validate response has required fields
                if (!response || !response.decision) {
                    return {
                        needsRevision: () => ({
                            error: 'Invalid response',
                            message: 'Decision is required'
                        })
                    };
                }

                // Store review decision in state
                state.set('lastReviewDecision', {
                    decision: response.decision,
                    feedback: response.feedback,
                    revisions: response.revisions,
                    reviewer: response.userId || 'unknown',
                    aiRiskScore: aiAnalysis.object.riskScore,
                    timestamp: Date.now()
                });

                switch (response.decision) {
                    case 'approve':
                        return {
                            approved: () => ({
                                approvedBy: response.userId || 'unknown',
                                aiRiskScore: aiAnalysis.object.riskScore,
                                feedback: response.feedback,
                                strengths: aiAnalysis.object.strengths,
                                timestamp: new Date().toISOString()
                            })
                        };
                    
                    case 'reject':
                        return {
                            rejected: () => ({
                                rejectedBy: response.userId || 'unknown',
                                reasons: [...aiAnalysis.object.issues, ...(response.feedback ? [response.feedback] : [])],
                                aiRiskScore: aiAnalysis.object.riskScore,
                                timestamp: new Date().toISOString()
                            })
                        };
                    
                    case 'revise':
                        return {
                            needsRevision: () => ({
                                revisions: response.revisions || [],
                                aiRecommendations: aiAnalysis.object.recommendations,
                                feedback: response.feedback,
                                requestedBy: response.userId || 'unknown',
                                timestamp: new Date().toISOString()
                            })
                        };
                    
                    default:
                        return {
                            needsRevision: () => ({
                                error: 'Invalid decision',
                                decision: response.decision
                            })
                        };
                }
            } else {
                // If no runtime, return AI analysis only
                return {
                    needsRevision: () => ({
                        message: 'Human review required',
                        aiAnalysis: aiAnalysis.object,
                        requiresRuntime: true
                    })
                };
            }

        } catch (error) {
            console.error('Error in aiAssistedReview:', error);
            return {
                needsRevision: () => ({
                    error: 'Review failed',
                    message: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const aiAssistedReview = new AiAssistedReviewNode();