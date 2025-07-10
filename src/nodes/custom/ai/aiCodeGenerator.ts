import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateObject } from 'ai';
import { getModel, validateCode } from './utils';
import { z } from 'zod';

interface AiCodeGeneratorConfig {
    model: string;
    language: string;
    specification: string;
    validateSyntax?: boolean;
    includeComments?: boolean;
    includeExplanation?: boolean;
    style?: 'minimal' | 'verbose' | 'best-practices';
    temperature?: number;
}

@RegisterNode
export class AiCodeGeneratorNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiCodeGenerator',
        description: 'Generate code snippets or complete functions',
        type: 'action',
        ai_hints: {
            purpose: 'AI-powered code generation',
            when_to_use: 'For automated coding tasks',
            expected_edges: ['generated', 'syntaxError', 'error'],
            example_usage: 'Generate functions, convert pseudocode, create templates'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const codeConfig = config as AiCodeGeneratorConfig;

        if (!codeConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!codeConfig?.language) {
            return {
                error: () => ({
                    message: 'Programming language is required',
                    code: 'MISSING_LANGUAGE'
                })
            };
        }

        if (!codeConfig?.specification) {
            return {
                error: () => ({
                    message: 'Code specification is required',
                    code: 'MISSING_SPECIFICATION'
                })
            };
        }

        try {
            // Define schema for code generation
            const schema = z.object({
                code: z.string(),
                language: z.string(),
                explanation: z.string().optional(),
                dependencies: z.array(z.string()).optional(),
                complexity: z.enum(['simple', 'moderate', 'complex']).optional(),
                warnings: z.array(z.string()).optional()
            });

            // Build code generation prompt
            const style = codeConfig.style || 'best-practices';
            let prompt = `Generate ${codeConfig.language} code based on the following specification:\n\n`;
            prompt += `Specification: ${codeConfig.specification}\n\n`;
            prompt += `Requirements:\n`;
            prompt += `- Language: ${codeConfig.language}\n`;
            prompt += `- Style: ${style}\n`;
            
            if (codeConfig.includeComments !== false) {
                prompt += `- Include helpful comments\n`;
            }
            
            if (codeConfig.includeExplanation) {
                prompt += `- Provide an explanation of the code\n`;
            }
            
            switch (style) {
                case 'minimal':
                    prompt += `- Keep the code concise and minimal\n`;
                    break;
                case 'verbose':
                    prompt += `- Include detailed comments and error handling\n`;
                    break;
                case 'best-practices':
                    prompt += `- Follow language best practices and conventions\n`;
                    break;
            }
            
            prompt += `\nGenerate clean, working code that fulfills the specification.`;

            const result = await generateObject({
                model: getModel(codeConfig.model),
                schema,
                prompt,
                temperature: codeConfig.temperature || 0.3 // Lower temperature for code
            });

            // Validate syntax if requested
            if (codeConfig.validateSyntax) {
                const isValid = await validateCode(result.object.code, codeConfig.language);
                if (!isValid) {
                    return {
                        syntaxError: () => ({
                            code: result.object.code,
                            language: result.object.language,
                            message: 'Generated code has syntax errors',
                            explanation: result.object.explanation,
                            warnings: result.object.warnings
                        })
                    };
                }
            }

            // Store generated code in state
            state.set('lastGeneratedCode', {
                code: result.object.code,
                language: result.object.language,
                specification: codeConfig.specification,
                explanation: result.object.explanation,
                dependencies: result.object.dependencies,
                complexity: result.object.complexity,
                model: codeConfig.model,
                timestamp: Date.now()
            });

            return {
                generated: () => ({
                    code: result.object.code,
                    language: result.object.language,
                    explanation: result.object.explanation,
                    dependencies: result.object.dependencies,
                    complexity: result.object.complexity,
                    warnings: result.object.warnings
                })
            };

        } catch (error) {
            console.error('Error in aiCodeGenerator:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'GENERATION_ERROR'
                })
            };
        }
    }
}

export const aiCodeGenerator = new AiCodeGeneratorNode();