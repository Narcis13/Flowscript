import { google } from 'googleapis';
import type { Credentials } from 'google-auth-library';
import crypto from 'crypto';

export class GoogleOAuth2Helper {
    public oauth2Client;
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    private codeVerifier: string | null = null;

    // Define the scopes needed for Gmail API access
    private scopes = [
       'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/drive',
         'https://www.googleapis.com/auth/drive.file'
     //   'https://www.googleapis.com/auth/gmail.modify',
    //    'https://www.googleapis.com/auth/gmail.send'
    ];

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        if (!clientId || !clientSecret || !redirectUri) {
            throw new Error("Google OAuth2 credentials are not properly configured. Please check your environment variables.");
        }
        
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        
        this.oauth2Client = new google.auth.OAuth2(
            clientId,
            clientSecret,
            redirectUri
        );
        
        console.log('OAuth2 Client initialized with:');
        console.log('- Client ID:', clientId.substring(0, 20) + '...');
        console.log('- Redirect URI:', redirectUri);
    }

    /**
     * Generates a code verifier and challenge for PKCE
     */
    private generatePKCE() {
        // Generate a random code verifier
        this.codeVerifier = crypto.randomBytes(32).toString('base64url');
        
        // Create the code challenge
        const codeChallenge = crypto
            .createHash('sha256')
            .update(this.codeVerifier)
            .digest('base64url');
            
        return {
            codeVerifier: this.codeVerifier,
            codeChallenge,
            codeChallengeMethod: 'S256'
        };
    }

    /**
     * Generates the authorization URL for the user to visit.
     * @param {boolean} usePKCE - Whether to use PKCE flow
     * @returns {string} The authorization URL.
     */
    getAuthUrl(usePKCE: boolean = false): string {
        const authParams: any = {
            access_type: 'offline',
            scope: this.scopes,
           // prompt: 'consent',
          //  state: Date.now().toString()
        };

        if (usePKCE) {
            const pkce = this.generatePKCE();
            authParams.code_challenge = pkce.codeChallenge;
            authParams.code_challenge_method = pkce.codeChallengeMethod;
            console.log('Using PKCE flow with code challenge');
        }

        const authUrl = this.oauth2Client.generateAuthUrl(authParams);
        
        console.log('Generated auth URL with redirect_uri:', this.redirectUri);
        console.log('Using PKCE:', usePKCE);
        
        return authUrl;
    }

    /**
     * Exchanges an authorization code for access and refresh tokens.
     * @param {string} authCode - The authorization code from the callback URL.
     * @param {boolean} usePKCE - Whether this was a PKCE flow
     * @returns {Promise<Credentials>} The tokens.
     */
    async getTokens(authCode: string, usePKCE: boolean = false): Promise<Credentials> {
        try {
            console.log('Attempting to exchange authorization code...');
            console.log('- Code length:', authCode.length);
            console.log('- Code preview:', authCode.substring(0, 20) + '...');
            console.log('- Using redirect URI:', this.redirectUri);
            console.log('- Using PKCE:', usePKCE);
            
            // Prepare the token request
            const tokenRequest: any = {
                code: authCode,
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: this.redirectUri,
                grant_type: 'authorization_code'
            };

            if (usePKCE && this.codeVerifier) {
                tokenRequest.code_verifier = this.codeVerifier;
                console.log('- Code verifier length:', this.codeVerifier.length);
            }

            // Use the oauth2Client but with manual token exchange for better control
            const { tokens } = await this.oauth2Client.getToken(authCode);
            
            console.log('Token exchange successful!');
            console.log('- Has access_token:', !!tokens.access_token);
            console.log('- Has refresh_token:', !!tokens.refresh_token);
            console.log('- Expires at:', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'No expiry');
            
            return tokens;
        } catch (error: any) {
            console.error('Token exchange failed:', error);
            
            // Log additional debugging information
            console.error('Debug info:');
            console.error('- Client ID:', this.clientId.substring(0, 20) + '...');
            console.error('- Redirect URI:', this.redirectUri);
            console.error('- Authorization code:', authCode.substring(0, 20) + '...');
            console.error('- Using PKCE:', usePKCE);
            console.error('- Has code verifier:', !!this.codeVerifier);
            
            if (error.response?.data) {
                console.error('- Error response:', error.response.data);
            }
            
            throw error;
        }
    }

    /**
     * Try both PKCE and non-PKCE flows automatically
     */
    async getTokensWithFallback(authCode: string): Promise<Credentials> {
        try {
            // First try without PKCE (traditional web app flow)
            console.log('Trying traditional OAuth2 flow...');
            return await this.getTokens(authCode, false);
        } catch (error: any) {
            if (error.response?.data?.error_description?.includes('code_verifier')) {
                console.log('Traditional flow failed, but we need PKCE. Please regenerate the auth URL with PKCE enabled.');
                throw new Error('This OAuth client requires PKCE. Please use getAuthUrl(true) and try again.');
            }
            throw error;
        }
    }

    /**
     * Refreshes an access token using a refresh token.
     */
    async refreshAccessToken(refreshToken: string): Promise<Credentials> {
        this.oauth2Client.setCredentials({
            refresh_token: refreshToken
        });

        const { credentials } = await this.oauth2Client.refreshAccessToken();
        return credentials;
    }

    /**
     * Gets the user's profile information from Gmail API.
     */
    async getUserInfo(accessToken: string): Promise<any> {
        this.oauth2Client.setCredentials({
            access_token: accessToken
        });

        const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
        const profile = await gmail.users.getProfile({ userId: 'me' });
        return profile.data;
    }
}