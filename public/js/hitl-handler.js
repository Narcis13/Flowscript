/**
 * HITL (Human-in-the-Loop) Interaction Handler
 * Manages human interactions in workflows
 */

document.addEventListener('alpine:init', () => {
    // HITL Handler Component
    Alpine.data('hitlHandler', () => ({
        // State
        pendingInteractions: [],
        activeInteraction: null,
        formSchema: null,
        formData: {},
        submitting: false,
        timeoutTimer: null,
        
        // Initialize
        init() {
            // Subscribe to HITL events
            this.setupEventListeners();
            
            // Check for pending interactions on load
            this.checkPendingInteractions();
        },
        
        // Set up WebSocket event listeners
        setupEventListeners() {
            if (!window.wsClient) {
                console.warn('[HITL] WebSocket client not available');
                return;
            }
            
            // Listen for human interaction required events
            window.wsClient.addEventListener('human_interaction_required', (event) => {
                console.log('[HITL] Human interaction required:', event.detail);
                this.addInteraction(event.detail);
            });
            
            // Listen for interaction timeout events
            window.wsClient.addEventListener('human_interaction_timeout', (event) => {
                console.log('[HITL] Human interaction timeout:', event.detail);
                this.handleTimeout(event.detail);
            });
            
            // Listen for resume success/error
            window.wsClient.addEventListener('resume_success', (event) => {
                console.log('[HITL] Resume success:', event.detail);
                this.handleResumeSuccess(event.detail);
            });
            
            window.wsClient.addEventListener('resume_error', (event) => {
                console.log('[HITL] Resume error:', event.detail);
                this.handleResumeError(event.detail);
            });
        },
        
        // Add new interaction
        addInteraction(data) {
            const interaction = {
                id: `hitl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                timestamp: new Date(),
                executionId: data.executionId,
                nodeId: data.nodeId,
                nodeName: data.nodeInfo?.name || 'Unknown Node',
                schema: data.nodeInfo?.formSchema || {},
                uiSchema: data.nodeInfo?.uiSchema || {},
                contextData: data.nodeInfo?.contextData || {},
                timeout: data.nodeInfo?.timeout || null,
                status: 'pending'
            };
            
            this.pendingInteractions.push(interaction);
            
            // Sort by timestamp (newest first)
            this.pendingInteractions.sort((a, b) => b.timestamp - a.timestamp);
            
            // Show notification
            Alpine.store('flowscript').addNotification(
                `Human interaction required for "${interaction.nodeName}"`,
                'warning',
                10000
            );
            
            // Auto-select if no active interaction
            if (!this.activeInteraction && this.pendingInteractions.length === 1) {
                this.selectInteraction(interaction);
            }
            
            // Update store
            this.updateStore();
        },
        
        // Select interaction to respond to
        selectInteraction(interaction) {
            this.activeInteraction = interaction;
            this.formSchema = interaction.schema;
            this.formData = this.initializeFormData(interaction.schema);
            
            // Set up timeout timer if applicable
            if (interaction.timeout) {
                this.startTimeoutTimer(interaction);
            }
            
            // Update store
            Alpine.store('hitlForm').setSchema(
                interaction.schema,
                interaction.uiSchema,
                this.formData
            );
        },
        
        // Initialize form data from schema
        initializeFormData(schema) {
            const data = {};
            
            if (schema.type === 'object' && schema.properties) {
                Object.keys(schema.properties).forEach(key => {
                    const prop = schema.properties[key];
                    if (prop.default !== undefined) {
                        data[key] = prop.default;
                    } else {
                        data[key] = this.getDefaultValue(prop.type);
                    }
                });
            }
            
            return data;
        },
        
        // Get default value for type
        getDefaultValue(type) {
            switch (type) {
                case 'string': return '';
                case 'number': return 0;
                case 'integer': return 0;
                case 'boolean': return false;
                case 'array': return [];
                case 'object': return {};
                default: return null;
            }
        },
        
        // Submit interaction response
        async submitResponse() {
            if (!this.activeInteraction || this.submitting) return;
            
            // Get form data from store
            this.formData = Alpine.store('hitlForm').formData;
            
            // Validate if form generator is available
            const formGen = Alpine.data('formGenerator')();
            formGen.formData = this.formData;
            formGen.schema = this.formSchema;
            
            const validation = formGen.submit();
            if (!validation.valid) {
                Alpine.store('flowscript').addNotification(
                    'Please fix form errors before submitting',
                    'danger'
                );
                return;
            }
            
            this.submitting = true;
            
            try {
                // Send response via WebSocket
                if (window.wsClient && window.wsClient.isConnected()) {
                    window.wsClient.resume(
                        this.activeInteraction.executionId,
                        this.activeInteraction.nodeId,
                        validation.data
                    );
                    
                    // Mark as submitted
                    this.activeInteraction.status = 'submitted';
                    this.activeInteraction.response = validation.data;
                    this.activeInteraction.submittedAt = new Date();
                    
                    // Clear active interaction
                    this.clearActiveInteraction();
                    
                    Alpine.store('flowscript').addNotification(
                        'Response submitted successfully',
                        'success'
                    );
                } else {
                    throw new Error('WebSocket not connected');
                }
            } catch (error) {
                console.error('[HITL] Failed to submit response:', error);
                Alpine.store('flowscript').addNotification(
                    `Failed to submit response: ${error.message}`,
                    'danger'
                );
            } finally {
                this.submitting = false;
            }
        },
        
        // Cancel interaction
        cancelInteraction() {
            if (!this.activeInteraction) return;
            
            if (confirm('Are you sure you want to cancel this interaction?')) {
                this.activeInteraction.status = 'cancelled';
                this.clearActiveInteraction();
                Alpine.store('flowscript').addNotification(
                    'Interaction cancelled',
                    'info'
                );
            }
        },
        
        // Clear active interaction
        clearActiveInteraction() {
            this.activeInteraction = null;
            this.formSchema = null;
            this.formData = {};
            this.clearTimeoutTimer();
            
            // Remove from pending
            if (this.activeInteraction) {
                this.pendingInteractions = this.pendingInteractions.filter(
                    i => i.id !== this.activeInteraction.id
                );
            }
            
            // Auto-select next if available
            if (this.pendingInteractions.length > 0) {
                const next = this.pendingInteractions.find(i => i.status === 'pending');
                if (next) {
                    this.selectInteraction(next);
                }
            }
            
            this.updateStore();
        },
        
        // Start timeout timer
        startTimeoutTimer(interaction) {
            this.clearTimeoutTimer();
            
            if (!interaction.timeout) return;
            
            const endTime = interaction.timestamp.getTime() + interaction.timeout;
            
            const updateTimer = () => {
                const now = Date.now();
                const remaining = endTime - now;
                
                if (remaining <= 0) {
                    this.handleTimeout({ nodeId: interaction.nodeId });
                    this.clearTimeoutTimer();
                } else {
                    // Update UI with remaining time
                    interaction.remainingTime = Math.ceil(remaining / 1000);
                    this.timeoutTimer = setTimeout(updateTimer, 1000);
                }
            };
            
            updateTimer();
        },
        
        // Clear timeout timer
        clearTimeoutTimer() {
            if (this.timeoutTimer) {
                clearTimeout(this.timeoutTimer);
                this.timeoutTimer = null;
            }
        },
        
        // Handle timeout
        handleTimeout(data) {
            const interaction = this.pendingInteractions.find(
                i => i.nodeId === data.nodeId
            );
            
            if (interaction) {
                interaction.status = 'timeout';
                
                if (this.activeInteraction?.id === interaction.id) {
                    this.clearActiveInteraction();
                }
                
                Alpine.store('flowscript').addNotification(
                    `Interaction timeout for "${interaction.nodeName}"`,
                    'danger'
                );
                
                this.updateStore();
            }
        },
        
        // Handle resume success
        handleResumeSuccess(data) {
            console.log('[HITL] Resume successful');
            this.updateStore();
        },
        
        // Handle resume error
        handleResumeError(data) {
            console.error('[HITL] Resume error:', data);
            Alpine.store('flowscript').addNotification(
                `Failed to resume workflow: ${data.error || 'Unknown error'}`,
                'danger'
            );
        },
        
        // Check for pending interactions
        async checkPendingInteractions() {
            // This could query the API for any pending interactions
            // For now, we rely on WebSocket events
        },
        
        // Update store with current state
        updateStore() {
            const store = Alpine.store('flowscript');
            store.interactions.pending = this.pendingInteractions.filter(
                i => i.status === 'pending'
            );
            store.interactions.active = this.activeInteraction;
        },
        
        // Get interaction badge class
        getInteractionBadgeClass(interaction) {
            switch (interaction.status) {
                case 'pending':
                    return 'is-warning';
                case 'submitted':
                    return 'is-success';
                case 'cancelled':
                    return 'is-light';
                case 'timeout':
                    return 'is-danger';
                default:
                    return 'is-light';
            }
        },
        
        // Format remaining time
        formatRemainingTime(seconds) {
            if (!seconds || seconds < 0) return 'Expired';
            
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            if (hours > 0) {
                return `${hours}h ${minutes}m`;
            } else if (minutes > 0) {
                return `${minutes}m ${secs}s`;
            } else {
                return `${secs}s`;
            }
        },
        
        // Get context display
        getContextDisplay(contextData) {
            if (!contextData || Object.keys(contextData).length === 0) {
                return 'No context data';
            }
            
            return JSON.stringify(contextData, null, 2);
        }
    }));
});

// Utility functions for HITL
window.FlowScriptHITL = {
    // Create test interaction
    createTestInteraction(schema = null) {
        const testSchema = schema || {
            type: 'object',
            title: 'Test Approval',
            properties: {
                approved: {
                    type: 'boolean',
                    title: 'Approve Request?',
                    default: false
                },
                comments: {
                    type: 'string',
                    title: 'Comments',
                    format: 'textarea'
                },
                priority: {
                    type: 'string',
                    title: 'Priority',
                    enum: ['low', 'medium', 'high'],
                    enumNames: ['Low', 'Medium', 'High'],
                    default: 'medium'
                }
            },
            required: ['approved']
        };
        
        const testInteraction = {
            executionId: 'test-' + Date.now(),
            nodeId: 'test-node-' + Date.now(),
            nodeInfo: {
                name: 'Test Approval Node',
                formSchema: testSchema,
                contextData: {
                    requestor: 'John Doe',
                    amount: 1500,
                    reason: 'Team building event'
                },
                timeout: 300000 // 5 minutes
            }
        };
        
        // Emit event
        if (window.wsClient) {
            window.wsClient.emit('human_interaction_required', testInteraction);
        }
        
        return testInteraction;
    }
};