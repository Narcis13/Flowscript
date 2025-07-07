/**
 * Enhanced FlowScript WebSocket Manager
 * Fixes timing issues with pre-subscription and event buffering
 */

class EnhancedFlowScriptWebSocket extends FlowScriptWebSocket {
    constructor(url = null) {
        super(url);
        
        // Enhanced state for pre-subscription
        this.pendingSubscriptions = new Map(); // executionId -> Promise
        this.bufferedEvents = new Map(); // executionId -> events[]
        this.subscriptionTimeout = 5000; // 5 seconds
        
        // Track subscription confirmations
        this.confirmedSubscriptions = new Set();
        
        // Enhanced debug
        this.debugBuffer = [];
        this.maxDebugBuffer = 100;
    }
    
    /**
     * Pre-subscribe to an execution before it starts
     * This ensures we don't miss any events
     */
    async preSubscribe(executionId) {
        this.log(`Pre-subscribing to execution: ${executionId}`);
        
        // Check if already subscribed
        if (this.confirmedSubscriptions.has(executionId)) {
            this.log(`Already subscribed to: ${executionId}`);
            return true;
        }
        
        // Create promise for subscription confirmation
        const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingSubscriptions.delete(executionId);
                reject(new Error(`Subscription timeout for ${executionId}`));
            }, this.subscriptionTimeout);
            
            // Store resolver with timeout
            this.pendingSubscriptions.set(executionId, {
                resolve,
                reject,
                timeout
            });
        });
        
        // Initialize event buffer for this execution
        this.bufferedEvents.set(executionId, []);
        
        // Send subscription request
        this.subscribe(executionId);
        
        // Wait for confirmation
        try {
            await promise;
            this.log(`Subscription confirmed for: ${executionId}`);
            return true;
        } catch (error) {
            this.logError(`Subscription failed for ${executionId}:`, error);
            throw error;
        }
    }
    
    /**
     * Override subscribe to track subscriptions better
     */
    subscribe(executionId) {
        this.subscriptions.add(executionId);
        
        // If not connected, the subscription will be sent when connected
        if (!this.isConnected()) {
            this.log(`Queuing subscription for ${executionId} (not connected)`);
            return false;
        }
        
        return this.send(this.messageTypes.SUBSCRIBE, { executionId });
    }
    
    /**
     * Override message handler to handle subscription confirmations and buffering
     */
    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.addToDebugBuffer('received', message);
            
            // Handle subscription confirmation
            if (message.type === this.messageTypes.SUBSCRIBED) {
                this.handleSubscriptionConfirmed(message.data);
            }
            
            // Buffer events for pending subscriptions
            if (message.data && message.data.executionId) {
                const executionId = message.data.executionId;
                
                // If we have a buffer for this execution, add the event
                if (this.bufferedEvents.has(executionId)) {
                    this.bufferedEvents.get(executionId).push(message);
                    this.log(`Buffered event for ${executionId}: ${message.type}`);
                }
            }
            
            // Call parent handler
            super.onMessage(event);
            
        } catch (error) {
            this.logError('Failed to process message:', error, event.data);
        }
    }
    
    /**
     * Handle subscription confirmation
     */
    handleSubscriptionConfirmed(data) {
        const executionId = data.executionId;
        this.log(`Subscription confirmed for: ${executionId}`);
        
        // Mark as confirmed
        this.confirmedSubscriptions.add(executionId);
        
        // Resolve pending promise
        const pending = this.pendingSubscriptions.get(executionId);
        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(true);
            this.pendingSubscriptions.delete(executionId);
        }
        
        // Process buffered events
        this.processBufferedEvents(executionId);
    }
    
    /**
     * Process buffered events for an execution
     */
    processBufferedEvents(executionId) {
        const events = this.bufferedEvents.get(executionId);
        if (!events || events.length === 0) return;
        
        this.log(`Processing ${events.length} buffered events for ${executionId}`);
        
        // Emit all buffered events in order
        events.forEach(message => {
            this.emit(message.type, message.data);
            this.emit('message', message);
        });
        
        // Clear the buffer
        this.bufferedEvents.set(executionId, []);
    }
    
    /**
     * Enhanced unsubscribe that cleans up properly
     */
    unsubscribe(executionId) {
        this.subscriptions.delete(executionId);
        this.confirmedSubscriptions.delete(executionId);
        this.bufferedEvents.delete(executionId);
        
        // Cancel pending subscription
        const pending = this.pendingSubscriptions.get(executionId);
        if (pending) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Subscription cancelled'));
            this.pendingSubscriptions.delete(executionId);
        }
        
        return this.send(this.messageTypes.UNSUBSCRIBE, { executionId });
    }
    
    /**
     * Execute workflow with pre-subscription
     */
    async executeWorkflowWithSubscription(workflowId, initialState = {}) {
        try {
            // First, prepare for subscription
            const tempExecutionId = `pending-${Date.now()}`;
            
            // Set up event listener for execution ID
            const executionIdPromise = new Promise((resolve) => {
                const handler = (event) => {
                    if (event.detail.workflowId === workflowId) {
                        this.removeEventListener('workflow_started', handler);
                        resolve(event.detail.executionId);
                    }
                };
                this.addEventListener('workflow_started', handler);
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    this.removeEventListener('workflow_started', handler);
                    resolve(null);
                }, 10000);
            });
            
            // Make the API call to start workflow
            const response = await fetch(`/api/workflows/${workflowId}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(initialState)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to execute workflow: ${response.statusText}`);
            }
            
            const result = await response.json();
            const executionId = result.executionId;
            
            // Pre-subscribe to the execution
            await this.preSubscribe(executionId);
            
            return { success: true, executionId };
            
        } catch (error) {
            this.logError('Failed to execute workflow with subscription:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get buffered events for an execution
     */
    getBufferedEvents(executionId) {
        return this.bufferedEvents.get(executionId) || [];
    }
    
    /**
     * Clear all buffers for an execution
     */
    clearExecutionData(executionId) {
        this.bufferedEvents.delete(executionId);
        this.confirmedSubscriptions.delete(executionId);
        this.subscriptions.delete(executionId);
    }
    
    /**
     * Enhanced stats including subscription info
     */
    getStats() {
        const baseStats = super.getStats();
        return {
            ...baseStats,
            pendingSubscriptions: this.pendingSubscriptions.size,
            confirmedSubscriptions: this.confirmedSubscriptions.size,
            bufferedExecutions: this.bufferedEvents.size,
            totalBufferedEvents: Array.from(this.bufferedEvents.values())
                .reduce((sum, events) => sum + events.length, 0)
        };
    }
    
    /**
     * Add to debug buffer for troubleshooting
     */
    addToDebugBuffer(action, data) {
        const entry = {
            timestamp: new Date().toISOString(),
            action,
            data: JSON.parse(JSON.stringify(data)) // Deep clone
        };
        
        this.debugBuffer.push(entry);
        
        // Keep buffer size limited
        if (this.debugBuffer.length > this.maxDebugBuffer) {
            this.debugBuffer.shift();
        }
    }
    
    /**
     * Get debug buffer for troubleshooting
     */
    getDebugBuffer() {
        return this.debugBuffer;
    }
    
    /**
     * Clear debug buffer
     */
    clearDebugBuffer() {
        this.debugBuffer = [];
    }
}

// Enhanced integration with Alpine store
function enhancedIntegrateWebSocketWithStore(wsClient) {
    // Call parent integration first
    integrateWebSocketWithStore(wsClient);
    
    if (!window.Alpine || !window.Alpine.store('flowscript')) {
        return;
    }
    
    const store = window.Alpine.store('flowscript');
    
    // Add enhanced WebSocket client to store
    store.connection.websocket.enhancedClient = wsClient;
    
    // Override execute workflow to use pre-subscription
    store.executeWorkflowEnhanced = async function(workflow, initialState = {}) {
        try {
            store.workflows.executing = true;
            store.addNotification('Starting workflow execution...', 'info');
            
            // Use enhanced execution with pre-subscription
            const result = await wsClient.executeWorkflowWithSubscription(
                workflow.id, 
                initialState
            );
            
            if (result.success) {
                store.executionId = result.executionId;
                store.addNotification('Workflow started successfully', 'success');
                
                // Clear and start fresh timeline
                store.timeline = [];
                store.addTimelineEvent('Workflow Started', 'primary', {
                    workflowId: workflow.id,
                    executionId: result.executionId
                });
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            store.workflows.executing = false;
            store.addNotification(`Failed to start workflow: ${error.message}`, 'danger');
            console.error('Workflow execution error:', error);
        }
    };
    
    // Add method to check subscription status
    store.isSubscribed = function(executionId) {
        return wsClient.confirmedSubscriptions.has(executionId);
    };
    
    // Add method to get buffered events
    store.getBufferedEvents = function(executionId) {
        return wsClient.getBufferedEvents(executionId);
    };
}

// Export enhanced versions
window.EnhancedFlowScriptWebSocket = EnhancedFlowScriptWebSocket;
window.enhancedIntegrateWebSocketWithStore = enhancedIntegrateWebSocketWithStore;