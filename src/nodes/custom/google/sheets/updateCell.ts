import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class UpdateCellNode implements Node {
    metadata: NodeMetadata = {
        name: 'updateCell',
        description: 'Updates a single cell in Google Sheets',
        type: 'action',
        ai_hints: {
            purpose: 'Update a single cell value in a spreadsheet',
            when_to_use: 'When you need to update a specific cell without affecting other cells',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Update cell at specific location like "Sheet1!A1"'
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

            if (!config?.cell) {
                return { config_error: () => ({ error: "Cell reference is required (e.g., 'Sheet1!A1')" }) };
            }

            if (config?.value === undefined) {
                return { config_error: () => ({ error: "Value is required (can be empty string to clear)" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Update the single cell
            const response = await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheetId,
                range: config.cell,
                valueInputOption: config.valueInputOption || 'USER_ENTERED',
                requestBody: {
                    values: [[config.value]]
                }
            });

            const result = response.data;

            const resultPayload = {
                spreadsheetId: result.spreadsheetId,
                updatedRange: result.updatedRange,
                updatedCells: result.updatedCells,
                previousValue: config.previousValue, // If provided by user for tracking
                newValue: config.value,
                updatedAt: new Date().toISOString()
            };

            state.set('lastCellUpdated', {
                spreadsheetId: config.spreadsheetId,
                cell: config.cell,
                value: config.value,
                updatedAt: resultPayload.updatedAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in updateCell:', error);
            
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
                        message: 'Invalid cell reference',
                        cell: config?.cell,
                        hint: 'Use format like "Sheet1!A1" or just "A1" for the first sheet'
                    }) 
                };
            }
            
            return {
                error: () => ({
                    message: 'Failed to update cell',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const updateCell = new UpdateCellNode();