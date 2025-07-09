import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class DeleteFileNode implements Node {
    metadata: NodeMetadata = {
        name: 'deleteFile',
        description: 'Deletes a file or folder from Google Drive',
        type: 'action',
        ai_hints: {
            purpose: 'Delete a file or folder from Google Drive',
            when_to_use: 'When you need to permanently delete a file or folder',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Delete file or folder by ID'
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

            // Get file metadata first to check if it exists
            let fileMetadata;
            try {
                const metadataResponse = await drive.files.get({
                    fileId: config.fileId,
                    fields: 'id, name, mimeType'
                });
                fileMetadata = metadataResponse.data;
            } catch (error: any) {
                if (error.code === 404) {
                    return { not_found: () => ({ fileId: config.fileId }) };
                }
                throw error;
            }

            // Delete the file
            await drive.files.delete({
                fileId: config.fileId
            });

            const resultPayload = {
                fileId: config.fileId,
                fileName: fileMetadata.name,
                mimeType: fileMetadata.mimeType,
                deletedAt: new Date().toISOString(),
                wasFolder: fileMetadata.mimeType === 'application/vnd.google-apps.folder'
            };

            state.set('lastFileDeleted', resultPayload);

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in deleteFile:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ fileId: config?.fileId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to delete file from Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const deleteFile = new DeleteFileNode();