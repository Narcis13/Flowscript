import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateObject } from 'ai';
import { getModel } from './utils';
import { z } from 'zod';

interface AiTranslatorConfig {
    model: string;
    text?: string;
    textPath?: string;
    sourceLang?: string;
    targetLang: string;
    preserveFormatting?: boolean;
    temperature?: number;
    tone?: 'formal' | 'informal' | 'technical' | 'creative';
}

@RegisterNode
export class AiTranslatorNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiTranslator',
        description: 'Translate text between languages',
        type: 'action',
        ai_hints: {
            purpose: 'Language translation with context awareness',
            when_to_use: 'For multilingual content processing',
            expected_edges: ['translated', 'unsupportedLanguage', 'error'],
            example_usage: 'Document translation, chat translation'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const transConfig = config as AiTranslatorConfig;

        if (!transConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!transConfig?.targetLang) {
            return {
                error: () => ({
                    message: 'Target language is required',
                    code: 'MISSING_TARGET_LANG'
                })
            };
        }

        // Get text
        let text = transConfig.text;
        
        if (!text && transConfig.textPath) {
            text = state.get(transConfig.textPath);
        }

        if (!text) {
            return {
                error: () => ({
                    message: 'Text is required',
                    code: 'MISSING_TEXT'
                })
            };
        }

        try {
            // Define schema based on whether formatting should be preserved
            const schema = transConfig.preserveFormatting 
                ? z.object({
                    translation: z.string(),
                    detectedSourceLang: z.string().optional(),
                    preservedElements: z.array(z.object({
                        type: z.string(),
                        original: z.string(),
                        translated: z.string()
                    })).optional(),
                    confidence: z.number().min(0).max(1),
                    notes: z.string().optional()
                })
                : z.object({
                    translation: z.string(),
                    detectedSourceLang: z.string().optional(),
                    confidence: z.number().min(0).max(1),
                    notes: z.string().optional()
                });

            // Build translation prompt
            let prompt = `Translate the following text from ${transConfig.sourceLang || 'auto-detect'} to ${transConfig.targetLang}.\n`;
            
            if (transConfig.tone) {
                prompt += `Tone: ${transConfig.tone}\n`;
            }
            
            if (transConfig.preserveFormatting) {
                prompt += `Preserve formatting elements like URLs, email addresses, code blocks, and special formatting.\n`;
                prompt += `List any preserved elements separately.\n`;
            }
            
            prompt += `Provide a confidence score (0-1) for the translation quality.\n`;
            prompt += `If the source language is auto-detected, specify it.\n\n`;
            prompt += `Text to translate:\n${text}`;

            const result = await generateObject({
                model: getModel(transConfig.model),
                schema,
                prompt,
                temperature: transConfig.temperature || 0.3
            });

            // Check for unsupported language scenarios
            if (result.object.confidence < 0.3) {
                return {
                    unsupportedLanguage: () => ({
                        message: 'Low confidence translation - language may be unsupported',
                        sourceLang: result.object.detectedSourceLang || transConfig.sourceLang || 'unknown',
                        targetLang: transConfig.targetLang,
                        confidence: result.object.confidence,
                        attemptedTranslation: result.object.translation
                    })
                };
            }

            // Store translation in state
            state.set('lastTranslation', {
                original: text,
                translation: result.object.translation,
                sourceLang: result.object.detectedSourceLang || transConfig.sourceLang || 'auto-detected',
                targetLang: transConfig.targetLang,
                confidence: result.object.confidence,
                preservedElements: result.object.preservedElements,
                model: transConfig.model,
                timestamp: Date.now()
            });

            return {
                translated: () => ({
                    translation: result.object.translation,
                    sourceLang: result.object.detectedSourceLang || transConfig.sourceLang || 'detected',
                    targetLang: transConfig.targetLang,
                    confidence: result.object.confidence,
                    preservedElements: result.object.preservedElements,
                    notes: result.object.notes
                })
            };

        } catch (error) {
            console.error('Error in aiTranslator:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'TRANSLATION_ERROR'
                })
            };
        }
    }
}

export const aiTranslator = new AiTranslatorNode();