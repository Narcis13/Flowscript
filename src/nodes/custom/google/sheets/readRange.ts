import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class ReadRangeNode implements Node {
    metadata: NodeMetadata = {
        name: 'readRange',
        description: 'Reads data from a range in Google Sheets',
        type: 'action',
        ai_hints: {
            purpose: 'Read data from a specific range in a spreadsheet',
            when_to_use: 'When you need to retrieve data from cells in a spreadsheet',
            expected_edges: ['success', 'error', 'no_data', 'config_error'],
            example_usage: 'Read range like "Sheet1!A1:C10" from a spreadsheet'
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

            // Read the range
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: config.spreadsheetId,
                range: config.range,
                valueRenderOption: config.valueRenderOption || 'UNFORMATTED_VALUE',
                dateTimeRenderOption: config.dateTimeRenderOption || 'FORMATTED_STRING',
                majorDimension: config.majorDimension || 'ROWS'
            });

            const values = response.data.values;

            if (!values || values.length === 0) {
                return { 
                    no_data: () => ({ 
                        spreadsheetId: config.spreadsheetId,
                        range: config.range,
                        message: 'No data found in the specified range'
                    }) 
                };
            }

            // Process data based on options
            let processedData = values;
            
            if (config.firstRowAsHeaders && values.length > 0) {
                const headers = values[0];
                processedData = values.slice(1).map(row => {
                    const obj: any = {};
                    headers.forEach((header: any, index: number) => {
                        obj[header] = row[index] !== undefined ? row[index] : null;
                    });
                    return obj;
                });
            }

            const resultPayload = {
                spreadsheetId: config.spreadsheetId,
                range: response.data.range,
                majorDimension: response.data.majorDimension,
                values: config.firstRowAsHeaders ? processedData : values,
                rowCount: values.length,
                columnCount: values[0]?.length || 0,
                readAt: new Date().toISOString()
            };

            state.set('lastRangeRead', {
                spreadsheetId: config.spreadsheetId,
                range: config.range,
                rowCount: resultPayload.rowCount,
                readAt: resultPayload.readAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in readRange:', error);
            
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
                    message: 'Failed to read range from spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const readRange = new ReadRangeNode();