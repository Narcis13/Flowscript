/**
 * @typedef {import('../../types/flow-types.jsdoc.js').NodeDefinition} NodeDefinition
 * @typedef {import('../../types/flow-types.jsdoc.js').InputDefinition} InputDefinition
 * @typedef {import('../../types/flow-types.jsdoc.js').OutputDefinition} OutputDefinition
 * @typedef {import('../../types/flow-types.jsdoc.js').EdgeDefinition} EdgeDefinition
 */

// IMPORTANT: This node requires the 'googleapis' package to be available.
import { google } from 'googleapis';

/**
 * Helper function to find a specific header from the Gmail message payload.
 * @param {Array<{name: string, value: string}>} headers - The array of headers.
 * @param {string} name - The name of the header to find (e.g., 'Subject').
 * @returns {string} The value of the header or an empty string if not found.
 */
const findHeader = (headers, name) => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
};

/** @type {NodeDefinition} */
export default {
    id: "google.gmail.listEmails",
    version: "2.1.0", // Version bump for new functionality
    name: "List Gmail Emails",
    description: "Lists emails from a connected Gmail account. Can optionally fetch full details for each email (sender, subject, date, snippet), which requires additional API calls.",
    categories: ["Google", "Email", "Communication"],
    tags: ["gmail", "email", "list", "search", "details", "google api"],
    inputs: [
        // NEW INPUT to control fetching details
        {
            name: "getFullDetails",
            type: "boolean",
            description: "If true, fetches details (sender, subject, date, snippet) for each email. This is slower as it requires an additional API call per email.",
            required: false,
            defaultValue: false,
            example: true
        },
        {
            name: "query",
            type: "string",
            description: "Gmail search query string.",
            required: false,
            example: "is:important"
        },
        {
            name: "labelIds",
            type: "array",
            itemType: "string",
            description: "Array of label IDs to filter by.",
            required: false,
            example: ["INBOX"]
        },
        {
            name: "maxResults",
            type: "number",
            description: "Maximum number of emails to return.",
            required: false,
            defaultValue: 25, // Reduced default for when details are fetched
            example: 10
        },
        {
            name: "pageToken",
            type: "string",
            description: "Token for retrieving the next page of results.",
            required: false
        },
        {
            name: "includeSpamTrash",
            type: "boolean",
            description: "Whether to include messages from SPAM and TRASH.",
            required: false,
            defaultValue: false
        },
        {
            name: "userId",
            type: "string",
            description: "The user's email address or 'me'.",
            required: false,
            defaultValue: "me"
        }
    ],
    outputs: [
        {
            name: "emails",
            type: "array",
            description: "An array of email objects. If getFullDetails is true, each object will be enriched with sender, subject, date, and snippet.",
            example: [{
                id: "19753c6887fd93c1",
                threadId: "19753c6887fd93c1",
                from: "Example Sender <sender@example.com>",
                subject: "Important Update",
                date: "Fri, 26 Jul 2024 10:00:00 -0700",
                snippet: "This is a snippet of the email body..."
            }]
        },
        {
            name: "nextPageToken",
            type: "string",
            description: "A token for retrieving the next page of results.",
        },
        {
            name: "resultSizeEstimate",
            type: "number",
            description: "The estimated total number of results.",
        }
    ],
    edges: [
        { name: "success", description: "Emails listed successfully." },
        { name: "no_results", description: "No emails found." },
        { name: "auth_error", description: "Authentication failed." },
        { name: "api_error", description: "An error occurred calling the Gmail API." },
        { name: "config_error", description: "Configuration error (e.g., 'gmail_token' missing)." }
    ],
    implementation: async function(params = {}) {
        const nodeStateKey = `${this.self.id}.lastRun`;

        try {
            const accessToken = this.state.get("google_token");
            const profile = this.state.get("gmail_profile");

            if (!accessToken) {
                const errorDetails = "Required 'gmail_token' not found in state. Run 'google.gmail.connect' first.";
                this.state.set(nodeStateKey, { error: errorDetails });
                return { config_error: () => ({ error: "Configuration Error", details: errorDetails }) };
            }

            const oauth2Client = new google.auth.OAuth2();
            oauth2Client.setCredentials({ access_token: accessToken });
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

            const requestParams = {
                userId: params.userId || profile?.emailAddress || "me",
                q: params.query,
                labelIds: params.labelIds,
                maxResults: params.maxResults || 25,
                pageToken: params.pageToken,
                includeSpamTrash: params.includeSpamTrash || false,
            };
            Object.keys(requestParams).forEach(key => requestParams[key] === undefined && delete requestParams[key]);

            const listResponse = await gmail.users.messages.list(requestParams);
            const messageStubs = listResponse.data.messages || [];

            if (messageStubs.length === 0) {
                console.log(`[${this.self.id}] No emails found for query.`);
                return { no_results: () => ({ emails: [], nextPageToken: null, resultSizeEstimate: 0 }) };
            }

            let finalEmails = messageStubs;

            // --- NEW LOGIC TO GET FULL DETAILS ---
            if (params.getFullDetails) {
                console.log(`[${this.self.id}] getFullDetails is true. Fetching details for ${messageStubs.length} emails.`);

                const detailPromises = messageStubs.map(stub =>
                    gmail.users.messages.get({
                        userId: requestParams.userId,
                        id: stub.id,
                        // Optimization: 'metadata' is faster than 'full'
                        format: 'metadata',
                        // Optimization: Specify only needed headers
                        metadataHeaders: ['From', 'Subject', 'Date'],
                    })
                );

                // Await all 'get' requests concurrently for performance
                const detailedResponses = await Promise.all(detailPromises);

                finalEmails = detailedResponses.map(res => {
                    const message = res.data;
                    const headers = message.payload.headers;
                    return {
                        id: message.id,
                        threadId: message.threadId,
                        from: findHeader(headers, 'From'),
                        subject: findHeader(headers, 'Subject'),
                        date: findHeader(headers, 'Date'),
                        snippet: message.snippet,
                    };
                });
            }
            // --- END OF NEW LOGIC ---

            const resultPayload = {
                emails: finalEmails,
                nextPageToken: listResponse.data.nextPageToken || null,
                resultSizeEstimate: listResponse.data.resultSizeEstimate || 0,
            };

            this.state.set(nodeStateKey, { status: 'success', resultsCount: finalEmails.length });
            console.log(`[${this.self.id}] Successfully processed ${finalEmails.length} emails.`);
            console.log(finalEmails[0])
            return { success: () => resultPayload };

        } catch (error) {
            const errorCode = error.code || error.response?.status;
            const errorMessage = error.message || "An unknown error occurred.";
            console.error(`[${this.self.id}] Error. Code: ${errorCode}. Message: ${errorMessage}`);
            this.state.set(nodeStateKey, { status: 'error', error: { code: errorCode, message: errorMessage } });

            if (errorCode === 401 || errorCode === 403) {
                return { auth_error: () => ({ error: "Authentication Error", details: `Token is likely invalid. API returned ${errorCode}.` }) };
            }
            return { api_error: () => ({ error: "Gmail API Error", details: errorMessage, code: errorCode }) };
        }
    },
    aiPromptHints: {
        toolName: "google_gmail_list_emails_with_details",
        summary: "Searches and lists emails from a connected Gmail account, with an option to fetch full details like sender, subject, and date.",
        useCase: "Use this after connecting to Gmail to find emails. Set `getFullDetails` to true when you need to read the subject or see who an email is from, for example, to decide if it needs a reply. Leave it false for quick counts or simple ID lists.",
        expectedInputFormat: "Reads auth from state. Optional inputs: `getFullDetails` (boolean, defaults to false), `query` (string), `labelIds` (array), `maxResults` (number).",
        outputDescription: "Returns a list of emails. If `getFullDetails` is true, each email object includes `id`, `threadId`, `from`, `subject`, `date`, and `snippet`. Otherwise, it only includes `id` and `threadId`."
    }
};