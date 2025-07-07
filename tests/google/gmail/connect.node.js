/** @type {import('../../types/flow-types.jsdoc.js').NodeDefinition} */
export default {
    id: "google.gmail.connect",
    version: "1.0.0",
    name: "Connect to Gmail Account",
    description: "Connects to a specified Gmail account by retrieving its profile and an authentication token from the auth service. It then stores the profile and token in the flow's state for use by subsequent nodes.",
    categories: ["Integration", "Google", "Email"],
    tags: ["gmail", "google", "email", "connect", "auth", "api", "token"],
    inputs: [
        {
            name: "email",
            type: "string",
            description: "The Gmail address of the account to connect with.",
            required: true,
            example: "smupitesti2001@gmail.com"
        }
    ],
    outputs: [
        {
            name: "connectionDetails",
            type: "object",
            description: "The full response from the profile endpoint, including a confirmation message, the user's profile, and the token.",
            example: {
                "message": "Successfully fetched profile using stored token.",
                "profile": {
                    "emailAddress": "smupitesti2001@gmail.com",
                    "messagesTotal": 17674,
                    "threadsTotal": 16655,
                    "historyId": "3085388"
                },
                "token": "ya29.a...."
            }
        }
    ],
    edges: [
        { name: "success", description: "Successfully connected and retrieved the profile and token." },
        { name: "error", description: "An error occurred, such as an API failure, invalid response, or missing input." }
    ],
    implementation: async function(params) {
        const { email } = params;

        if (!email) {
            const errorMsg = "Input Error: The 'email' parameter is required.";
            console.error(`[${this.self.id}] ${errorMsg}`);
            return {
                error: () => ({
                    message: errorMsg
                })
            };
        }

        const apiUrl = `http://localhost:3013/auth/gmail/profile?email=${encodeURIComponent(email)}`;
        this.state.set('lastGmailConnectAttempt', { email, apiUrl, timestamp: Date.now() });

        try {
            console.log(`[${this.self.id}] Attempting to connect to Gmail account: ${email}`);
            // In a Node.js environment, global fetch is available in recent versions.
            // Ensure the execution environment supports it.
            const response = await fetch(apiUrl);

            if (!response.ok) {
                let errorDetails = `API returned status ${response.status}: ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    errorDetails = errorBody.message || JSON.stringify(errorBody);
                } catch (e) {
                    // Ignore if the error response body isn't valid JSON.
                }

                console.error(`[${this.self.id}] API Error for ${email}:`, errorDetails);
                this.state.set('lastGmailConnectError', { email, error: errorDetails, timestamp: Date.now() });
                return {
                    error: () => ({
                        message: "Failed to fetch Gmail profile from the authentication service.",
                        details: errorDetails,
                        status: response.status
                    })
                };
            }

            const data = await response.json();

            // Validate the structure of the successful response as per the task requirements.
            if (!data.profile || !data.token) {
                const errorMessage = "API response is missing required 'profile' or 'token' fields.";
                console.error(`[${this.self.id}] Invalid API response for ${email}:`, errorMessage, data);
                this.state.set('lastGmailConnectError', { email, error: errorMessage, response: data, timestamp: Date.now() });
                return {
                    error: () => ({
                        message: "Invalid API response structure.",
                        details: data
                    })
                };
            }

            // Core task: set the profile and token into the state at the specified paths.
            this.state.set("gmail_profile", data.profile);
            this.state.set("google_token", data.token);

            console.log(`[${this.self.id}] Successfully connected. Profile for ${data.profile.emailAddress} and token have been stored in state.`);

            // Return a success edge with the full response data for use by the next node.
            return {
                success: () => data
            };

        } catch (error) {
            // This block catches network errors (e.g., server down) or other unexpected exceptions.
            console.error(`[${this.self.id}] A network or unexpected error occurred for ${email}:`, error);
            this.state.set('lastGmailConnectError', { email, error: error.message, timestamp: Date.now() });
            return {
                error: () => ({
                    message: "An unexpected error occurred during the API call.",
                    details: error.message
                })
            };
        }
    },
    aiPromptHints: {
        toolName: "connect_gmail_account",
        summary: "Connects to a specific Gmail account to retrieve its profile and a temporary authentication token.",
        useCase: "Use this as the first step before performing any action on a user's Gmail account, such as reading or sending emails. This node prepares the necessary credentials and profile information in the flow's state.",
        expectedInputFormat: "Provide the 'email' address of the Gmail account you want to connect to as a string.",
        outputDescription: "On success, returns a 'success' edge and makes the connection details available to the next node. Most importantly, it stores the account profile at the state path 'gmail_profile' and the authentication token at 'gmail_token' for other tools to use."
    }
};