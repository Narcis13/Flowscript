/**
 * FlowScript Testing Interface - Main Application
 */

// ===========================
// Global State Store
// ===========================
document.addEventListener('alpine:init', () => {
    // Define global state store
    Alpine.store('flowscript', {
        // Application state
        initialized: false,
        
        // Connection management
        connection: {
            api: {
                status: 'disconnected',
                lastCheck: null,
                errorCount: 0
            },
            websocket: {
                status: 'disconnected',
                reconnectAttempts: 0,
                maxReconnectAttempts: 5,
                client: null
            }
        },
        
        // Workflow management
        workflows: {
            available: [],
            selected: null,
            executing: false,
            executionId: null
        },
        
        // HITL management
        interactions: {
            pending: [],
            active: null,
            history: []
        },
        
        // Event monitoring
        events: {
            log: [],
            maxEvents: 1000,
            filters: {
                text: '',
                types: []
            }
        },
        
        // State debugging
        debug: {
            currentState: {},
            stateHistory: [],
            maxHistorySize: 100,
            selectedVersion: null
        },
        
        // Notifications
        notifications: {
            items: [],
            nextId: 1,
            defaultDuration: 5000
        },
        
        // User preferences (persisted)
        preferences: {
            theme: 'light',
            autoConnect: true,
            eventFilters: [],
            debugEnabled: false
        },
        
        // Actions
        init() {
            console.log('Initializing FlowScript global store...');
            this.loadPreferences();
            this.initialized = true;
        },
        
        // Preference management
        loadPreferences() {
            const saved = localStorage.getItem('flowscript-preferences');
            if (saved) {
                try {
                    const prefs = JSON.parse(saved);
                    Object.assign(this.preferences, prefs);
                } catch (e) {
                    console.error('Failed to load preferences:', e);
                }
            }
        },
        
        savePreferences() {
            localStorage.setItem('flowscript-preferences', JSON.stringify(this.preferences));
        },
        
        // Notification actions
        addNotification(message, type = 'info', duration = null) {
            const notification = {
                id: this.notifications.nextId++,
                message,
                type,
                timestamp: new Date(),
                duration: duration || this.notifications.defaultDuration
            };
            
            this.notifications.items.push(notification);
            
            // Auto-remove after duration
            if (notification.duration > 0) {
                setTimeout(() => {
                    this.removeNotification(notification.id);
                }, notification.duration);
            }
            
            return notification.id;
        },
        
        removeNotification(id) {
            const index = this.notifications.items.findIndex(n => n.id === id);
            if (index > -1) {
                this.notifications.items.splice(index, 1);
            }
        },
        
        clearNotifications() {
            this.notifications.items = [];
        },
        
        // Event management
        addEvent(type, data) {
            const event = {
                id: Date.now() + Math.random(),
                type,
                data,
                timestamp: new Date()
            };
            
            this.events.log.unshift(event);
            
            // Limit event log size
            if (this.events.log.length > this.events.maxEvents) {
                this.events.log = this.events.log.slice(0, this.events.maxEvents);
            }
            
            return event;
        },
        
        clearEvents() {
            this.events.log = [];
        },
        
        // State history management
        addStateSnapshot(state, description = '') {
            const snapshot = {
                state: JSON.parse(JSON.stringify(state)),
                timestamp: new Date(),
                description
            };
            
            this.debug.stateHistory.unshift(snapshot);
            
            // Limit history size
            if (this.debug.stateHistory.length > this.debug.maxHistorySize) {
                this.debug.stateHistory = this.debug.stateHistory.slice(0, this.debug.maxHistorySize);
            }
        },
        
        clearStateHistory() {
            this.debug.stateHistory = [];
            this.debug.selectedVersion = null;
        }
    });
});

