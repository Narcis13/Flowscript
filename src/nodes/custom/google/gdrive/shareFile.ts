import { Node, NodeMetadata, SimpleEdgeMap } from '../../../../core/types/node';
import { ExecutionContext } from '../../../../core/types/context';
import { RegisterNode } from '../../../registry';
import { google } from 'googleapis';

@RegisterNode
export class ShareFileNode implements Node {
    metadata: NodeMetadata = {
        name: 'shareFile',
        description: 'Shares a file or folder in Google Drive',
        type: 'action',
        ai_hints: {
            purpose: 'Share a file or folder with specific users or make it public',
            when_to_use: 'When you need to grant access permissions to a file or folder',
            expected_edges: ['success', 'error', 'not_found', 'config_error'],
            example_usage: 'Share file with email addresses, set permission levels'
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

            if (!config?.emailAddress && config?.type !== 'anyone') {
                return { config_error: () => ({ error: "Email address is required unless sharing with 'anyone'" }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // Check if file exists
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

            // Prepare permission
            const permission: any = {
                type: config.type || 'user',
                role: config.role || 'reader'
            };

            if (config.emailAddress && config.type !== 'anyone') {
                permission.emailAddress = config.emailAddress;
            }

            // Create the permission
            const permissionResponse = await drive.permissions.create({
                fileId: config.fileId,
                requestBody: permission,
                fields: 'id, type, role, emailAddress',
                sendNotificationEmail: config.sendNotificationEmail !== false,
                emailMessage: config.emailMessage
            });

            const createdPermission = permissionResponse.data;

            // Get sharing link if requested
            let sharingLink;
            if (config.getSharingLink) {
                const linkResponse = await drive.files.get({
                    fileId: config.fileId,
                    fields: 'webViewLink, webContentLink'
                });
                sharingLink = {
                    webViewLink: linkResponse.data.webViewLink,
                    webContentLink: linkResponse.data.webContentLink
                };
            }

            const resultPayload = {
                fileId: config.fileId,
                fileName: fileMetadata.name,
                permissionId: createdPermission.id,
                type: createdPermission.type,
                role: createdPermission.role,
                emailAddress: createdPermission.emailAddress,
                sharedAt: new Date().toISOString(),
                sharingLink: sharingLink
            };

            state.set('lastFileShared', resultPayload);

            return { success: () => resultPayload };

        } catch (error: any) {
            console.error('Error in shareFile:', error);
            
            if (error.code === 404) {
                return { not_found: () => ({ fileId: config?.fileId }) };
            }
            
            return {
                error: () => ({
                    message: 'Failed to share file in Google Drive',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const shareFile = new ShareFileNode();