import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';
import * as fs from 'fs/promises';
import * as path from 'path';

interface XUploadMediaConfig {
    mediaPath: string;
    mediaType: 'image' | 'video' | 'gif';
    altText?: string;
}

@RegisterNode
export class XUploadMediaNode implements Node {
    metadata: NodeMetadata = {
        name: 'xUploadMedia',
        description: 'Upload media (images, videos, GIFs) to X',
        type: 'action',
        ai_hints: {
            purpose: 'Prepare media for posting',
            when_to_use: 'Before creating posts with media attachments',
            expected_edges: ['media_uploaded', 'file_too_large', 'invalid_format', 'upload_error']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const uploadConfig = config as XUploadMediaConfig;
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType || !bearerToken) {
            return {
                upload_error: () => ({
                    error: 'Not authenticated',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!uploadConfig?.mediaPath) {
            return {
                upload_error: () => ({
                    error: 'Media path is required',
                    details: 'Provide the path to the media file'
                })
            };
        }

        if (!uploadConfig.mediaType) {
            return {
                upload_error: () => ({
                    error: 'Media type is required',
                    details: 'Specify whether the media is an image, video, or gif'
                })
            };
        }

        try {
            // Check if file exists
            const fileStats = await fs.stat(uploadConfig.mediaPath).catch(() => null);
            if (!fileStats) {
                return {
                    upload_error: () => ({
                        error: 'File not found',
                        path: uploadConfig.mediaPath
                    })
                };
            }

            // Check file size limits
            const fileSizeBytes = fileStats.size;
            const fileSizeMB = fileSizeBytes / (1024 * 1024);
            
            let maxSizeMB: number;
            switch (uploadConfig.mediaType) {
                case 'image':
                    maxSizeMB = 5;
                    break;
                case 'gif':
                    maxSizeMB = 15;
                    break;
                case 'video':
                    maxSizeMB = 512;
                    break;
            }

            if (fileSizeMB > maxSizeMB) {
                return {
                    file_too_large: () => ({
                        error: 'File size exceeds limit',
                        fileSize: `${fileSizeMB.toFixed(2)} MB`,
                        maxSize: `${maxSizeMB} MB`,
                        mediaType: uploadConfig.mediaType
                    })
                };
            }

            // Validate file format
            const fileExt = path.extname(uploadConfig.mediaPath).toLowerCase();
            const validFormats: Record<string, string[]> = {
                image: ['.jpg', '.jpeg', '.png', '.webp'],
                gif: ['.gif'],
                video: ['.mp4', '.mov']
            };

            if (!validFormats[uploadConfig.mediaType].includes(fileExt)) {
                return {
                    invalid_format: () => ({
                        error: 'Invalid file format',
                        format: fileExt,
                        validFormats: validFormats[uploadConfig.mediaType],
                        mediaType: uploadConfig.mediaType
                    })
                };
            }

            // Read file
            const fileBuffer = await fs.readFile(uploadConfig.mediaPath);
            
            // Initialize upload
            const initResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    command: 'INIT',
                    total_bytes: fileSizeBytes.toString(),
                    media_type: this.getMimeType(fileExt),
                    media_category: this.getMediaCategory(uploadConfig.mediaType)
                })
            });

            if (!initResponse.ok) {
                const errorData = await initResponse.json();
                return {
                    upload_error: () => ({
                        error: 'Failed to initialize upload',
                        status: initResponse.status,
                        details: errorData
                    })
                };
            }

            const initData = await initResponse.json();
            const mediaId = initData.media_id_string;

            // Upload file chunks (simplified - for production, implement chunking for large files)
            const appendResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                },
                body: this.createFormData({
                    command: 'APPEND',
                    media_id: mediaId,
                    segment_index: '0',
                    media: fileBuffer
                })
            });

            if (!appendResponse.ok) {
                return {
                    upload_error: () => ({
                        error: 'Failed to upload media',
                        status: appendResponse.status
                    })
                };
            }

            // Finalize upload
            const finalizeResponse = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    command: 'FINALIZE',
                    media_id: mediaId
                })
            });

            if (!finalizeResponse.ok) {
                return {
                    upload_error: () => ({
                        error: 'Failed to finalize upload',
                        status: finalizeResponse.status
                    })
                };
            }

            // Add alt text if provided
            if (uploadConfig.altText && uploadConfig.mediaType === 'image') {
                await fetch('https://upload.twitter.com/1.1/media/metadata/create.json', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${bearerToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        media_id: mediaId,
                        alt_text: { text: uploadConfig.altText }
                    })
                });
            }

            const result = {
                mediaId,
                mediaType: uploadConfig.mediaType,
                fileName: path.basename(uploadConfig.mediaPath),
                fileSize: `${fileSizeMB.toFixed(2)} MB`,
                uploadedAt: new Date().toISOString()
            };

            // Store media ID in state for use with xCreatePost
            const uploadedMedia = state.get('x_uploaded_media') || [];
            uploadedMedia.push(result);
            state.set('x_uploaded_media', uploadedMedia);

            return {
                media_uploaded: () => result
            };

        } catch (error) {
            console.error('Error in xUploadMedia:', error);
            return {
                upload_error: () => ({
                    error: 'Failed to upload media',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }

    private getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }

    private getMediaCategory(mediaType: string): string {
        switch (mediaType) {
            case 'image':
                return 'tweet_image';
            case 'gif':
                return 'tweet_gif';
            case 'video':
                return 'tweet_video';
            default:
                return 'tweet_image';
        }
    }

    private createFormData(data: any): FormData {
        const formData = new FormData();
        for (const key in data) {
            formData.append(key, data[key]);
        }
        return formData;
    }
}

export const xUploadMedia = new XUploadMediaNode();