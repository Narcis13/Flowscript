import { Node, NodeMetadata, SimpleEdgeMap } from '../../../core/types/node';
import { ExecutionContext } from '../../../core/types/context';
import { RegisterNode } from '../../registry';

interface XRetryHandlerConfig {
    maxRetries: number;
    backoffMultiplier: number;
    retryableErrors: string[];
}

@RegisterNode
export class XRetryHandlerNode implements Node {
    metadata: NodeMetadata = {
        name: 'xRetryHandler',
        description: 'Handle X API errors with exponential backoff retry',
        type: 'control',
        ai_hints: {
            purpose: 'Resilient API error handling',
            when_to_use: 'Wrapping X API calls that may fail due to temporary issues',
            expected_edges: ['retry', 'max_retries_exceeded', 'permanent_error', 'success']
        }
    };

    async execute({ config, state }: ExecutionContext): Promise<SimpleEdgeMap> {
        const retryConfig = config as XRetryHandlerConfig;

        if (!retryConfig?.maxRetries || retryConfig.maxRetries < 1) {
            return {
                permanent_error: () => ({
                    error: 'Invalid configuration',
                    details: 'maxRetries must be at least 1'
                })
            };
        }

        if (!retryConfig.backoffMultiplier || retryConfig.backoffMultiplier < 1) {
            return {
                permanent_error: () => ({
                    error: 'Invalid configuration',
                    details: 'backoffMultiplier must be at least 1'
                })
            };
        }

        if (!retryConfig.retryableErrors || retryConfig.retryableErrors.length === 0) {
            return {
                permanent_error: () => ({
                    error: 'Invalid configuration',
                    details: 'At least one retryable error type must be specified'
                })
            };
        }

        // Get retry state
        const retryKey = state.get('x_retry_handler_key') || 'default';
        const retryStateKey = `x_retry_state_${retryKey}`;
        let retryState = state.get(retryStateKey) || {
            attempts: 0,
            lastAttempt: null,
            lastError: null,
            backoffMs: 1000 // Start with 1 second
        };

        // Check if we have a recent error to handle
        const lastApiError = state.get('x_last_api_error');
        if (!lastApiError) {
            // No error to handle, this is likely the first call
            return {
                retry: () => ({
                    attempt: 1,
                    message: 'Ready to execute API call',
                    retryState: {
                        ...retryState,
                        attempts: 0
                    }
                })
            };
        }

        // Determine if the error is retryable
        const isRetryable = this.isRetryableError(lastApiError, retryConfig.retryableErrors);
        
        if (!isRetryable) {
            // Clear retry state
            state.set(retryStateKey, null);
            return {
                permanent_error: () => ({
                    error: 'Non-retryable error',
                    errorType: lastApiError.type || 'unknown',
                    details: lastApiError.message || lastApiError,
                    attempts: retryState.attempts + 1
                })
            };
        }

        // Check if we've exceeded max retries
        if (retryState.attempts >= retryConfig.maxRetries) {
            // Clear retry state
            state.set(retryStateKey, null);
            return {
                max_retries_exceeded: () => ({
                    error: 'Maximum retries exceeded',
                    attempts: retryState.attempts,
                    maxRetries: retryConfig.maxRetries,
                    lastError: lastApiError
                })
            };
        }

        // Calculate exponential backoff
        const backoffMs = retryState.backoffMs * Math.pow(retryConfig.backoffMultiplier, retryState.attempts);
        const maxBackoffMs = 60000; // Cap at 60 seconds
        const actualBackoffMs = Math.min(backoffMs, maxBackoffMs);

        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.1 * actualBackoffMs;
        const totalBackoffMs = actualBackoffMs + jitter;

        // Update retry state
        retryState = {
            attempts: retryState.attempts + 1,
            lastAttempt: Date.now(),
            lastError: lastApiError,
            backoffMs: actualBackoffMs
        };
        state.set(retryStateKey, retryState);

        // Check if we just handled a successful response
        const lastApiSuccess = state.get('x_last_api_success');
        if (lastApiSuccess && (!retryState.lastAttempt || lastApiSuccess.timestamp > retryState.lastAttempt)) {
            // Success! Clear retry state
            state.set(retryStateKey, null);
            state.set('x_last_api_error', null);
            return {
                success: () => ({
                    message: 'API call succeeded after retry',
                    attempts: retryState.attempts,
                    result: lastApiSuccess.data
                })
            };
        }

        // Wait for backoff period
        console.log(`Waiting ${Math.round(totalBackoffMs / 1000)} seconds before retry attempt ${retryState.attempts + 1}...`);
        await new Promise(resolve => setTimeout(resolve, totalBackoffMs));

        // Clear the last error to prepare for retry
        state.set('x_last_api_error', null);

        return {
            retry: () => ({
                attempt: retryState.attempts + 1,
                maxRetries: retryConfig.maxRetries,
                backoffMs: Math.round(totalBackoffMs),
                nextBackoffMs: Math.round(actualBackoffMs * retryConfig.backoffMultiplier),
                message: `Retrying after ${Math.round(totalBackoffMs / 1000)}s backoff`
            })
        };
    }

    private isRetryableError(error: any, retryableErrors: string[]): boolean {
        // Check for specific error types
        if (error.type && retryableErrors.includes(error.type)) {
            return true;
        }

        // Check for HTTP status codes
        if (error.status) {
            const status = error.status.toString();
            if (retryableErrors.includes(status)) {
                return true;
            }
            
            // Check for status code patterns
            if (retryableErrors.includes('5xx') && status.startsWith('5')) {
                return true;
            }
            if (retryableErrors.includes('429')) {
                return status === '429';
            }
        }

        // Check for specific error messages
        if (error.message) {
            const lowerMessage = error.message.toLowerCase();
            if (retryableErrors.includes('timeout') && lowerMessage.includes('timeout')) {
                return true;
            }
            if (retryableErrors.includes('network') && 
                (lowerMessage.includes('network') || lowerMessage.includes('connection'))) {
                return true;
            }
        }

        return false;
    }
}

export const xRetryHandler = new XRetryHandlerNode();