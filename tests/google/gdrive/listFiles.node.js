/** @type {import('../../types/flow-types.jsdoc.js').NodeDefinition} */

// This node requires the 'googleapis' package.
import { google } from 'googleapis';

export default {
    id: "google.drive.listFiles",
    version: "1.0.0",
    name: "List Google Drive Files",
    description: "Lists or searches for files in a connected Google Drive account. Uses the standard Google Drive query language.",
    categories: ["Google", "Storage", "File Management"],
    tags: ["drive", "google api", "files", "list", "search"],
    inputs: [
        {
            name: "query",
            type: "string",
            description: "Google Drive search query string (e.g., \"mimeType='image/jpeg'\" or \"name contains 'report'\").",
            required: false,
            example: "trashed = false"
        },
        {
            name: "maxResults",
            type: "number",
            description: "Maximum number of files to return.",
            required: false,
            defaultValue: 100,
            example: 50
        },
        {
            name: "pageToken",
            type: "string",
            description: "Token for retrieving the next page of results.",
            required: false
        }
    ],
    outputs: [
        {
            name: "files",
            type: "array",
            description: "An array of file resource objects.",
            example: [{
                "kind": "drive#file",
                "id": "1a2b3c4d5e6f...",
                "name": "My Document.gdoc",
                "mimeType": "application/vnd.google-apps.document"
            }]
        },
        {
            name: "nextPageToken",
            type: "string",
            description: "A token for retrieving the next page of results.",
        }
    ],
    edges: [
        { name: "success", description: "Files listed successfully." },
        { name: "no_results", description: "No files found." },
        { name: "auth_error", description: "Authentication failed." },
        { name: "api_error", description: "An error occurred calling the Drive API." },
        { name: "config_error", description: "Configuration error (e.g., token missing from state)." }
    ],
    implementation: async function(params = {}) {
        try {
            // Note: We read from 'gmail_token' as it's set by the existing connect node.
            // For clarity, you could rename the state key to 'google_token' in the connect node.
            const accessToken = this.state.get("google_token");

            if (!accessToken) {
                const errorDetails = "Required 'gmail_token' not found in state. Run 'google.gmail.connect' first.";
                return { config_error: () => ({ error: "Configuration Error", details: errorDetails }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            const requestParams = {
                q: params.query,
                pageSize: params.maxResults || 100,
                pageToken: params.pageToken,
                // Important for performance: only request the fields you need!
                fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, parents)',
            };
            Object.keys(requestParams).forEach(key => requestParams[key] === undefined && delete requestParams[key]);

            const listResponse = await drive.files.list(requestParams);
            const files = listResponse.data.files || [];

            if (files.length === 0) {
                return { no_results: () => ({ files: [], nextPageToken: null }) };
            }

            const resultPayload = {
                files: files,
                nextPageToken: listResponse.data.nextPageToken || null,
            };
            console.log(`[${this.self.id}] Successfully listed ${files.length} files.`);
            return { success: () => resultPayload };

        } catch (error) {
            const errorCode = error.code || error.response?.status;
            const errorMessage = error.message || "An unknown error occurred.";
            console.error(`[${this.self.id}] Error. Code: ${errorCode}. Message: ${errorMessage}`);
            
            if (errorCode === 401 || errorCode === 403) {
                return { auth_error: () => ({ error: "Authentication Error", details: `Token is likely invalid. API returned ${errorCode}.` }) };
            }
            return { api_error: () => ({ error: "Drive API Error", details: errorMessage, code: errorCode }) };
        }
    },
    aiPromptHints: {
        toolName: "google_drive_list_files",
        summary: "Searches for and lists files and folders in the user's Google Drive.",
        useCase: "Use this tool to find a file's ID before you try to download or read it. You can search by name, file type, or folder. For example, to find a report, you could set the 'query' to \"name contains 'Report'\". If you don't provide a query, it lists recent files.",
        expectedInputFormat: "The tool uses the authentication token from the state, so you must connect first. The main input is 'query', which is a string following the Google Drive API search syntax. 'maxResults' is an optional number to limit the result count.",
        outputDescription: "On the 'success' edge, it returns an object containing a 'files' array. Each item in the array is a file with an 'id', 'name', and 'mimeType'. You MUST use the 'id' from this output for other tools like 'downloadFile'. If no files are found, it follows the 'no_results' edge."
    }
};