import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateText } from 'ai';
import { getModel } from './utils';

interface AnalyzeImageConfig {
    model: string;
    imageUrl?: string;
    imageUrlPath?: string;
    imageBase64?: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
}

@RegisterNode
export class AnalyzeImageNode implements Node {
    metadata: NodeMetadata = {
        name: 'analyzeImage',
        description: 'Analyze images using vision-capable AI models',
        type: 'action',
        ai_hints: {
            purpose: 'Extract information from images',
            when_to_use: 'For image understanding and analysis',
            expected_edges: ['analyzed', 'unsupported', 'error'],
            example_usage: 'Image classification, OCR, visual QA'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const imgConfig = config as AnalyzeImageConfig;

        if (!imgConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!imgConfig?.prompt) {
            return {
                error: () => ({
                    message: 'Prompt is required',
                    code: 'MISSING_PROMPT'
                })
            };
        }

        // Get image URL or base64
        let imageUrl = imgConfig.imageUrl;
        let imageBase64 = imgConfig.imageBase64;
        
        if (!imageUrl && imgConfig.imageUrlPath) {
            imageUrl = state.get(imgConfig.imageUrlPath);
        }

        if (!imageUrl && !imageBase64) {
            return {
                error: () => ({
                    message: 'Either imageUrl or imageBase64 is required',
                    code: 'MISSING_IMAGE'
                })
            };
        }

        try {
            // Prepare image content
            let imageContent;
            if (imageBase64) {
                // Use base64 data URL
                imageContent = {
                    type: 'image' as const,
                    image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
                };
            } else {
                // Use URL
                imageContent = {
                    type: 'image' as const,
                    image: imageUrl!
                };
            }

            // Create message with image and text
            const messages = [{
                role: 'user' as const,
                content: [
                    {
                        type: 'text' as const,
                        text: imgConfig.prompt
                    },
                    imageContent
                ]
            }];

            const result = await generateText({
                model: getModel(imgConfig.model),
                messages,
                temperature: imgConfig.temperature,
                maxTokens: imgConfig.maxTokens
            });

            // Store result in state
            state.set('lastImageAnalysis', {
                description: result.text,
                imageSource: imageUrl || 'base64',
                prompt: imgConfig.prompt,
                usage: result.usage,
                model: imgConfig.model,
                timestamp: Date.now()
            });

            return {
                analyzed: () => ({
                    description: result.text,
                    usage: result.usage
                })
            };

        } catch (error) {
            console.error('Error in analyzeImage:', error);
            
            // Check if it's a model capability issue
            if (error instanceof Error && 
                (error.message.includes('vision') || 
                 error.message.includes('image') ||
                 error.message.includes('multimodal'))) {
                return {
                    unsupported: () => ({
                        message: 'Model does not support image input',
                        model: imgConfig.model,
                        suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'claude-3-opus', 'claude-3-5-sonnet']
                    })
                };
            }

            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'ANALYSIS_ERROR'
                })
            };
        }
    }
}

export const analyzeImage = new AnalyzeImageNode();