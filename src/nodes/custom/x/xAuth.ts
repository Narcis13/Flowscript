import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XAuthConfig {
    authType: 'bearer' | 'oauth2';
    credentials: {
        bearerToken?: string;
        apiKey?: string;
        apiSecret?: string;
        accessToken?: string;
        accessTokenSecret?: string;
    };
}

@RegisterNode
export class XAuthNode implements Node {
    metadata: NodeMetadata = {
        name: 'xAuth',
        description: 'Authenticate with X API using OAuth 2.0 or Bearer Token',
        type: 'action',
        ai_hints: {
            purpose: 'X API authentication and token management',
            when_to_use: 'At the start of any X API workflow to establish authentication',
            expected_edges: ['authenticated', 'auth_failed', 'token_expired']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const authConfig = config as XAuthConfig;

        if (!authConfig || !authConfig.authType || !authConfig.credentials) {
            return {
                auth_failed: () => ({
                    error: 'Authentication configuration is missing or invalid',
                    details: 'Please provide authType and credentials'
                })
            };
        }

        try {
            if (authConfig.authType === 'bearer') {
                if (!authConfig.credentials.bearerToken) {
                    return {
                        auth_failed: () => ({
                            error: 'Bearer token is required for bearer authentication',
                            authType: authConfig.authType
                        })
                    };
                }

                // Validate bearer token by making a test request
                const response = await fetch('https://api.twitter.com/2/users/me', {
                    headers: {
                        'Authorization': `Bearer ${authConfig.credentials.bearerToken}`
                    }
                });

                if (response.status === 401) {
                    state.set('x_auth_status', 'token_expired');
                    return {
                        token_expired: () => ({
                            message: 'Bearer token has expired',
                            status: response.status
                        })
                    };
                }

                if (!response.ok) {
                    return {
                        auth_failed: () => ({
                            error: 'Bearer token validation failed',
                            status: response.status,
                            statusText: response.statusText
                        })
                    };
                }

                // Store auth credentials in state
                state.set('x_auth_type', 'bearer');
                state.set('x_bearer_token', authConfig.credentials.bearerToken);
                state.set('x_auth_status', 'authenticated');
                state.set('x_auth_timestamp', Date.now());

                return {
                    authenticated: () => ({
                        authType: 'bearer',
                        authenticatedAt: new Date().toISOString()
                    })
                };

            } else if (authConfig.authType === 'oauth2') {
                const { apiKey, apiSecret, accessToken, accessTokenSecret } = authConfig.credentials;

                if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
                    return {
                        auth_failed: () => ({
                            error: 'OAuth 2.0 requires apiKey, apiSecret, accessToken, and accessTokenSecret',
                            authType: authConfig.authType
                        })
                    };
                }

                // Store OAuth credentials in state
                state.set('x_auth_type', 'oauth2');
                state.set('x_api_key', apiKey);
                state.set('x_api_secret', apiSecret);
                state.set('x_access_token', accessToken);
                state.set('x_access_token_secret', accessTokenSecret);
                state.set('x_auth_status', 'authenticated');
                state.set('x_auth_timestamp', Date.now());

                // For OAuth 2.0, we would typically validate by making a test request
                // This is a simplified implementation
                return {
                    authenticated: () => ({
                        authType: 'oauth2',
                        authenticatedAt: new Date().toISOString()
                    })
                };
            }

            return {
                auth_failed: () => ({
                    error: 'Invalid auth type',
                    authType: authConfig.authType,
                    validTypes: ['bearer', 'oauth2']
                })
            };

        } catch (error) {
            console.error('Error in xAuth:', error);
            return {
                auth_failed: () => ({
                    error: 'Authentication failed',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xAuth = new XAuthNode();