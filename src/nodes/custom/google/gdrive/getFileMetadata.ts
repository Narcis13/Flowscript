import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class GetFileMetadataNode implements Node {
    metadata: NodeMetadata = {
        name: 'getFileMetadata',
        description: 'Gets detailed metadata for a file or folder in Google Drive',
        type: 'action',
        ai_hints: {
            purpose: 'Retrieve comprehensive metadata about a file or folder',
            when_to_use: 'When you need detailed information about a file including permissions and capabilities',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Get file metadata including permissions, capabilities, and parent information'
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

            // Define fields to retrieve based on detail level
            let fields = 'id, name, mimeType, size, createdTime, modifiedTime, parents, webViewLink, webContentLink';
            
            if (config.includePermissions) {
                fields += ', permissions(id, type, role, emailAddress, displayName)';
            }
            
            if (config.includeCapabilities) {
                fields += ', capabilities';
            }
            
            if (config.includeProperties) {
                fields += ', properties, appProperties';
            }
            
            if (config.includeExtended) {
                fields += ', description, starred, trashed, explicitlyTrashed, version, originalFilename, fullFileExtension, fileExtension, md5Checksum, sha1Checksum, sha256Checksum, iconLink, thumbnailLink, owners, lastModifyingUser, shared, viewers_canCopyContent, writersCanShare';
            }

            // Get file metadata
            const response = await drive.files.get({
                fileId: config.fileId,
                fields: fields,
                supportsAllDrives: true
            });

            const file = response.data;

            if (!file) {
                return { not_found: () => ({ fileId: config.fileId }) };
            }

            // Get additional metadata if requested
            let additionalData: any = {};
            
            if (config.includeRevisions) {
                try {
                    const revisionsResponse = await drive.revisions.list({
                        fileId: config.fileId,
                        fields: 'revisions(id, modifiedTime, lastModifyingUser)'
                    });
                    additionalData.revisions = revisionsResponse.data.revisions;
                } catch (error) {
                    additionalData.revisions = [];
                }
            }

            if (config.includeComments) {
                try {
                    const commentsResponse = await drive.comments.list({
                        fileId: config.fileId,
                        fields: 'comments(id, content, createdTime, author)'
                    });
                    additionalData.comments = commentsResponse.data.comments;
                } catch (error) {
                    additionalData.comments = [];
                }
            }

            const resultPayload = {
                ...file,
                ...additionalData,
                isFolder: file.mimeType === 'application/vnd.google-apps.folder',
                isGoogleDoc: file.mimeType?.startsWith('application/vnd.google-apps.'),
                retrievedAt: new Date().toISOString()
            };

            state.set('lastFileMetadata', {
                fileId: config.fileId,
                fileName: file.name,
                retrievedAt: resultPayload.retrievedAt
            });

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in getFileMetadata:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ fileId: config?.fileId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to get file metadata from Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const getFileMetadata = new GetFileMetadataNode();