import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class ListFilesNode implements Node {
    metadata: NodeMetadata = {
        name: 'listFiles',
        description: 'Lists files and folders from Google Drive',
        type: 'action',
        ai_hints: {
            purpose: 'List files and folders from Google Drive',
            when_to_use: 'When you need to retrieve a list of files or folders',
            expected_edges: ['success', 'error', 'no_results', 'config_error'],
            example_usage: 'List files with optional filters like folder, name pattern, or mime type'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // Build query
            let query = '';
            const queryParts = [];

            // Add folder filter if specified
            if (config?.folderId) {
                queryParts.push(`'${config.folderId}' in parents`);
            }

            // Add name filter if specified
            if (config?.nameContains) {
                queryParts.push(`name contains '${config.nameContains}'`);
            }

            // Add mime type filter if specified
            if (config?.mimeType) {
                queryParts.push(`mimeType = '${config.mimeType}'`);
            }

            // Add custom query if specified
            if (config?.query) {
                queryParts.push(config.query);
            }

            // Exclude trashed files by default
            if (config?.includeTrashed !== true) {
                queryParts.push('trashed = false');
            }

            query = queryParts.join(' and ');

            // List files
            const response = await drive.files.list({
                q: query || undefined,
                pageSize: config?.pageSize || 100,
                pageToken: config?.pageToken,
                fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, iconLink, thumbnailLink, owners, shared)',
                orderBy: config?.orderBy || 'modifiedTime desc',
                spaces: config?.spaces || 'drive'
            });

            const files = response.data.files || [];

            if (files.length === 0) {
                return { 
                    no_results: () => ({ 
                        query: query || 'all files',
                        totalResults: 0 
                    }) 
                };
            }

            const resultPayload = {
                files: files.map(file => ({
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    size: file.size,
                    createdTime: file.createdTime,
                    modifiedTime: file.modifiedTime,
                    parents: file.parents,
                    webViewLink: file.webViewLink,
                    webContentLink: file.webContentLink,
                    iconLink: file.iconLink,
                    thumbnailLink: file.thumbnailLink,
                    owners: file.owners,
                    shared: file.shared,
                    isFolder: file.mimeType === 'application/vnd.google-apps.folder'
                })),
                totalResults: files.length,
                nextPageToken: response.data.nextPageToken
            };

            state.set('lastDriveListAttempt', {
                query: query || 'all files',
                resultsCount: files.length,
                timestamp: new Date().toISOString()
            });

            return { success: () => resultPayload };

        } catch (error) {
            console.error('Error in listFiles:', error);
            return {
                error: () => ({
                    message: 'Failed to list files from Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const listFiles = new ListFilesNode();