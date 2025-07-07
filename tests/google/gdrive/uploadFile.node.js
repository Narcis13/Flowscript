/** @type {import('../../types/flow-types.jsdoc.js').NodeDefinition} */

import { google } from 'googleapis';

export default {
    id: "google.drive.uploadFile",
    version: "1.0.0",
    name: "Upload File to Google Drive",
    description: "Creates a new file in Google Drive with the provided text content and a specified name. Can optionally place the file in a specific folder.",
    categories: ["Google", "Storage", "File Management"],
    tags: ["drive", "upload", "create", "file", "write", "google api"],
    inputs: [
        {
            name: "fileName",
            type: "string",
            description: "The name for the new file (e.g., 'summary.txt').",
            required: true,
            example: "My AI-Generated Report.txt"
        },
        {
            name: "fileContent",
            type: "string",
            description: "The text content to be written into the new file.",
            required: true,
            example: "This is the summary of our meeting..."
        },
        {
            name: "parentId",
            type: "string",
            description: "Optional ID of the folder to create the file in. If omitted, the file will be created in the root 'My Drive' folder.",
            required: false,
            example: "1a2b3c_folder_id_..."
        },
        {
            name: "mimeType",
            type: "string",
            description: "The MIME type of the file being created.",
            required: false,
            defaultValue: "text/plain",
            example: "text/markdown"
        }
    ],
    outputs: [
        {
            name: "file",
            type: "object",
            description: "The full file resource object for the newly created file, including its ID.",
            example: {
                "id": "1a2b3c_new_file_id_...",
                "name": "My AI-Generated Report.txt",
                "mimeType": "text/plain",
                "parents": ["1a2b3c_folder_id_..."]
            }
        }
    ],
    edges: [
        { name: "success", description: "File created and uploaded successfully." },
        { name: "auth_error", description: "Authentication failed. The token may be invalid or lack write permissions." },
        { name: "api_error", description: "An error occurred calling the Drive API." },
        { name: "config_error", description: "Configuration error (e.g., token or required inputs missing)." }
    ],
    implementation: async function(params) {
        const { fileName, fileContent, parentId, mimeType } = params;

        if (!fileName || typeof fileContent === 'undefined') {
            return { config_error: () => ({ error: "Input Error", details: "The 'fileName' and 'fileContent' parameters are required." }) };
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

            const fileMetadata = {
                name: fileName,
                // The 'parents' property must be an array of folder IDs
                ...(parentId && { parents: [parentId] })
            };

            const media = {
                mimeType: mimeType || 'text/plain',
                body: fileContent,
            };

            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                // Request the fields you want in the response
                fields: 'id, name, mimeType, parents',
            });
            
            console.log(`[${this.self.id}] Successfully created file '${response.data.name}' with ID: ${response.data.id}`);
            return { success: () => response.data };

        } catch (error) {
            const errorCode = error.code || error.response?.status;
            const errorMessage = error.message || "An unknown error occurred.";
            console.error(`[${this.self.id}] Error creating file. Code: ${errorCode}. Message: ${errorMessage}`);
            
            if (errorCode === 401 || errorCode === 403) {
                return { auth_error: () => ({ error: "Authentication Error", details: `Token is likely invalid or lacks write permissions. API returned ${errorCode}.` }) };
            }
            return { api_error: () => ({ error: "Drive API Error", details: errorMessage, code: errorCode }) };
        }
    },
    aiPromptHints: {
        toolName: "google_drive_upload_file",
        summary: "Creates a new file in Google Drive with specified text content and a given name.",
        useCase: "Use this to save information, such as generated reports, summaries, or drafts, as new files in Google Drive. For example, after summarizing a long document, you can use this tool to save the summary to a file named 'Summary of Document.txt'.",
        expectedInputFormat: "You must provide a 'fileName' (string) for the new file and the 'fileContent' (string) to be saved. Optionally, you can provide a 'parentId' (the ID of a folder) to place the file inside a specific folder.",
        outputDescription: "On success, it returns the full file object for the newly created file, which includes its unique 'id', 'name', and 'mimeType'. This ID can then be used by other tools to share or manage the file."
    }
};