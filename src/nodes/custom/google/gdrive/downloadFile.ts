import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

@RegisterNode
export class DownloadFileNode implements Node {
    metadata: NodeMetadata = {
        name: 'downloadFile',
        description: 'Downloads a file from Google Drive',
        type: 'action',
        ai_hints: {
            purpose: 'Download a file from Google Drive',
            when_to_use: 'When you need to download a file to local system or get its content',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Download file by ID to a local path or get content in memory'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            if (!config?.fileId) {
                return { config_error: () => ({ error: "File ID is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // First get file metadata to check if it exists and get the name
            let fileMetadata;
            try {
                const metadataResponse = await drive.files.get({
                    fileId: config.fileId,
                    fields: 'id, name, mimeType, size'
                });
                fileMetadata = metadataResponse.data;
            } catch (error: any) {
                if (error.code === 404) {
                    return { not_found: () => ({ fileId: config.fileId }) };
                }
                throw error;
            }

            // Handle Google Docs export
            let downloadResponse;
            if (fileMetadata.mimeType?.startsWith('application/vnd.google-apps.')) {
                // Export Google Docs/Sheets/Slides
                const exportMimeType = config.exportMimeType || this.getDefaultExportMimeType(fileMetadata.mimeType);
                
                downloadResponse = await drive.files.export({
                    fileId: config.fileId,
                    mimeType: exportMimeType
                }, { responseType: config.downloadPath ? 'stream' : 'arraybuffer' });
            } else {
                // Download regular files
                downloadResponse = await drive.files.get({
                    fileId: config.fileId,
                    alt: 'media'
                }, { responseType: config.downloadPath ? 'stream' : 'arraybuffer' });
            }

            let resultPayload: any = {
                fileId: config.fileId,
                fileName: fileMetadata.name,
                mimeType: fileMetadata.mimeType,
                size: fileMetadata.size,
                downloadedAt: new Date().toISOString()
            };

            if (config.downloadPath) {
                // Save to file
                const downloadPath = path.isAbsolute(config.downloadPath) 
                    ? config.downloadPath 
                    : path.join(process.cwd(), config.downloadPath);

                // Ensure directory exists
                const dir = path.dirname(downloadPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Write file
                const writer = fs.createWriteStream(downloadPath);
                downloadResponse.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                resultPayload.savedTo = downloadPath;
            } else {
                // Return content
                const content = Buffer.from(downloadResponse.data).toString(config.encoding || 'utf8');
                resultPayload.content = content;
                resultPayload.contentLength = content.length;
            }

            state.set('lastFileDownloaded', {
                fileId: config.fileId,
                fileName: fileMetadata.name,
                downloadedAt: resultPayload.downloadedAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in downloadFile:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ fileId: config?.fileId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to download file from Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }

    private getDefaultExportMimeType(googleMimeType: string): string {
        const exportMap: { [key: string]: string } = {
            'application/vnd.google-apps.document': 'application/pdf',
            'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.google-apps.presentation': 'application/pdf',
            'application/vnd.google-apps.drawing': 'image/png'
        };
        return exportMap[googleMimeType] || 'application/pdf';
    }
}

export const downloadFile = new DownloadFileNode();