import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class ClearRangeNode implements Node {
    metadata: NodeMetadata = {
        name: 'clearRange',
        description: 'Clears values from a range in Google Sheets',
        type: 'action',
        ai_hints: {
            purpose: 'Clear values from a specific range in a spreadsheet',
            when_to_use: 'When you need to remove data from cells without deleting formatting',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Clear range like "Sheet1!A1:C10" from a spreadsheet'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            if (!config?.spreadsheetId) {
                return { config_error: () => ({ error: "Spreadsheet ID is required" }) };
            }

            if (!config?.range) {
                return { config_error: () => ({ error: "Range is required (e.g., 'Sheet1!A1:C10')" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Clear the range
            const response = await sheets.spreadsheets.values.clear({
                spreadsheetId: config.spreadsheetId,
                range: config.range
            });

            const result = response.data;

            const resultPayload = {
                spreadsheetId: result.spreadsheetId,
                clearedRange: result.clearedRange,
                clearedAt: new Date().toISOString()
            };

            state.set('lastRangeCleared', {
                spreadsheetId: config.spreadsheetId,
                range: config.range,
                clearedAt: resultPayload.clearedAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in clearRange:', error);
            
            if (error.code === 404) {
                return { 
                    error: () => ({ 
                        message: 'Spreadsheet not found',
                        spreadsheetId: config?.spreadsheetId 
                    }) 
                };
            }
            
            if (error.code === 400 && error.message?.includes('range')) {
                return { 
                    error: () => ({ 
                        message: 'Invalid range',
                        range: config?.range,
                        hint: 'Use format like "Sheet1!A1:C10"'
                    }) 
                };
            }
            
            return {
                error: () => ({
                    message: 'Failed to clear range from spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const clearRange = new ClearRangeNode();