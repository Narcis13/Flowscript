/**
 * FlowScript WebSocket Manager
 * Handles WebSocket connections with auto-reconnect, message queuing, and event handling
 */

class FlowScriptWebSocket extends EventTarget {
    constructor(url = null) {
        super();
        
        // Configuration
        this.url = url || this.getWebSocketURL();
        this.reconnectInterval = 1000; // Start with 1 second
        this.maxReconnectInterval = 30000; // Max 30 seconds
        this.reconnectDecay = 1.5; // Exponential backoff
        this.maxReconnectAttempts = null; // null = infinite
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;
        this.forceClosed = false;
        
        // State
        this.ws = null;
        this.readyState = WebSocket.CONNECTING;
        this.messageQueue = [];
        this.subscriptions = new Set();
        
        // Debug settings
        this.debug = localStorage.getItem('flowscript-debug-ws') === 'true';
        
        // Protocol message types (from server implementation)
        this.messageTypes = {
            // Client -> Server
            SUBSCRIBE: 'subscribe',
            UNSUBSCRIBE: 'unsubscribe',
            RESUME: 'resume',
            PING: 'ping',
            
            // Server -> Client
            CONNECTED: 'connected',
            SUBSCRIBED: 'subscribed',
            UNSUBSCRIBED: 'unsubscribed',
            ERROR: 'error',
            PONG: 'pong',
            RESUME_SUCCESS: 'resume_success',
            RESUME_ERROR: 'resume_error',
            EXECUTION_STATUS: 'execution_status',
            WORKFLOW_STARTED: 'workflow_started',
            NODE_STARTED: 'node_started',
            NODE_COMPLETED: 'node_completed',
            NODE_FAILED: 'node_failed',
            WORKFLOW_PAUSED: 'workflow_paused',
            WORKFLOW_RESUMED: 'workflow_resumed',
            WORKFLOW_COMPLETED: 'workflow_completed',
            WORKFLOW_FAILED: 'workflow_failed',
            HUMAN_INTERACTION_REQUIRED: 'human_interaction_required',
            HUMAN_INTERACTION_TIMEOUT: 'human_interaction_timeout',
            STATE_UPDATED: 'state_updated',
            WORKFLOW_EVENT: 'workflow_event'
        };
        
        // Initialize connection
        this.connect();
    }
    
