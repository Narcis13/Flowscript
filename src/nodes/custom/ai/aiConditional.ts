import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateObject } from 'ai';
import { getModel } from './utils';
import { z } from 'zod';

interface AiConditionalConfig {
    model: string;
    condition: string;
    branches: string[];
    confidenceThreshold?: number;
    temperature?: number;
    includeContext?: boolean;
}

@RegisterNode
export class AiConditionalNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiConditional',
        description: 'AI-powered conditional branching',
        type: 'control',
        ai_hints: {
            purpose: 'Use AI to determine workflow branches',
            when_to_use: 'When branching logic requires AI understanding',
            expected_edges: ['branch_a', 'branch_b', 'branch_c', 'unclear'],
            example_usage: 'Intent classification, smart routing'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const condConfig = config as AiConditionalConfig;

        if (!condConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!condConfig?.condition) {
            return {
                error: () => ({
                    message: 'Condition is required',
                    code: 'MISSING_CONDITION'
                })
            };
        }

        if (!condConfig?.branches || condConfig.branches.length < 2) {
            return {
                error: () => ({
                    message: 'At least two branches are required',
                    code: 'INSUFFICIENT_BRANCHES'
                })
            };
        }

        try {
            // Create schema for branch selection
            const branchSchema = z.object({
                branch: z.enum(condConfig.branches as [string, ...string[]]),
                confidence: z.number().min(0).max(1),
                reasoning: z.string()
            });

            // Build the prompt
            let prompt = `Evaluate the following condition and select the most appropriate branch:\n\n`;
            prompt += `Condition: ${condConfig.condition}\n`;
            prompt += `Available branches: ${condConfig.branches.join(', ')}\n`;
            
            if (condConfig.includeContext !== false) {
                const context = state.getAll();
                prompt += `\nCurrent context:\n${JSON.stringify(context, null, 2)}`;
            }

            prompt += `\n\nAnalyze the condition and context, then select the most appropriate branch. Provide your confidence level (0-1) and reasoning.`;

            const result = await generateObject({
                model: getModel(condConfig.model),
                schema: branchSchema,
                prompt,
                temperature: condConfig.temperature || 0.3 // Lower temperature for more consistent decisions
            });

            // Store decision in state
            state.set('lastAiConditional', {
                condition: condConfig.condition,
                selectedBranch: result.object.branch,
                confidence: result.object.confidence,
                reasoning: result.object.reasoning,
                timestamp: Date.now()
            });

            // Check confidence threshold
            const threshold = condConfig.confidenceThreshold || 0.7;
            if (result.object.confidence < threshold) {
                return {
                    unclear: () => ({
                        reasoning: result.object.reasoning,
                        confidence: result.object.confidence,
                        suggestedBranch: result.object.branch,
                        threshold
                    })
                };
            }

            // Return the selected branch as an edge
            const edges: SimpleEdgeMap = {
                [result.object.branch]: () => ({
                    reasoning: result.object.reasoning,
                    confidence: result.object.confidence
                })
            };

            return edges;

        } catch (error) {
            console.error('Error in aiConditional:', error);
            
            // Fallback to first branch on error
            return {
                [condConfig.branches[0]]: () => ({
                    reasoning: 'Error in AI evaluation, using default branch',
                    confidence: 0,
                    error: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const aiConditional = new AiConditionalNode();