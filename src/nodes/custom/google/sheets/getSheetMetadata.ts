import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class GetSheetMetadataNode implements Node {
    metadata: NodeMetadata = {
        name: 'getSheetMetadata',
        description: 'Gets metadata about a Google Sheets spreadsheet',
        type: 'action',
        ai_hints: {
            purpose: 'Retrieve metadata about a spreadsheet including sheets, properties, and named ranges',
            when_to_use: 'When you need information about spreadsheet structure and properties',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Get spreadsheet metadata including all sheets information'
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

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

            // Define fields to retrieve
            let fields = 'spreadsheetId,properties.title,properties.locale,properties.timeZone,spreadsheetUrl';
            
            if (config.includeSheets !== false) {
                fields += ',sheets.properties,sheets.protectedRanges';
            }
            
            if (config.includeNamedRanges) {
                fields += ',namedRanges';
            }
            
            if (config.includeDeveloperMetadata) {
                fields += ',developerMetadata';
            }

            // Get spreadsheet metadata
            const response = await sheets.spreadsheets.get({
                spreadsheetId: config.spreadsheetId,
                fields: fields,
                includeGridData: false
            });

            const spreadsheet = response.data;

            if (!spreadsheet) {
                return { not_found: () => ({ spreadsheetId: config.spreadsheetId }) };
            }

            // Process sheets information
            const sheetsInfo = spreadsheet.sheets?.map(sheet => ({
                sheetId: sheet.properties?.sheetId,
                title: sheet.properties?.title,
                index: sheet.properties?.index,
                sheetType: sheet.properties?.sheetType,
                gridProperties: sheet.properties?.gridProperties,
                hidden: sheet.properties?.hidden,
                tabColor: sheet.properties?.tabColor,
                rightToLeft: sheet.properties?.rightToLeft,
                protectedRanges: sheet.protectedRanges
            }));

            const resultPayload = {
                spreadsheetId: spreadsheet.spreadsheetId,
                spreadsheetUrl: spreadsheet.spreadsheetUrl,
                properties: {
                    title: spreadsheet.properties?.title,
                    locale: spreadsheet.properties?.locale,
                    timeZone: spreadsheet.properties?.timeZone,
                    autoRecalc: spreadsheet.properties?.autoRecalc,
                    defaultFormat: spreadsheet.properties?.defaultFormat
                },
                sheets: sheetsInfo,
                sheetCount: sheetsInfo?.length || 0,
                namedRanges: spreadsheet.namedRanges,
                developerMetadata: spreadsheet.developerMetadata,
                retrievedAt: new Date().toISOString()
            };

            // Calculate total cells if requested
            if (config.calculateTotalCells && sheetsInfo) {
                let totalCells = 0;
                sheetsInfo.forEach(sheet => {
                    const rows = sheet.gridProperties?.rowCount || 0;
                    const cols = sheet.gridProperties?.columnCount || 0;
                    totalCells += rows * cols;
                });
                resultPayload.totalCells = totalCells;
            }

            state.set('lastSpreadsheetMetadata', {
                spreadsheetId: config.spreadsheetId,
                title: resultPayload.properties.title,
                sheetCount: resultPayload.sheetCount,
                retrievedAt: resultPayload.retrievedAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in getSheetMetadata:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ spreadsheetId: config?.spreadsheetId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to get spreadsheet metadata',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const getSheetMetadata = new GetSheetMetadataNode();