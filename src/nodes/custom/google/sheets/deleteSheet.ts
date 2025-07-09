import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class DeleteSheetNode implements Node {
    metadata: NodeMetadata = {
        name: 'deleteSheet',
        description: 'Deletes a sheet from a Google Sheets spreadsheet',
        type: 'action',
        ai_hints: {
            purpose: 'Delete a sheet (tab) from a spreadsheet',
            when_to_use: 'When you need to remove a sheet from a spreadsheet',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Delete a sheet by ID or title'
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

            if (!config?.sheetId && !config?.sheetTitle) {
                return { config_error: () => ({ error: "Either sheetId or sheetTitle is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            let sheetId = config.sheetId;

            // If sheet title is provided, we need to find the sheet ID
            if (!sheetId && config.sheetTitle) {
                const metadataResponse = await sheets.spreadsheets.get({
                    spreadsheetId: config.spreadsheetId,
                    fields: 'sheets.properties'
                });

                const sheetProperties = metadataResponse.data.sheets?.find(
                    sheet => sheet.properties?.title === config.sheetTitle
                )?.properties;

                if (!sheetProperties) {
                    return { 
                        not_found: () => ({ 
                            message: 'Sheet not found',
                            sheetTitle: config.sheetTitle 
                        }) 
                    };
                }

                sheetId = sheetProperties.sheetId;
            }

            // Check if trying to delete the last sheet
            const metadataResponse = await sheets.spreadsheets.get({
                spreadsheetId: config.spreadsheetId,
                fields: 'sheets'
            });

            if (metadataResponse.data.sheets?.length === 1) {
                return { 
                    error: () => ({ 
                        message: 'Cannot delete the last sheet in a spreadsheet',
                        hint: 'A spreadsheet must have at least one sheet'
                    }) 
                };
            }

            // Delete the sheet
            const response = await sheets.spreadsheets.batchUpdate({
                spreadsheetId: config.spreadsheetId,
                requestBody: {
                    requests: [{
                        deleteSheet: {
                            sheetId: sheetId
                        }
                    }]
                }
            });

            const resultPayload = {
                spreadsheetId: config.spreadsheetId,
                deletedSheetId: sheetId,
                deletedSheetTitle: config.sheetTitle,
                deletedAt: new Date().toISOString()
            };

            state.set('lastSheetDeleted', resultPayload);

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in deleteSheet:', error);
            
            if (error.code === 404) {
                return { 
                    error: () => ({ 
                        message: 'Spreadsheet not found',
                        spreadsheetId: config?.spreadsheetId 
                    }) 
                };
            }
            
            if (error.message?.includes('Invalid requests[0].deleteSheet')) {
                return { 
                    not_found: () => ({ 
                        message: 'Sheet not found',
                        sheetId: config?.sheetId 
                    }) 
                };
            }
            
            return {
                error: () => ({
                    message: 'Failed to delete sheet from spreadsheet',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const deleteSheet = new DeleteSheetNode();