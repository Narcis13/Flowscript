import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateObject } from 'ai';
import { getModel } from './utils';
import { z } from 'zod';

interface AiLoopConfig {
    model: string;
    exitCondition: string;
    maxIterations?: number;
    temperature?: number;
    includeContext?: boolean;
    iterationKey?: string;
}

@RegisterNode
export class AiLoopNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiLoop',
        description: 'AI-controlled loop iterations',
        type: 'control',
        ai_hints: {
            purpose: 'Let AI decide when to continue or exit loops',
            when_to_use: 'For intelligent iteration control',
            expected_edges: ['next_iteration', 'exit_loop'],
            example_usage: 'Refinement loops, quality checks'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const loopConfig = config as AiLoopConfig;

        if (!loopConfig?.model) {
            return {
                exit_loop: () => ({
                    reason: 'Model is required',
                    error: 'MISSING_MODEL'
                })
            };
        }

        if (!loopConfig?.exitCondition) {
            return {
                exit_loop: () => ({
                    reason: 'Exit condition is required',
                    error: 'MISSING_EXIT_CONDITION'
                })
            };
        }

        // Get current iteration count
        const iterationKey = loopConfig.iterationKey || 'loopIteration';
        const currentIteration = state.get(iterationKey) || 0;
        const maxIterations = loopConfig.maxIterations || 10;

        // Check max iterations
        if (currentIteration >= maxIterations) {
            return {
                exit_loop: () => ({
                    reason: 'Maximum iterations reached',
                    iterations: currentIteration,
                    maxIterations
                })
            };
        }

        try {
            // Create schema for loop decision
            const loopSchema = z.object({
                shouldContinue: z.boolean(),
                reason: z.string(),
                progress: z.string().optional(),
                suggestedChanges: z.string().optional()
            });

            // Build the prompt
            let prompt = `Evaluate whether to continue or exit the loop based on the following:\n\n`;
            prompt += `Exit Condition: ${loopConfig.exitCondition}\n`;
            prompt += `Current Iteration: ${currentIteration + 1}\n`;
            prompt += `Max Iterations: ${maxIterations}\n`;
            
            if (loopConfig.includeContext !== false) {
                const context = state.getAll();
                prompt += `\nCurrent State:\n${JSON.stringify(context, null, 2)}`;
            }

            prompt += `\n\nDetermine if the loop should continue (true) or exit (false). Provide reasoning and any progress update.`;

            const result = await generateObject({
                model: getModel(loopConfig.model),
                schema: loopSchema,
                prompt,
                temperature: loopConfig.temperature || 0.3
            });

            // Store loop decision in state
            state.set('lastLoopDecision', {
                iteration: currentIteration,
                shouldContinue: result.object.shouldContinue,
                reason: result.object.reason,
                progress: result.object.progress,
                timestamp: Date.now()
            });

            if (result.object.shouldContinue) {
                // Increment iteration counter
                state.set(iterationKey, currentIteration + 1);

                return {
                    next_iteration: () => ({
                        iteration: currentIteration + 1,
                        reason: result.object.reason,
                        progress: result.object.progress,
                        suggestedChanges: result.object.suggestedChanges
                    })
                };
            } else {
                // Reset iteration counter
                state.set(iterationKey, 0);

                return {
                    exit_loop: () => ({
                        reason: result.object.reason,
                        iterations: currentIteration,
                        finalProgress: result.object.progress
                    })
                };
            }

        } catch (error) {
            console.error('Error in aiLoop:', error);
            
            // Exit loop on error
            state.set(iterationKey, 0);
            
            return {
                exit_loop: () => ({
                    reason: 'Error in AI evaluation',
                    error: error instanceof Error ? error.message : String(error),
                    iterations: currentIteration
                })
            };
        }
    }
}

export const aiLoop = new AiLoopNode();