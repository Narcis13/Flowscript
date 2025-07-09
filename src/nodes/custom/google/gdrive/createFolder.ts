import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class CreateFolderNode implements Node {
    metadata: NodeMetadata = {
        name: 'createFolder',
        description: 'Creates a folder in Google Drive',
        type: 'action',
        ai_hints: {
            purpose: 'Create a new folder in Google Drive',
            when_to_use: 'When you need to create a folder for organizing files',
            expected_edges: ['success', 'error', 'config_error'],
            example_usage: 'Create folder with name and optional parent folder'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            if (!config?.folderName) {
                return { config_error: () => ({ error: "Folder name is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // Prepare folder metadata
            const fileMetadata: any = {
                name: config.folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };

            // Add parent folder if specified
            if (config.parentFolderId) {
                fileMetadata.parents = [config.parentFolderId];
            }

            // Add description if specified
            if (config.description) {
                fileMetadata.description = config.description;
            }

            // Create the folder
            const response = await drive.files.create({
                requestBody: fileMetadata,
                fields: 'id, name, createdTime, webViewLink, parents'
            });

            const folder = response.data;

            const resultPayload = {
                id: folder.id,
                name: folder.name,
                createdTime: folder.createdTime,
                webViewLink: folder.webViewLink,
                parents: folder.parents,
                createdAt: new Date().toISOString()
            };

            state.set('lastFolderCreated', resultPayload);

            return { success: () => resultPayload };

        } catch (error) {
            console.error('Error in createFolder:', error);
            return {
                error: () => ({
                    message: 'Failed to create folder in Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const createFolder = new CreateFolderNode();