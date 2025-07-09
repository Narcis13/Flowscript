import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class CreateSpreadsheetNode implements Node {
    metadata: NodeMetadata = {
        name: 'createSpreadsheet',
        description: 'Creates a new Google Sheets spreadsheet',
        type: 'action',
        ai_hints: {
            purpose: 'Create a new spreadsheet in Google Sheets',
            when_to_use: 'When you need to create a new spreadsheet with optional initial data',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Create spreadsheet with title and optional initial sheets'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            if (!config?.title) {
                return { config_error: () => ({ error: "Spreadsheet title is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Prepare spreadsheet properties
            const spreadsheetBody: any = {
                properties: {
                    title: config.title
                }
            };

            // Add initial sheets if specified
            if (config.sheets && Array.isArray(config.sheets)) {
                spreadsheetBody.sheets = config.sheets.map((sheetName: string, index: number) => ({
                    properties: {
                        sheetId: index,
                        title: sheetName,
                        index: index
                    }
                }));
            }

            // Create the spreadsheet
            const response = await sheets.spreadsheets.create({
                requestBody: spreadsheetBody,
                fields: 'spreadsheetId,spreadsheetUrl,properties.title,sheets.properties'
            });

            const spreadsheet = response.data;

            // If initial data is provided, write it to the first sheet
            if (config.initialData && Array.isArray(config.initialData)) {
                const range = config.sheetName ? `${config.sheetName}!A1` : 'A1';
                
                await sheets.spreadsheets.values.update({
                    spreadsheetId: spreadsheet.spreadsheetId!,
                    range: range,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: config.initialData
                    }
                });
            }

            const resultPayload = {
                spreadsheetId: spreadsheet.spreadsheetId,
                spreadsheetUrl: spreadsheet.spreadsheetUrl,
                title: spreadsheet.properties?.title,
                sheets: spreadsheet.sheets?.map(sheet => ({
                    sheetId: sheet.properties?.sheetId,
                    title: sheet.properties?.title,
                    index: sheet.properties?.index
                })),
                createdAt: new Date().toISOString()
            };

            state.set('lastSpreadsheetCreated', resultPayload);

            return { success: () => resultPayload };

        } catch (error) {
            console.error('Error in createSpreadsheet:', error);
            return {
                error: () => ({
                    message: 'Failed to create spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const createSpreadsheet = new CreateSpreadsheetNode();