import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

@RegisterNode
export class XValidateCredentialsNode implements Node {
    metadata: NodeMetadata = {
        name: 'xValidateCredentials',
        description: 'Validate X API credentials and permissions',
        type: 'action',
        ai_hints: {
            purpose: 'Ensure valid authentication before API operations',
            when_to_use: 'At workflow start or after credential updates',
            expected_edges: ['credentials_valid', 'credentials_invalid', 'insufficient_permissions']
        }
    };

    async execute({ state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const authType = state.get('x_auth_type');
        const bearerToken = state.get('x_bearer_token');

        if (!authType) {
            return {
                credentials_invalid: () => ({
                    error: 'No authentication type found',
                    details: 'Please authenticate using xAuth node first'
                })
            };
        }

        if (!bearerToken) {
            return {
                credentials_invalid: () => ({
                    error: 'No bearer token found',
                    details: 'Authentication credentials missing from state'
                })
            };
        }

        try {
            // Validate credentials by getting authenticated user info
            const response = await fetch('https://api.twitter.com/2/users/me?user.fields=created_at,description,id,name,username,verified,protected', {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`
                }
            });

            if (response.status === 401) {
                return {
                    credentials_invalid: () => ({
                        error: 'Invalid credentials',
                        status: response.status,
                        details: 'The provided credentials are invalid or expired'
                    })
                };
            }

            if (response.status === 403) {
                return {
                    insufficient_permissions: () => ({
                        error: 'Insufficient permissions',
                        status: response.status,
                        details: 'The credentials do not have required permissions'
                    })
                };
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return {
                    credentials_invalid: () => ({
                        error: 'Credential validation failed',
                        status: response.status,
                        details: errorData
                    })
                };
            }

            const userData = await response.json();
            
            // Store current user info in state
            state.set('x_current_user_id', userData.data.id);
            state.set('x_current_user_info', userData.data);
            state.set('x_credentials_validated_at', Date.now());

            // Check rate limit headers to understand API access level
            const rateLimit = response.headers.get('x-rate-limit-limit');
            let accessLevel = 'unknown';
            
            if (rateLimit) {
                const limit = parseInt(rateLimit);
                if (limit <= 15) {
                    accessLevel = 'app-auth';
                } else if (limit <= 180) {
                    accessLevel = 'user-auth-basic';
                } else {
                    accessLevel = 'user-auth-elevated';
                }
            }

            return {
                credentials_valid: () => ({
                    authType,
                    user: {
                        id: userData.data.id,
                        username: userData.data.username,
                        name: userData.data.name,
                        verified: userData.data.verified || false,
                        protected: userData.data.protected || false
                    },
                    accessLevel,
                    rateLimit: rateLimit ? parseInt(rateLimit) : undefined,
                    validatedAt: new Date().toISOString()
                })
            };

        } catch (error) {
            console.error('Error in xValidateCredentials:', error);
            return {
                credentials_invalid: () => ({
                    error: 'Failed to validate credentials',
                    details: error instanceof Error ? error.message : String(error)
                })
            };
        }
    }
}

export const xValidateCredentials = new XValidateCredentialsNode();