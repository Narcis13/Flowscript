import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import { generateObject } from 'ai';
import { getModel, parseSchema } from './utils';

interface AiDataExtractorConfig {
    model: string;
    text?: string;
    textPath?: string;
    extractionSchema: any;
    temperature?: number;
    systemPrompt?: string;
}

@RegisterNode
export class AiDataExtractorNode implements Node {
    metadata: NodeMetadata = {
        name: 'aiDataExtractor',
        description: 'Extract structured data from unstructured text',
        type: 'action',
        ai_hints: {
            purpose: 'Parse and extract specific data from text',
            when_to_use: 'For data mining and information extraction',
            expected_edges: ['extracted', 'noData', 'error'],
            example_usage: 'Extract emails, dates, entities from documents'
        }
    };

    async execute({ state, config }: ExecutionContext): Promise<SimpleEdgeMap> {
        const extractConfig = config as AiDataExtractorConfig;

        if (!extractConfig?.model) {
            return {
                error: () => ({
                    message: 'Model is required',
                    code: 'MISSING_MODEL'
                })
            };
        }

        if (!extractConfig?.extractionSchema) {
            return {
                error: () => ({
                    message: 'Extraction schema is required',
                    code: 'MISSING_SCHEMA'
                })
            };
        }

        // Get text
        let text = extractConfig.text;
        
        if (!text && extractConfig.textPath) {
            text = state.get(extractConfig.textPath);
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
            // Parse schema
            const parsedSchema = parseSchema(extractConfig.extractionSchema);

            // Build extraction prompt
            let prompt = `Extract the following information from this text:\n\n`;
            prompt += `Text: ${text}\n\n`;
            prompt += `Please extract all relevant data according to the schema. If a field cannot be found, set it to null.`;

            const requestParams: any = {
                model: getModel(extractConfig.model),
                schema: parsedSchema,
                prompt,
                temperature: extractConfig.temperature || 0.1 // Low temperature for accuracy
            };

            if (extractConfig.systemPrompt) {
                requestParams.system = extractConfig.systemPrompt;
            }

            const result = await generateObject(requestParams);

            // Check if any data was extracted
            const hasData = Object.values(result.object).some(value => 
                value !== null && 
                value !== undefined && 
                value !== '' &&
                (Array.isArray(value) ? value.length > 0 : true)
            );

            if (!hasData) {
                return {
                    noData: () => ({
                        message: 'No relevant data found in text',
                        textLength: text.length,
                        schema: extractConfig.extractionSchema
                    })
                };
            }

            // Store extracted data in state
            state.set('lastExtractedData', {
                data: result.object,
                sourceTextLength: text.length,
                usage: result.usage,
                model: extractConfig.model,
                timestamp: Date.now()
            });

            // Calculate extraction confidence based on how many fields were extracted
            const totalFields = Object.keys(result.object).length;
            const extractedFields = Object.values(result.object).filter(v => 
                v !== null && v !== undefined && v !== ''
            ).length;
            const confidence = totalFields > 0 ? extractedFields / totalFields : 0;

            return {
                extracted: () => ({
                    data: result.object,
                    confidence,
                    extractedFields,
                    totalFields,
                    usage: result.usage
                })
            };

        } catch (error) {
            console.error('Error in aiDataExtractor:', error);
            return {
                error: () => ({
                    message: error instanceof Error ? error.message : String(error),
                    code: (error as any).code || 'EXTRACTION_ERROR'
                })
            };
        }
    }
}

export const aiDataExtractor = new AiDataExtractorNode();