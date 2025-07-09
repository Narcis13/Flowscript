import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class AppendRowsNode implements Node {
    metadata: NodeMetadata = {
        name: 'appendRows',
        description: 'Appends rows to the end of a sheet in Google Sheets',
        type: 'action',
        ai_hints: {
            purpose: 'Append new rows to the end of a spreadsheet',
            when_to_use: 'When you need to add new data rows without overwriting existing data',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Append rows to a sheet with automatic range detection'
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
                const keys = Object.keys(config.values[0]);
                values = config.values.map((obj: any) => 
                    keys.map(key => obj[key])
                );
            }

            // Determine the range
            // If sheet name is provided, use it, otherwise default to first sheet
            const range = config.sheetName ? config.sheetName : 'Sheet1';

            // Append the data
            const response = await sheets.spreadsheets.values.append({
                spreadsheetId: config.spreadsheetId,
                range: range,
                valueInputOption: config.valueInputOption || 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: {
                    values: values,
                    majorDimension: config.majorDimension || 'ROWS'
                }
            });

            const result = response.data;

            const resultPayload = {
                spreadsheetId: result.spreadsheetId,
                tableRange: result.tableRange,
                updatedRange: result.updates?.updatedRange,
                updatedRows: result.updates?.updatedRows,
                updatedColumns: result.updates?.updatedColumns,
                updatedCells: result.updates?.updatedCells,
                appendedAt: new Date().toISOString()
            };

            state.set('lastRowsAppended', {
                spreadsheetId: config.spreadsheetId,
                rowsAppended: values.length,
                appendedAt: resultPayload.appendedAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in appendRows:', error);
            
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
                    message: 'Failed to append rows to spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const appendRows = new AppendRowsNode();