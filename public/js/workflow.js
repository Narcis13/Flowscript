/**
 * FlowScript Workflow Executor Component
 * Enhanced UI functionality for workflow execution
 */

// ===========================
// Workflow Executor Component
// ===========================
document.addEventListener('alpine:init', () => {
    Alpine.data('workflowExecutor', () => ({
        // Component state
        uploadedWorkflow: null,
        jsonEditorContent: '',
        jsonEditorVisible: false,
        uploading: false,
        uploadError: null,
        executionTimeline: [],
        activeNodes: new Set(),
        completedNodes: new Set(),
        failedNodes: new Set(),
        
        // File upload handling
        handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            if (!file.name.endsWith('.json')) {
                this.uploadError = 'Please select a JSON file';
                this.notify('Invalid file type. Please select a JSON file.', 'danger');
                return;
            }
            
            this.uploading = true;
            this.uploadError = null;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const workflow = JSON.parse(content);
                    
                    // Validate workflow structure - FlowScript format
                    if (!workflow.id || !workflow.nodes) {
                        throw new Error('Invalid workflow structure');
                    }
                    
                    this.uploadedWorkflow = workflow;
                    this.jsonEditorContent = JSON.stringify(workflow, null, 2);
                    
                    // Add to workflows list
                    this.store.workflows.available.push({
                        id: workflow.id,
                        name: workflow.name,
                        description: workflow.description || 'Uploaded workflow',
                        source: 'upload'
                    });
                    
                    // Select the uploaded workflow
                    this.selectedWorkflow = workflow.id;
                    
                    this.notify(`Workflow "${workflow.name}" uploaded successfully`, 'success');
                } catch (error) {
                    this.uploadError = `Failed to parse workflow: ${error.message}`;
                    this.notify(this.uploadError, 'danger');
                }
                
                this.uploading = false;
            };
            
            reader.onerror = () => {
                this.uploadError = 'Failed to read file';
                this.notify(this.uploadError, 'danger');
                this.uploading = false;
            };
            
            reader.readAsText(file);
        },
        
        // Toggle JSON editor
        toggleJsonEditor() {
            this.jsonEditorVisible = !this.jsonEditorVisible;
            
            if (this.jsonEditorVisible && !this.jsonEditorContent) {
                // Initialize with template
                this.jsonEditorContent = JSON.stringify({
                    id: 'custom-workflow',
                    name: 'Custom Workflow',
                    initialState: {},
                    nodes: []
                }, null, 2);
            }
        },
        
        // Validate and apply JSON editor content
        applyJsonEditor() {
            try {
                const workflow = JSON.parse(this.jsonEditorContent);
                
                // Validate workflow structure - FlowScript format
                if (!workflow.id || !workflow.nodes) {
                    throw new Error('Invalid workflow structure. Required fields: id, nodes');
                }
                
                // Check if workflow already exists
                const existingIndex = this.store.workflows.available.findIndex(w => w.id === workflow.id);
                if (existingIndex >= 0) {
                    // Update existing
                    this.store.workflows.available[existingIndex] = {
                        id: workflow.id,
                        name: workflow.name,
                        description: workflow.description || 'Edited workflow',
                        source: 'editor'
                    };
                } else {
                    // Add new
                    this.store.workflows.available.push({
                        id: workflow.id,
                        name: workflow.name,
                        description: workflow.description || 'Created in editor',
                        source: 'editor'
                    });
                }
                
                // Store the full workflow
                this.uploadedWorkflow = workflow;
                
                // Select the workflow
                this.selectedWorkflow = workflow.id;
                
                this.notify(`Workflow "${workflow.name}" saved from editor`, 'success');
                this.jsonEditorVisible = false;
            } catch (error) {
                this.notify(`JSON Error: ${error.message}`, 'danger');
            }
        },
        
        // Format JSON in editor
        formatJsonEditor() {
            try {
                const workflow = JSON.parse(this.jsonEditorContent);
                this.jsonEditorContent = JSON.stringify(workflow, null, 2);
            } catch (error) {
                this.notify('Cannot format invalid JSON', 'danger');
            }
        },
        
        // Download current workflow
        downloadWorkflow() {
            const workflow = this.getSelectedWorkflowData();
            if (!workflow) {
                this.notify('No workflow selected', 'warning');
                return;
            }
            
            const filename = `${workflow.id}-${Date.now()}.json`;
            window.FlowScriptUtils.downloadJSON(workflow, filename);
            this.notify(`Downloaded ${filename}`, 'success');
        },
        
        // Get selected workflow data
        getSelectedWorkflowData() {
            if (!this.selectedWorkflow) return null;
            
            // Check if it's an uploaded/edited workflow
            if (this.uploadedWorkflow && this.uploadedWorkflow.id === this.selectedWorkflow) {
                return this.uploadedWorkflow;
            }
            
            // Otherwise, it should be available from the server
            return null; // Server will handle it
        },
        
        // Enhanced execution with timeline
        async executeWorkflowEnhanced() {
            // Clear previous timeline
            this.executionTimeline = [];
            this.activeNodes.clear();
            this.completedNodes.clear();
            this.failedNodes.clear();
            
            // Add initial timeline event
            this.addTimelineEvent({
                type: 'workflow_start',
                message: 'Workflow execution initiated',
                timestamp: new Date(),
                status: 'active'
            });
            
            // Call original execute method
            await this.executeWorkflow();
        },
        
        // Add timeline event
        addTimelineEvent(event) {
            this.executionTimeline.unshift({
                id: Date.now() + Math.random(),
                ...event
            });
            
            // Limit timeline size
            if (this.executionTimeline.length > 100) {
                this.executionTimeline = this.executionTimeline.slice(0, 100);
            }
        },
        
        // Update node status
        updateNodeStatus(nodeId, status) {
            // Remove from all sets first
            this.activeNodes.delete(nodeId);
            this.completedNodes.delete(nodeId);
            this.failedNodes.delete(nodeId);
            
            // Add to appropriate set
            switch (status) {
                case 'active':
                    this.activeNodes.add(nodeId);
                    break;
                case 'completed':
                    this.completedNodes.add(nodeId);
                    break;
                case 'failed':
                    this.failedNodes.add(nodeId);
                    break;
            }
        },
        
        // Get node status class
        getNodeStatusClass(nodeId) {
            if (this.activeNodes.has(nodeId)) return 'is-warning';
            if (this.completedNodes.has(nodeId)) return 'is-success';
            if (this.failedNodes.has(nodeId)) return 'is-danger';
            return 'is-light';
        },
        
        // Enhanced pause with state capture
        async pauseWorkflowEnhanced() {
            if (!this.executionId) return;
            
            try {
                const response = await fetch(`/executions/${this.executionId}/pause`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.addTimelineEvent({
                        type: 'workflow_pause',
                        message: 'Workflow paused',
                        timestamp: new Date(),
                        status: 'warning',
                        data: data.state
                    });
                    
                    // Update state snapshot
                    this.store.addStateSnapshot(data.state, 'Workflow paused');
                    
                    this.notify('Workflow paused successfully', 'warning');
                } else {
                    throw new Error('Failed to pause workflow');
                }
            } catch (error) {
                console.error('Pause error:', error);
                this.notify('Failed to pause workflow', 'danger');
            }
        },
        
        // Enhanced stop with cleanup
        async stopWorkflowEnhanced() {
            if (!this.executionId) return;
            
            if (!confirm('Are you sure you want to stop this workflow? This action cannot be undone.')) {
                return;
            }
            
            try {
                const response = await fetch(`/executions/${this.executionId}/stop`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    this.addTimelineEvent({
                        type: 'workflow_stop',
                        message: 'Workflow stopped by user',
                        timestamp: new Date(),
                        status: 'danger'
                    });
                    
                    this.store.workflows.executing = false;
                    this.store.workflows.executionId = null;
                    
                    // Clear node states
                    this.activeNodes.clear();
                    
                    this.notify('Workflow stopped', 'danger');
                } else {
                    throw new Error('Failed to stop workflow');
                }
            } catch (error) {
                console.error('Stop error:', error);
                this.notify('Failed to stop workflow', 'danger');
            }
        },
        
        // Resume workflow
        async resumeWorkflow() {
            if (!this.executionId) return;
            
            try {
                const response = await fetch(`/executions/${this.executionId}/resume`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    this.addTimelineEvent({
                        type: 'workflow_resume',
                        message: 'Workflow resumed',
                        timestamp: new Date(),
                        status: 'active'
                    });
                    
                    this.notify('Workflow resumed', 'success');
                } else {
                    throw new Error('Failed to resume workflow');
                }
            } catch (error) {
                console.error('Resume error:', error);
                this.notify('Failed to resume workflow', 'danger');
            }
        },
        
        // Get execution status
        async getExecutionStatus() {
            if (!this.executionId) return;
            
            try {
                const response = await fetch(`/executions/${this.executionId}/status`);
                if (response.ok) {
                    const status = await response.json();
                    return status;
                }
            } catch (error) {
                console.error('Failed to get execution status:', error);
            }
            return null;
        },
        
        // Clear execution
        clearExecution() {
            this.executionTimeline = [];
            this.activeNodes.clear();
            this.completedNodes.clear();
            this.failedNodes.clear();
            this.executionEvents = [];
            this.store.workflows.executionId = null;
            this.store.workflows.executing = false;
        },
        
        // Initialize component
        init() {
            // Ensure we have access to the parent component's properties
            this.selectedWorkflow = this.$root.selectedWorkflow || '';
            this.initialState = this.$root.initialState || '{}';
            this.executionEvents = this.$root.executionEvents || [];
            this.executionId = this.$root.executionId || null;
            this.executing = this.$root.executing || false;
            this.store = this.$root.store || Alpine.store('flowscript');
            this.notify = this.$root.notify || ((msg, type) => console.log(msg));
            
            // Listen for WebSocket events
            if (window.wsClient) {
                window.wsClient.addEventListener('node_started', (event) => {
                    if (event.detail.executionId === this.executionId) {
                        this.updateNodeStatus(event.detail.nodeId, 'active');
                        this.addTimelineEvent({
                            type: 'node_start',
                            message: `Node "${event.detail.nodeName}" started`,
                            timestamp: new Date(),
                            status: 'active',
                            nodeId: event.detail.nodeId
                        });
                    }
                });
                
                window.wsClient.addEventListener('node_completed', (event) => {
                    if (event.detail.executionId === this.executionId) {
                        this.updateNodeStatus(event.detail.nodeId, 'completed');
                        this.addTimelineEvent({
                            type: 'node_complete',
                            message: `Node "${event.detail.nodeName}" completed`,
                            timestamp: new Date(),
                            status: 'success',
                            nodeId: event.detail.nodeId
                        });
                    }
                });
                
                window.wsClient.addEventListener('node_failed', (event) => {
                    if (event.detail.executionId === this.executionId) {
                        this.updateNodeStatus(event.detail.nodeId, 'failed');
                        this.addTimelineEvent({
                            type: 'node_fail',
                            message: `Node "${event.detail.nodeName}" failed: ${event.detail.error}`,
                            timestamp: new Date(),
                            status: 'danger',
                            nodeId: event.detail.nodeId,
                            error: event.detail.error
                        });
                    }
                });
                
                window.wsClient.addEventListener('workflow_completed', (event) => {
                    if (event.detail.executionId === this.executionId) {
                        this.addTimelineEvent({
                            type: 'workflow_complete',
                            message: 'Workflow completed successfully',
                            timestamp: new Date(),
                            status: 'success'
                        });
                        // Update execution status
                        this.store.workflows.executing = false;
                        this.notify('Workflow completed successfully', 'success');
                    }
                });
                
                window.wsClient.addEventListener('workflow_failed', (event) => {
                    if (event.detail.executionId === this.executionId) {
                        this.addTimelineEvent({
                            type: 'workflow_fail',
                            message: `Workflow failed: ${event.detail.error}`,
                            timestamp: new Date(),
                            status: 'danger',
                            error: event.detail.error
                        });
                        // Update execution status
                        this.store.workflows.executing = false;
                        this.notify(`Workflow failed: ${event.detail.error}`, 'danger');
                    }
                });
            }
        }
    }));
});

