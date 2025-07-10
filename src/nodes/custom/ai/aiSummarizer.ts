import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateText } from 'ai';
import { getModel } from './utils';

interface AiSummarizerConfig {
    model: string;
    text?: string;
    textPath?: string;
    style?: 'concise' | 'detailed' | 'bullet-points' | 'executive' | 'technical';
    maxLength?: number;
    temperature?: number;
    focusAreas?: string[];
    language?: string;
}

@RegisterNode
export class AiSummarizerNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiSummarizer',
        description: 'Summarize long texts intelligently',
        type: 'action',
        ai_hints: {
            purpose: 'Create concise summaries of longer content',
            when_to_use: 'For document summarization and content compression',
            expected_edges: ['summarized', 'tooShort', 'error'],
            example_usage: 'Document summaries, meeting notes, article digests'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const sumConfig = config as AiSummarizerConfig;

        if (!sumConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        // Get text
        let text = sumConfig.text;
        
        if (!text && sumConfig.textPath) {
            text = state.get(sumConfig.textPath);
        }

        if (!text) {
            return {
                error: () => ({
                    message: 'Text is required',
                    code: 'MISSING_TEXT'
                })
            };
        }

        const inputText = typeof text === 'string' ? text : JSON.stringify(text);
        
        // Check if text is too short to summarize
        if (inputText.length < 100) {
            return {
                tooShort: () => ({
                    message: 'Text too short to summarize',
                    originalLength: inputText.length,
                    minimumLength: 100
                })
            };
        }

        try {
            // Build summarization prompt
            const style = sumConfig.style || 'concise';
            const maxLength = sumConfig.maxLength || 200;
            const language = sumConfig.language || 'English';
            
            let prompt = `Summarize the following text in ${style} style.\n`;
            prompt += `Maximum length: ${maxLength} words\n`;
            prompt += `Language: ${language}\n`;
            
            if (sumConfig.focusAreas && sumConfig.focusAreas.length > 0) {
                prompt += `Focus areas: ${sumConfig.focusAreas.join(', ')}\n`;
            }
            
            // Style-specific instructions
            switch (style) {
                case 'bullet-points':
                    prompt += `Format: Use bullet points for key information\n`;
                    break;
                case 'executive':
                    prompt += `Format: Executive summary with key insights and recommendations\n`;
                    break;
                case 'technical':
                    prompt += `Format: Technical summary preserving important details and terminology\n`;
                    break;
                case 'detailed':
                    prompt += `Format: Comprehensive summary covering all major points\n`;
                    break;
            }
            
            prompt += `\nText to summarize:\n${inputText}`;

            const result = await generateText({
                model: getModel(sumConfig.model),
                prompt,
                temperature: sumConfig.temperature || 0.3,
                maxTokens: Math.floor(maxLength * 1.5) // Approximate token count
            });

            // Calculate reduction metrics
            const summaryLength = result.text.length;
            const reductionRatio = inputText.length / summaryLength;
            const wordCount = result.text.split(/\s+/).length;

            // Store summary in state
            state.set('lastSummary', {
                summary: result.text,
                originalLength: inputText.length,
                summaryLength,
                reductionRatio,
                wordCount,
                style,
                usage: result.usage,
                model: sumConfig.model,
                timestamp: Date.now()
            });

            return {
                summarized: () => ({
                    summary: result.text,
                    reductionRatio,
                    wordCount,
                    originalLength: inputText.length,
                    summaryLength,
                    usage: result.usage
                })
            };

        } catch (error) {
            console.error('Error in aiSummarizer:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'SUMMARIZATION_ERROR'
                })
            };
        }
    }
}

export const aiSummarizer = new AiSummarizerNode();