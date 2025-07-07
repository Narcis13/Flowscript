/** @type {import('../../types/flow-types.jsdoc.js').NodeDefinition} */

import { google } from 'googleapis';

export default {
    id: "google.drive.downloadFile",
    version: "1.0.0",
    name: "Download Google Drive File",
    description: "Downloads the content of a specific file from Google Drive and returns it as a Base64 encoded string.",
    categories: ["Google", "Storage", "File Management"],
    tags: ["drive", "google api", "download", "file", "base64"],
    inputs: [
        {
            name: "fileId",
            type: "string",
            description: "The unique ID of the file to download.",
            required: true,
            example: "1a2b3c4d5e6f..."
        }
    ],
    outputs: [
        {
            name: "fileContentBase64",
            type: "string",
            description: "The content of the file, encoded as a Base64 string.",
        },
        {
            name: "fileName",
            type: "string",
            description: "The name of the downloaded file."
        },
        {
            name: "mimeType",
            type: "string",
            description: "The MIME type of the downloaded file."
        }
    ],
    edges: [
        { name: "success", description: "File downloaded successfully." },
        { name: "not_found", description: "The specified file ID was not found." },
        { name: "auth_error", description: "Authentication failed." },
        { name: "api_error", description: "An error occurred calling the Drive API." },
        { name: "config_error", description: "Configuration error (e.g., token missing from state)." }
    ],
    implementation: async function(params) {
        const { fileId } = params;

        if (!fileId) {
            return { config_error: () => ({ error: "Input Error", details: "The 'fileId' parameter is required." }) };
        }

        try {
            const accessToken = this.state.get("google_token");
            if (!accessToken) {
                const errorDetails = "Required 'gmail_token' not found in state. Run 'google.gmail.connect' first.";
                return { config_error: () => ({ error: "Configuration Error", details: errorDetails }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            // First, get file metadata to get the name and mimeType
            const metaResponse = await drive.files.get({
                fileId: fileId,
                fields: 'name, mimeType'
            });

            // Then, download the file content
            const fileResponse = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'arraybuffer' } // Important: get response as raw data
            );

            // Convert ArrayBuffer to Base64 string
            const base64Content = Buffer.from(fileResponse.data).toString('base64');
            
            const resultPayload = {
                fileContentBase64: base64Content,
                fileName: metaResponse.data.name,
                mimeType: metaResponse.data.mimeType
            };

            return { success: () => resultPayload };

        } catch (error) {
            const errorCode = error.code || error.response?.status;
            const errorMessage = error.message || "An unknown error occurred.";
            console.error(`[${this.self.id}] Error. Code: ${errorCode}. Message: ${errorMessage}`);
            
            if (errorCode === 404) {
                 return { not_found: () => ({ error: "File Not Found", details: `File with ID '${fileId}' not found.`, code: 404 }) };
            }
            if (errorCode === 401 || errorCode === 403) {
                return { auth_error: () => ({ error: "Authentication Error", details: `Token is likely invalid. API returned ${errorCode}.` }) };
            }
            return { api_error: () => ({ error: "Drive API Error", details: errorMessage, code: errorCode }) };
        }
    },
    aiPromptHints: {
        toolName: "google_drive_download_file",
        summary: "Downloads a specific file's content from Google Drive given its ID.",
        useCase: "Use this tool after you have found a file's ID using 'google_drive_list_files'. It's essential for reading, summarizing, or analyzing the content of any file. For example, to answer a question about a document, you must first download it with this tool.",
        expectedInputFormat: "This tool requires a 'fileId' which is a string. You must provide the ID of the file you want to download. Authentication is handled automatically from the state.",
        outputDescription: "On success, this tool returns an object containing the file's 'fileName', 'mimeType', and its content encoded in Base64 format as 'fileContentBase64'. You will need a separate tool to decode the Base64 string to read the text. If the file is not found, it follows the 'not_found' edge."
    }
};