import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class WriteRangeNode implements Node {
    metadata: NodeMetadata = {
        name: 'writeRange',
        description: 'Writes data to a range in Google Sheets',
        type: 'action',
        ai_hints: {
            purpose: 'Write data to a specific range in a spreadsheet',
            when_to_use: 'When you need to update or write data to cells in a spreadsheet',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Write data to range like "Sheet1!A1:C10"'
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

            if (!config?.values || !Array.isArray(config.values)) {
                return { config_error: () => ({ error: "Values array is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Prepare values - handle both array of arrays and array of objects
            let values = config.values;
            
            if (config.values.length > 0 && typeof config.values[0] === 'object' && !Array.isArray(config.values[0])) {
                // Convert array of objects to array of arrays
                const keys = config.includeHeaders !== false ? Object.keys(config.values[0]) : [];
                values = config.values.map((obj: any) => 
                    keys.length > 0 ? keys.map(key => obj[key]) : Object.values(obj)
                );
                
                if (config.includeHeaders !== false && keys.length > 0) {
                    values.unshift(keys);
                }
            }

            // Write the data
            const response = await sheets.spreadsheets.values.update({
                spreadsheetId: config.spreadsheetId,
                range: config.range,
                valueInputOption: config.valueInputOption || 'USER_ENTERED',
                requestBody: {
                    values: values,
                    majorDimension: config.majorDimension || 'ROWS'
                }
            });

            const result = response.data;

            const resultPayload = {
                spreadsheetId: result.spreadsheetId,
                updatedRange: result.updatedRange,
                updatedRows: result.updatedRows,
                updatedColumns: result.updatedColumns,
                updatedCells: result.updatedCells,
                writtenAt: new Date().toISOString()
            };

            state.set('lastRangeWritten', {
                spreadsheetId: config.spreadsheetId,
                range: config.range,
                cellsUpdated: result.updatedCells,
                writtenAt: resultPayload.writtenAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in writeRange:', error);
            
            if (error.code === 404) {
                return { 
                    error: () => ({ 
                        message: 'Spreadsheet not found',
                        spreadsheetId: config?.spreadsheetId 
                    }) 
                };
            }
            
            return {
                error: () => ({
                    message: 'Failed to write range to spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const writeRange = new WriteRangeNode();