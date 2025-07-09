import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class AddSheetNode implements Node {
    metadata: NodeMetadata = {
        name: 'addSheet',
        description: 'Adds a new sheet to a Google Sheets spreadsheet',
        type: 'action',
        ai_hints: {
            purpose: 'Add a new sheet (tab) to an existing spreadsheet',
            when_to_use: 'When you need to create a new sheet within a spreadsheet',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Add a new sheet with custom name and properties'
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

            if (!config?.title) {
                return { config_error: () => ({ error: "Sheet title is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Prepare sheet properties
            const sheetProperties: any = {
                title: config.title
            };

            if (config.index !== undefined) {
                sheetProperties.index = config.index;
            }

            if (config.gridProperties) {
                sheetProperties.gridProperties = {
                    rowCount: config.gridProperties.rowCount || 1000,
                    columnCount: config.gridProperties.columnCount || 26,
                    frozenRowCount: config.gridProperties.frozenRowCount,
                    frozenColumnCount: config.gridProperties.frozenColumnCount
                };
            }

            if (config.tabColor) {
                sheetProperties.tabColor = config.tabColor;
            }

            // Add the sheet
            const response = await sheets.spreadsheets.batchUpdate({
                spreadsheetId: config.spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: sheetProperties
                        }
                    }]
                }
            });

            const addSheetReply = response.data.replies?.[0]?.addSheet;
            const newSheet = addSheetReply?.properties;

            const resultPayload = {
                spreadsheetId: config.spreadsheetId,
                sheetId: newSheet?.sheetId,
                title: newSheet?.title,
                index: newSheet?.index,
                gridProperties: newSheet?.gridProperties,
                tabColor: newSheet?.tabColor,
                addedAt: new Date().toISOString()
            };

            state.set('lastSheetAdded', resultPayload);

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in addSheet:', error);
            
            if (error.code === 404) {
                return { 
                    error: () => ({ 
                        message: 'Spreadsheet not found',
                        spreadsheetId: config?.spreadsheetId 
                    }) 
                };
            }
            
            if (error.message?.includes('already exists')) {
                return { 
                    error: () => ({ 
                        message: 'Sheet with this title already exists',
                        title: config?.title,
                        hint: 'Sheet titles must be unique within a spreadsheet'
                    }) 
                };
            }
            
            return {
                error: () => ({
                    message: 'Failed to add sheet to spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const addSheet = new AddSheetNode();