    // Get WebSocket URL based on current page
    getWebSocketURL() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '3013';
        return `${protocol}//${host}:${port}/ws`;
    }
    
    // Connect to WebSocket
    connect() {
        if (this.forceClosed) {
            this.log('Connection cancelled - force closed');
            return;
        }
        
        this.log('Connecting to', this.url);
        
        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
        } catch (error) {
            this.logError('Failed to create WebSocket:', error);
            this.scheduleReconnect();
        }
    }
    
    // Set up WebSocket event handlers
    setupEventHandlers() {
        this.ws.addEventListener('open', this.onOpen.bind(this));
        this.ws.addEventListener('message', this.onMessage.bind(this));
        this.ws.addEventListener('close', this.onClose.bind(this));
        this.ws.addEventListener('error', this.onError.bind(this));
    }
    
    // Handle connection open
    onOpen(event) {
        this.log('Connected');
        this.readyState = WebSocket.OPEN;
        this.reconnectAttempts = 0;
        this.reconnectInterval = 1000;
        
        // Emit connection event
        this.emit('connected', { url: this.url });
        
        // Process queued messages
        this.processMessageQueue();
        
        // Re-subscribe to previous subscriptions
        this.resubscribe();
        
        // Start heartbeat
        this.startHeartbeat();
    }
    
    // Handle incoming messages
    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.log('Received:', message.type, message.data);
            
            // Handle specific message types
            switch (message.type) {
                case this.messageTypes.CONNECTED:
                    this.handleConnected(message.data);
                    break;
                    
                case this.messageTypes.PONG:
                    this.handlePong();
                    break;
                    
                case this.messageTypes.ERROR:
                    this.handleError(message.data);
                    break;
                    
                case this.messageTypes.HUMAN_INTERACTION_REQUIRED:
                    this.handleHumanInteraction(message.data);
                    break;
                    
                // Emit all messages as events
                default:
                    this.emit(message.type, message.data);
            }
            
            // Also emit a generic message event
            this.emit('message', message);
            
        } catch (error) {
            this.logError('Failed to parse message:', error, event.data);
        }
    }
    
    // Handle connection close
    onClose(event) {
        this.log('Disconnected', `code: ${event.code}, reason: ${event.reason}`);
        this.readyState = WebSocket.CLOSED;
        this.ws = null;
        
        // Stop heartbeat
        this.stopHeartbeat();
        
        // Emit disconnection event
        this.emit('disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        // Schedule reconnection if not force closed
        if (!this.forceClosed && this.shouldReconnect) {
            this.scheduleReconnect();
        }
    }
    
    // Handle connection error
    onError(event) {
        this.logError('WebSocket error:', event);
        this.emit('error', { message: 'WebSocket error occurred' });
    }
    
    // Schedule reconnection with exponential backoff
    scheduleReconnect() {
        if (this.maxReconnectAttempts && this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.log('Max reconnection attempts reached');
            this.emit('reconnect_failed', { attempts: this.reconnectAttempts });
            return;
        }
        
        const timeout = Math.min(
            this.reconnectInterval * Math.pow(this.reconnectDecay, this.reconnectAttempts),
            this.maxReconnectInterval
        );
        
        this.reconnectAttempts++;
        this.log(`Reconnecting in ${timeout}ms (attempt ${this.reconnectAttempts})`);
        
        this.emit('reconnecting', {
            attempt: this.reconnectAttempts,
            timeout: timeout
        });
        
        setTimeout(() => {
            if (!this.forceClosed) {
                this.connect();
            }
        }, timeout);
    }
    
    // Send message (with queuing when disconnected)
    send(type, data = {}) {
        const message = {
            type,
            data,
            timestamp: Date.now()
        };
        
        if (this.isConnected()) {
            try {
                this.ws.send(JSON.stringify(message));
                this.log('Sent:', type, data);
                return true;
            } catch (error) {
                this.logError('Failed to send message:', error);
                this.queueMessage(message);
                return false;
            }
        } else {
            this.log('Queuing message (not connected):', type);
            this.queueMessage(message);
            return false;
        }
    }
    
    // Queue message for later sending
    queueMessage(message) {
        this.messageQueue.push(message);
        this.emit('message_queued', message);
    }
    
    // Process queued messages
    processMessageQueue() {
        if (this.messageQueue.length === 0) return;
        
        this.log(`Processing ${this.messageQueue.length} queued messages`);
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        
        queue.forEach(message => {
            try {
                this.ws.send(JSON.stringify(message));
                this.log('Sent queued message:', message.type);
            } catch (error) {
                this.logError('Failed to send queued message:', error);
                this.messageQueue.push(message);
            }
        });
    }
    
    // Subscribe to execution updates
    subscribe(executionId) {
        this.subscriptions.add(executionId);
        return this.send(this.messageTypes.SUBSCRIBE, { executionId });
    }
    
    // Unsubscribe from execution updates
    unsubscribe(executionId) {
        this.subscriptions.delete(executionId);
        return this.send(this.messageTypes.UNSUBSCRIBE, { executionId });
    }
    
    // Resume workflow with human input
    resume(executionId, nodeId, data) {
        return this.send(this.messageTypes.RESUME, {
            executionId,
            nodeId,
            data
        });
    }
    
    // Re-subscribe to previous subscriptions after reconnection
    resubscribe() {
        if (this.subscriptions.size === 0) return;
        
        this.log(`Re-subscribing to ${this.subscriptions.size} executions`);
        this.subscriptions.forEach(executionId => {
            this.send(this.messageTypes.SUBSCRIBE, { executionId });
        });
    }
    
    // Heartbeat to keep connection alive
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send(this.messageTypes.PING);
            }
        }, 30000); // Ping every 30 seconds
    }
    
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    // Message handlers
    handleConnected(data) {
        this.clientId = data.clientId;
        this.log('Client ID:', this.clientId);
    }
    
    handlePong() {
        // Pong received, connection is alive
        this.lastPong = Date.now();
    }
    
    handleError(data) {
        this.logError('Server error:', data.message || data);
        this.emit('server_error', data);
    }
    
    handleHumanInteraction(data) {
        this.log('Human interaction required:', data);
        this.emit('human_interaction_required', data);
        
        // Also emit to Alpine store if available
        if (window.Alpine && window.Alpine.store('flowscript')) {
            const store = window.Alpine.store('flowscript');
            store.interactions.pending.push({
                id: Date.now(),
                ...data
            });
        }
    }
    
    // Close connection
    close(code = 1000, reason = 'Client closing connection') {
        this.forceClosed = true;
        this.shouldReconnect = false;
        
        if (this.ws) {
            this.ws.close(code, reason);
        }
        
        this.stopHeartbeat();
        this.subscriptions.clear();
        this.messageQueue = [];
    }
    
    // Reconnect manually
    reconnect() {
        this.close();
        this.forceClosed = false;
        this.shouldReconnect = true;
        this.reconnectAttempts = 0;
        this.connect();
    }
    
    // Check if connected
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
    
    // Emit event
    emit(eventType, data = {}) {
        const event = new CustomEvent(eventType, {
            detail: data,
            bubbles: true,
            cancelable: true
        });
        this.dispatchEvent(event);
    }
    
    // Logging utilities
    log(...args) {
        if (this.debug) {
            console.log('[FlowScriptWS]', ...args);
        }
    }
    
    logError(...args) {
        console.error('[FlowScriptWS]', ...args);
    }
    
    // Enable/disable debug logging
    setDebug(enabled) {
        this.debug = enabled;
        localStorage.setItem('flowscript-debug-ws', enabled ? 'true' : 'false');
    }
    
    // Get connection statistics
    getStats() {
        return {
            url: this.url,
            connected: this.isConnected(),
            readyState: this.readyState,
            reconnectAttempts: this.reconnectAttempts,
            queuedMessages: this.messageQueue.length,
            subscriptions: this.subscriptions.size,
            clientId: this.clientId || null
        };
    }
}

