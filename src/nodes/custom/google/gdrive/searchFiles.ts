import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class SearchFilesNode implements Node {
    metadata: NodeMetadata = {
        name: 'searchFiles',
        description: 'Searches for files in Google Drive using advanced query syntax',
        type: 'action',
        ai_hints: {
            purpose: 'Search for files using Google Drive query syntax',
            when_to_use: 'When you need to find files based on complex criteria',
            expected_edges: ['success', 'no_results', 'error', 'config_error'],
            example_usage: 'Search with queries like "name contains \'report\' and modifiedTime > \'2023-01-01\'"'
        }
    }

    async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
        const { config, state } = context;
        const accessToken = state.get("google_token");

        try {
            if (!accessToken) {
                return { config_error: () => ({ error: "No Google access token found. Please connect to Google first." }) };
            }

            if (!config?.query) {
                return { config_error: () => ({ error: "Search query is required" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // Search files
            const response = await drive.files.list({
                q: config.query,
                pageSize: config.pageSize || 100,
                pageToken: config.pageToken,
                fields: config.includeDetails 
                    ? 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink, iconLink, thumbnailLink, owners, shared, description)'
                    : 'nextPageToken, files(id, name, mimeType, modifiedTime)',
                orderBy: config.orderBy || 'modifiedTime desc',
                spaces: config.spaces || 'drive',
                includeItemsFromAllDrives: config.includeTeamDrives || false,
                supportsAllDrives: config.includeTeamDrives || false
            });

            const files = response.data.files || [];

            if (files.length === 0) {
                return { 
                    no_results: () => ({ 
                        query: config.query,
                        totalResults: 0 
                    }) 
                };
            }

            const resultPayload = {
                query: config.query,
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
                    description: file.description,
                    isFolder: file.mimeType === 'application/vnd.google-apps.folder'
                })),
                totalResults: files.length,
                nextPageToken: response.data.nextPageToken
            };

            state.set('lastDriveSearch', {
                query: config.query,
                resultsCount: files.length,
                searchedAt: new Date().toISOString()
            });

            return { success: () => resultPayload };

        } catch (error) {
            console.error('Error in searchFiles:', error);
            return {
                error: () => ({
                    message: 'Failed to search files in Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const searchFiles = new SearchFilesNode();