// ===========================
// Main Application Component
// ===========================
document.addEventListener('alpine:init', () => {
    Alpine.data('flowscriptApp', () => ({
        // Component state
        activeTab: 'executor',
        mobileMenuOpen: false,
        darkMode: false,
        
        // Local component state
        selectedWorkflow: '',
        initialState: '{}',
        executionEvents: [],
        eventFilter: '',
        selectedEvent: null,
        selectedInteraction: null,
        selectedStateVersion: null,
        
        // Computed properties from store
        get store() {
            return Alpine.store('flowscript');
        },
        
        get connectionStatus() {
            const api = this.store.connection.api.status;
            const ws = this.store.connection.websocket.status;
            
            if (api === 'connected' && ws === 'connected') return 'connected';
            if (api === 'connected' || ws === 'connected') return 'partial';
            return 'disconnected';
        },
        
        get wsConnected() {
            return this.store.connection.websocket.status === 'connected';
        },
        
        get apiHealthy() {
            return this.store.connection.api.status === 'connected';
        },
        
        get workflows() {
            return this.store.workflows.available;
        },
        
        get executing() {
            return this.store.workflows.executing;
        },
        
        get executionId() {
            return this.store.workflows.executionId;
        },
        
        get pendingInteractions() {
            return this.store.interactions.pending;
        },
        
        get eventLog() {
            return this.store.events.log;
        },
        
        get currentState() {
            return this.store.debug.currentState;
        },
        
        get stateHistory() {
            return this.store.debug.stateHistory;
        },
        
        get notifications() {
            return this.store.notifications.items;
        },
        
        // Initialize the application
        init() {
            console.log('FlowScript Testing Interface initialized');
            
            // Initialize global store
            this.store.init();
            
            // Load theme preference
            this.loadTheme();
            
            // Set up auto-save for preferences
            this.$watch('darkMode', () => {
                this.store.preferences.theme = this.darkMode ? 'dark' : 'light';
                this.store.savePreferences();
            });
            
            // Initial data loading
            this.checkAPIHealth();
            this.loadWorkflows();
            this.setupPeriodicHealthCheck();
            
            // Restore tab from URL hash
            if (window.location.hash) {
                const tab = window.location.hash.substring(1);
                if (['executor', 'hitl', 'monitor', 'debugger'].includes(tab)) {
                    this.activeTab = tab;
                }
            }
            
            // Update URL hash when tab changes
            this.$watch('activeTab', (value) => {
                window.location.hash = value;
                this.mobileMenuOpen = false;
            });
            
            // Set up keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Initialize WebSocket connection
            this.initializeWebSocket();
        },
        
        // Initialize WebSocket connection
        initializeWebSocket() {
            console.log('Initializing WebSocket connection...');
            
            // Create WebSocket client
            const wsClient = new FlowScriptWebSocket();
            
            // Enable debug if in debug mode
            if (this.store.preferences.debugEnabled) {
                wsClient.setDebug(true);
            }
            
            // Integrate with Alpine store
            integrateWebSocketWithStore(wsClient);
            
            // Additional event handlers for UI updates
            wsClient.addEventListener('workflow_started', (event) => {
                if (event.detail.executionId === this.executionId) {
                    this.addExecutionEvent('Workflow started', 'active');
                }
            });
            
            wsClient.addEventListener('node_started', (event) => {
                if (event.detail.executionId === this.executionId) {
                    this.addExecutionEvent(`Node ${event.detail.nodeName} started`, 'active');
                }
            });
            
            wsClient.addEventListener('node_completed', (event) => {
                if (event.detail.executionId === this.executionId) {
                    this.addExecutionEvent(`Node ${event.detail.nodeName} completed`, 'completed');
                }
            });
            
            wsClient.addEventListener('workflow_completed', (event) => {
                if (event.detail.executionId === this.executionId) {
                    this.addExecutionEvent('Workflow completed', 'completed');
                    this.store.workflows.executing = false;
                }
            });
            
            wsClient.addEventListener('workflow_failed', (event) => {
                if (event.detail.executionId === this.executionId) {
                    this.addExecutionEvent(`Workflow failed: ${event.detail.error}`, 'failed');
                    this.store.workflows.executing = false;
                }
            });
            
            // Store WebSocket client for access
            this.wsClient = wsClient;
            window.wsClient = wsClient; // For debugging
        },
        
        // Tab management
        switchTab(tab) {
            this.activeTab = tab;
            this.notify(`Switched to ${tab} tab`, 'info', 2000);
        },
        
        // Notification helpers
        notify(message, type = 'info', duration = null) {
            this.store.addNotification(message, type, duration);
        },
        
        removeNotification(id) {
            this.store.removeNotification(id);
        },
        
        // API Health Check
        async checkAPIHealth() {
            try {
                const response = await fetch('/health');
                if (response.ok) {
                    const data = await response.json();
                    this.store.connection.api.status = data.status === 'ok' ? 'connected' : 'error';
                    this.store.connection.api.lastCheck = new Date();
                    this.store.connection.api.errorCount = 0;
                } else {
                    throw new Error(`Health check failed: ${response.status}`);
                }
            } catch (error) {
                console.error('API health check failed:', error);
                this.store.connection.api.status = 'error';
                this.store.connection.api.errorCount++;
                
                if (this.store.connection.api.errorCount === 1) {
                    this.notify('API connection failed', 'danger');
                }
            }
        },
        
        // Load available workflows
        async loadWorkflows() {
            try {
                const response = await fetch('/workflows');
                if (response.ok) {
                    const data = await response.json();
                    this.store.workflows.available = data.workflows || [];
                    console.log('Loaded workflows:', this.store.workflows.available);
                    
                    // Restore selected workflow from localStorage
                    const savedWorkflow = localStorage.getItem('flowscript-selected-workflow');
                    if (savedWorkflow && this.store.workflows.available.some(w => w.id === savedWorkflow)) {
                        this.selectedWorkflow = savedWorkflow;
                    }
                }
            } catch (error) {
                console.error('Failed to load workflows:', error);
                this.notify('Failed to load workflows', 'warning');
            }
        },
        
        // Execute workflow
        async executeWorkflow() {
            if (!this.selectedWorkflow) return;
            
            // Save selected workflow
            localStorage.setItem('flowscript-selected-workflow', this.selectedWorkflow);
            
            try {
                // Parse initial state
                let initialInput = {};
                try {
                    initialInput = JSON.parse(this.initialState);
                } catch (e) {
                    this.notify('Invalid JSON in initial state', 'danger');
                    return;
                }
                
                this.store.workflows.executing = true;
                this.executionEvents = [];
                
                const response = await fetch(`/workflows/${this.selectedWorkflow}/execute`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ initialInput })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.store.workflows.executionId = data.executionId;
                    
                    // Add initial event
                    this.addExecutionEvent('Workflow started', 'active');
                    this.store.addEvent('workflow_started', {
                        workflowId: this.selectedWorkflow,
                        executionId: data.executionId
                    });
                    
                    this.notify('Workflow execution started', 'success');
                    
                    // Subscribe to WebSocket updates for this execution
                    if (this.wsClient && this.wsClient.isConnected()) {
                        this.wsClient.subscribe(data.executionId);
                        console.log('Subscribed to execution updates:', data.executionId);
                    } else {
                        console.warn('WebSocket not connected, real-time updates unavailable');
                    }
                } else {
                    const error = await response.json();
                    throw new Error(error.message || 'Execution failed');
                }
            } catch (error) {
                console.error('Failed to execute workflow:', error);
                this.notify(`Failed to execute workflow: ${error.message}`, 'danger');
                this.store.workflows.executing = false;
            }
        },
        
        // Pause workflow
        pauseWorkflow() {
            console.log('Pause workflow - to be implemented');
            this.addExecutionEvent('Workflow paused', 'active');
            this.store.addEvent('workflow_paused', { executionId: this.executionId });
            this.notify('Workflow paused', 'warning');
        },
        
        // Stop workflow
        stopWorkflow() {
            console.log('Stop workflow - to be implemented');
            this.store.workflows.executing = false;
            this.addExecutionEvent('Workflow stopped', 'failed');
            this.store.addEvent('workflow_stopped', { executionId: this.executionId });
            this.notify('Workflow stopped', 'danger');
        },
        
        // Add execution event
        addExecutionEvent(message, status = 'active') {
            this.executionEvents.push({
                id: Date.now(),
                timestamp: new Date().toLocaleTimeString(),
                message,
                status
            });
        },
        
        // Select HITL interaction
        selectInteraction(interaction) {
            this.selectedInteraction = interaction;
            this.store.interactions.active = interaction;
            // Form rendering will be implemented in Phase 9
            console.log('Selected interaction:', interaction);
        },
        
        // Clear event log
        clearEventLog() {
            this.store.clearEvents();
            this.notify('Event log cleared', 'info', 2000);
        },
        
        // Get event tag class
        getEventTagClass(eventType) {
            const typeMap = {
                'workflow_started': 'is-primary',
                'workflow_completed': 'is-success',
                'workflow_failed': 'is-danger',
                'workflow_paused': 'is-warning',
                'node_started': 'is-info',
                'node_completed': 'is-success is-light',
                'node_failed': 'is-danger is-light',
                'human_interaction_required': 'is-warning',
                'state_updated': 'is-link is-light'
            };
            return typeMap[eventType] || 'is-light';
        },
        
        // Computed properties
        get filteredEvents() {
            if (!this.eventFilter) return this.eventLog;
            
            const filter = this.eventFilter.toLowerCase();
            return this.eventLog.filter(event => 
                event.type.toLowerCase().includes(filter) ||
                JSON.stringify(event.data).toLowerCase().includes(filter)
            );
        },
        
        // Setup periodic health check
        setupPeriodicHealthCheck() {
            // Check API health every 10 seconds
            setInterval(() => {
                this.checkAPIHealth();
            }, 10000);
        },
        
        // Dark mode management
        loadTheme() {
            this.darkMode = this.store.preferences.theme === 'dark';
            this.applyTheme();
        },
        
        toggleTheme() {
            this.darkMode = !this.darkMode;
            this.applyTheme();
        },
        
        applyTheme() {
            if (this.darkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        },
        
        // Keyboard shortcuts
        setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Ctrl/Cmd + K - Quick switch tabs
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    this.showQuickSwitcher();
                }
                
                // Ctrl/Cmd + E - Execute workflow
                if ((e.ctrlKey || e.metaKey) && e.key === 'e' && this.activeTab === 'executor') {
                    e.preventDefault();
                    if (this.selectedWorkflow && !this.executing) {
                        this.executeWorkflow();
                    }
                }
                
                // Ctrl/Cmd + / - Toggle dark mode
                if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                    e.preventDefault();
                    this.toggleTheme();
                }
                
                // Escape - Close notifications
                if (e.key === 'Escape') {
                    if (this.notifications.length > 0) {
                        this.store.clearNotifications();
                    }
                }
            });
        },
        
        // Quick switcher (placeholder)
        showQuickSwitcher() {
            // Will be implemented with a modal in future
            const tabs = ['executor', 'hitl', 'monitor', 'debugger'];
            const currentIndex = tabs.indexOf(this.activeTab);
            const nextIndex = (currentIndex + 1) % tabs.length;
            this.switchTab(tabs[nextIndex]);
        }
    }));
});

// ===========================
// Utility Functions
// ===========================

// Format timestamp
function formatTimestamp(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString();
}

// Format date
function formatDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString();
}

// Deep clone object
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// JSON Syntax Highlighter
function highlightJSON(json) {
    if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
    }
    
    return json.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        }
    );
}

// Download JSON
function downloadJSON(data, filename = 'data.json') {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Failed to copy:', err);
        return false;
    }
}

// ===========================
// Initialize on Load
// ===========================
window.addEventListener('load', () => {
    console.log('Page loaded, testing API connectivity...');
    
    fetch('/api')
        .then(response => response.json())
        .then(data => {
            console.log('API Response:', data);
            console.log('Available endpoints:', data.endpoints);
        })
        .catch(error => {
            console.error('API Error:', error);
        });
});

// Export utilities for use in other scripts
window.FlowScriptUtils = {
    formatTimestamp,
    formatDate,
    deepClone,
    debounce,
    highlightJSON,
    downloadJSON,
    copyToClipboard
};