// Integration with Alpine.js store
function integrateWebSocketWithStore(wsClient) {
    if (!window.Alpine || !window.Alpine.store('flowscript')) {
        console.warn('Alpine store not available for WebSocket integration');
        return;
    }
    
    const store = window.Alpine.store('flowscript');
    
    // Update connection status
    wsClient.addEventListener('connected', () => {
        store.connection.websocket.status = 'connected';
        store.connection.websocket.reconnectAttempts = 0;
        store.addNotification('WebSocket connected', 'success', 3000);
    });
    
    wsClient.addEventListener('disconnected', () => {
        store.connection.websocket.status = 'disconnected';
    });
    
    wsClient.addEventListener('reconnecting', (event) => {
        store.connection.websocket.status = 'reconnecting';
        store.connection.websocket.reconnectAttempts = event.detail.attempt;
    });
    
    wsClient.addEventListener('error', () => {
        store.connection.websocket.status = 'error';
    });
    
    // Handle workflow events
    wsClient.addEventListener('workflow_started', (event) => {
        store.addEvent('workflow_started', event.detail);
    });
    
    wsClient.addEventListener('workflow_completed', (event) => {
        store.workflows.executing = false;
        store.addEvent('workflow_completed', event.detail);
        store.addNotification('Workflow completed successfully', 'success');
    });
    
    wsClient.addEventListener('workflow_failed', (event) => {
        store.workflows.executing = false;
        store.addEvent('workflow_failed', event.detail);
        store.addNotification('Workflow failed: ' + (event.detail.error || 'Unknown error'), 'danger');
    });
    
    wsClient.addEventListener('workflow_paused', (event) => {
        store.addEvent('workflow_paused', event.detail);
        store.addNotification('Workflow paused', 'warning');
    });
    
    // Handle node events
    wsClient.addEventListener('node_started', (event) => {
        store.addEvent('node_started', event.detail);
    });
    
    wsClient.addEventListener('node_completed', (event) => {
        store.addEvent('node_completed', event.detail);
    });
    
    wsClient.addEventListener('node_failed', (event) => {
        store.addEvent('node_failed', event.detail);
    });
    
    // Handle HITL events
    wsClient.addEventListener('human_interaction_required', (event) => {
        const interaction = {
            id: Date.now(),
            timestamp: new Date(),
            ...event.detail
        };
        store.interactions.pending.push(interaction);
        store.addEvent('human_interaction_required', event.detail);
        store.addNotification('Human interaction required', 'warning');
    });
    
    wsClient.addEventListener('human_interaction_timeout', (event) => {
        store.addEvent('human_interaction_timeout', event.detail);
        store.addNotification('Human interaction timed out', 'danger');
    });
    
    // Handle state updates
    wsClient.addEventListener('state_updated', (event) => {
        store.debug.currentState = event.detail.state || {};
        store.addStateSnapshot(event.detail.state, 'State update from server');
        store.addEvent('state_updated', event.detail);
    });
    
    // Store WebSocket client reference
    store.connection.websocket.client = wsClient;
}

// Export for use
window.FlowScriptWebSocket = FlowScriptWebSocket;
window.integrateWebSocketWithStore = integrateWebSocketWithStore;