// ===========================
// Example Workflows
// ===========================
const EXAMPLE_WORKFLOWS = {
    simple: {
        id: 'example-simple-sequential',
        name: 'Simple Sequential Workflow',
        description: 'A basic workflow that executes nodes in sequence',
        definition: {
            initialState: {
                message: 'Hello, FlowScript!'
            },
            workflow: [
                {
                    id: 'log-start',
                    type: 'log',
                    name: 'Log Start',
                    config: {
                        message: 'Starting workflow with message: ${state.message}'
                    }
                },
                {
                    id: 'transform',
                    type: 'transform',
                    name: 'Transform Message',
                    config: {
                        transformations: {
                            message: '${state.message.toUpperCase()}',
                            timestamp: '${new Date().toISOString()}'
                        }
                    }
                },
                {
                    id: 'log-end',
                    type: 'log',
                    name: 'Log End',
                    config: {
                        message: 'Completed with: ${state.message} at ${state.timestamp}'
                    }
                }
            ]
        }
    },
    
    expenseApproval: {
        id: 'example-expense-approval',
        name: 'Expense Approval Workflow',
        description: 'HITL workflow for expense approval process',
        definition: {
            initialState: {
                expense: {
                    amount: 1500,
                    description: 'Team building dinner',
                    category: 'Entertainment',
                    submittedBy: 'John Doe',
                    date: '2024-01-15'
                }
            },
            workflow: [
                {
                    id: 'check-amount',
                    type: 'condition',
                    name: 'Check Expense Amount',
                    config: {
                        condition: '${state.expense.amount > 1000}'
                    }
                },
                {
                    type: 'branch',
                    branches: {
                        true: [
                            {
                                id: 'manager-approval',
                                type: 'human',
                                name: 'Manager Approval Required',
                                config: {
                                    prompt: 'High-value expense requires manager approval',
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            approved: {
                                                type: 'boolean',
                                                title: 'Approve expense?'
                                            },
                                            comments: {
                                                type: 'string',
                                                title: 'Comments'
                                            }
                                        },
                                        required: ['approved']
                                    },
                                    timeout: 3600 // 1 hour
                                }
                            }
                        ],
                        false: [
                            {
                                id: 'auto-approve',
                                type: 'transform',
                                name: 'Auto-approve Low Amount',
                                config: {
                                    transformations: {
                                        'expense.approved': true,
                                        'expense.approvedBy': 'System',
                                        'expense.approvalDate': '${new Date().toISOString()}'
                                    }
                                }
                            }
                        ]
                    }
                },
                {
                    id: 'notify-result',
                    type: 'log',
                    name: 'Notify Result',
                    config: {
                        message: 'Expense ${state.expense.approved ? "approved" : "rejected"}'
                    }
                }
            ]
        }
    }
};

// Load example workflows on init
document.addEventListener('alpine:init', () => {
    // Add example workflows to the store after a delay
    setTimeout(() => {
        if (window.Alpine && window.Alpine.store('flowscript')) {
            const store = window.Alpine.store('flowscript');
            
            // Add examples if no workflows loaded
            if (store.workflows.available.length === 0) {
                Object.values(EXAMPLE_WORKFLOWS).forEach(workflow => {
                    store.workflows.available.push({
                        id: workflow.id,
                        name: workflow.name,
                        description: workflow.description,
                        source: 'example'
                    });
                });
                
                console.log('Loaded example workflows');
            }
        }
    }, 1000);
});

// Export for debugging
window.FLOWSCRIPT_EXAMPLES = EXAMPLE_WORKFLOWS;