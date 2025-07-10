import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

@RegisterNode
export class XRefreshTokenNode implements Node {
    metadata: NodeMetadata = {
        name: 'xRefreshToken',
        description: 'Refresh expired OAuth 2.0 access token',
        type: 'action',
        ai_hints: {
            purpose: 'Token refresh for continuous API access',
            when_to_use: 'When access token expires during long-running workflows',
            expected_edges: ['token_refreshed', 'refresh_failed', 'invalid_refresh_token']
        }
    };

    async execute({ state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const authType = state.get('x_auth_type');
        
        if (authType !== 'oauth2') {
            return {
                refresh_failed: () => ({
                    error: 'Token refresh is only available for OAuth 2.0 authentication',
                    currentAuthType: authType
                })
            };
        }

        const apiKey = state.get('x_api_key');
        const apiSecret = state.get('x_api_secret');
        const refreshToken = state.get('x_refresh_token');

        if (!apiKey || !apiSecret) {
            return {
                refresh_failed: () => ({
                    error: 'API credentials not found in state',
                    details: 'Please authenticate first using xAuth'
                })
            };
        }

        if (!refreshToken) {
            return {
                invalid_refresh_token: () => ({
                    error: 'No refresh token available',
                    details: 'OAuth 2.0 refresh token not found in state'
                })
            };
        }

        try {
            // Create basic auth header
            const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
            
            // Make refresh token request
            const response = await fetch('https://api.twitter.com/2/oauth2/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 400 || response.status === 401) {
                    return {
                        invalid_refresh_token: () => ({
                            error: 'Invalid or expired refresh token',
                            status: response.status,
                            details: errorData
                        })
                    };
                }

                return {
                    refresh_failed: () => ({
                        error: 'Failed to refresh token',
                        status: response.status,
                        statusText: response.statusText,
                        details: errorData
                    })
                };
            }

            const tokenData = await response.json();

            // Update tokens in state
            state.set('x_access_token', tokenData.access_token);
            if (tokenData.refresh_token) {
                state.set('x_refresh_token', tokenData.refresh_token);
            }
            state.set('x_token_expires_at', Date.now() + (tokenData.expires_in * 1000));
            state.set('x_auth_status', 'authenticated');
            state.set('x_last_token_refresh', Date.now());

            return {
                token_refreshed: () => ({
                    accessToken: tokenData.access_token,
                    expiresIn: tokenData.expires_in,
                    refreshedAt: new Date().toISOString(),
                    nextRefreshAt: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
                })
            };

        } catch (error) {
            console.error('Error in xRefreshToken:', error);
            return {
                refresh_failed: () => ({
                    error: 'Token refresh failed',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xRefreshToken = new XRefreshTokenNode();