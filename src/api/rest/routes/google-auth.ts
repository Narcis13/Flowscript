import { Hono } from 'hono';
import { GoogleOAuth2Helper } from '../../../lib/google-oauth2';
import { TokenStorage } from '../../../lib/token-storage';
import type { Credentials } from 'google-auth-library';

export function createGoogleAuthRoutes(): Hono {
  const googleAuthRoutes = new Hono();

  // Ensure environment variables are set
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    console.warn('Google OAuth environment variables are not set. Google auth routes will not work properly.');
    console.warn('Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your environment.');
  }

  // Initialize token storage
  const tokenStorage = new TokenStorage('tokens.sqlite');

  // Route to start the OAuth flow - with PKCE option
  googleAuthRoutes.get('/google', (c) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      return c.json({ error: 'Google OAuth not configured. Please check server environment variables.' }, 500);
    }

    const oauth2Helper = new GoogleOAuth2Helper(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const usePKCE = c.req.query('pkce') === 'true';
    const authUrl = oauth2Helper.getAuthUrl(usePKCE);
    return c.redirect(authUrl);
  });

  // OAuth callback route - updated to handle both flows
  googleAuthRoutes.get('/google/callback', async (c) => {
    try {
      const code = c.req.query('code');
      const error = c.req.query('error');
      const state = c.req.query('state');

      console.log('Callback received with parameters:');
      console.log('- Code:', code ? code.substring(0, 20) + '...' : 'NOT PROVIDED');
      console.log('- Error:', error || 'NONE');
      console.log('- State:', state || 'NONE');

      if (error) {
        console.error('OAuth error from Google:', error);
        return c.json({ error: `OAuth error: ${error}` }, 400);
      }

      if (!code) {
        console.error('No authorization code provided');
        return c.json({ error: 'Authorization code not provided' }, 400);
      }

      console.log('Environment check:');
      console.log('- GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + '...');
      console.log('- GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);

      // Create a fresh OAuth2 helper instance
      const freshOAuth2Helper = new GoogleOAuth2Helper(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        process.env.GOOGLE_REDIRECT_URI!
      );

      console.log('Attempting to exchange authorization code for tokens...');

      // Try with automatic fallback
      const tokens = await freshOAuth2Helper.getTokensWithFallback(code);

      if (!tokens.access_token) {
        throw new Error('No access token received from Google');
      }

      console.log('Getting user info...');
      const userInfo = await freshOAuth2Helper.getUserInfo(tokens.access_token);

      console.log('Saving tokens to database...');
      tokenStorage.saveOrUpdateTokens(userInfo.emailAddress, tokens);

      console.log("Successfully authenticated user:", userInfo.emailAddress);

      return c.json({
        success: true,
        message: `Authentication successful. Tokens for ${userInfo.emailAddress} stored securely.`,
        debug: {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
        }
      });

    } catch (error: any) {
      console.error('OAuth callback error:', error);

      if (error.response?.data) {
        console.error('Error response status:', error.response.status);
        console.error('Error response data:', error.response.data);
      }

      // Provide helpful error messages
      if (error.message?.includes('code_verifier')) {
        return c.json({
          error: 'This OAuth client requires PKCE flow. Please visit /api/auth/google?pkce=true to start the authentication process.',
          code: 'PKCE_REQUIRED',
          suggestion: 'Try visiting: /api/auth/google?pkce=true'
        }, 400);
      }

      if (error.message?.includes('invalid_grant')) {
        return c.json({
          error: 'Invalid authorization code. Please try the authentication flow again.',
          code: 'INVALID_GRANT',
          suggestion: 'Start over at: /api/auth/google'
        }, 400);
      }

      return c.json({
        error: 'Authentication failed',
        details: error.message,
        type: error.constructor.name
      }, 500);
    }
  });

  // Status route
  googleAuthRoutes.get('/status', (c) => {
    const email = c.req.query('email');
    if (!email) {
      return c.json({ error: 'Email query parameter is required' }, 400);
    }

    const storedTokens = tokenStorage.getTokensForUser(email);

    if (storedTokens) {
      return c.json({
        authenticated: true,
        email: storedTokens.user_email,
        hasRefreshToken: !!storedTokens.refresh_token,
        tokenExpires: storedTokens.expiry_date ? new Date(storedTokens.expiry_date).toISOString() : null
      });
    } else {
      return c.json({ authenticated: false, email });
    }
  });

  // Gmail profile route
  googleAuthRoutes.get('/gmail/profile', async (c) => {
    const email = c.req.query('email');
    if (!email) {
      return c.json({ error: 'Email query parameter is required' }, 400);
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      return c.json({ error: 'Google OAuth not configured' }, 500);
    }

    try {
      const oauth2Helper = new GoogleOAuth2Helper(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      const refreshCallback = async (refreshToken: string): Promise<Credentials> => {
        return await oauth2Helper.refreshAccessToken(refreshToken);
      };

      const accessToken = await tokenStorage.getValidAccessToken(email, refreshCallback);

      if (!accessToken) {
        return c.json({ error: `Could not retrieve a valid token for ${email}. Please re-authenticate.` }, 401);
      }

      const userInfo = await oauth2Helper.getUserInfo(accessToken);

      return c.json({
        message: "Successfully fetched profile using stored token.",
        profile: userInfo,
        token: accessToken
      });

    } catch (error) {
      console.error("Error fetching gmail profile:", error);
      return c.json({ error: "Failed to fetch profile." }, 500);
    }
  });

  return googleAuthRoutes;
}