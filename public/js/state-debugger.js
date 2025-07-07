/**
 * FlowScript State Debugger
 * Provides state inspection, history navigation, and diff visualization
 */

document.addEventListener('alpine:init', () => {
    // State Debugger Component
    Alpine.data('stateDebugger', () => ({
        // State
        currentState: {},
        stateHistory: [],
        maxHistory: 100,
        selectedIndex: -1,
        compareMode: false,
        compareFromIndex: -1,
        compareToIndex: -1,
        stateDiff: null,
        autoCapture: true,
        filterPath: '',
        expandedPaths: new Set(),
        
        // Initialize
        init() {
            // Subscribe to state update events
            if (window.wsClient) {
                window.wsClient.addEventListener('state_updated', (event) => {
                    if (this.autoCapture) {
                        this.captureState(event.detail.state, 'State Update');
                    }
                });
            }
            
            // Load from store if available
            const store = Alpine.store('flowscript');
            if (store && store.debug) {
                this.currentState = store.debug.currentState || {};
                this.stateHistory = store.debug.stateHistory || [];
            }
        },
        
        // Capture current state
        captureState(state = null, label = 'Manual Capture') {
            const snapshot = {
                id: Date.now(),
                timestamp: new Date(),
                label,
                state: state || this.deepClone(this.currentState),
                size: this.calculateSize(state || this.currentState)
            };
            
            // Add to history
            this.stateHistory.unshift(snapshot);
            
            // Trim history if needed
            if (this.stateHistory.length > this.maxHistory) {
                this.stateHistory = this.stateHistory.slice(0, this.maxHistory);
            }
            
            // Update current state
            if (state) {
                this.currentState = this.deepClone(state);
            }
            
            // Update selected index
            this.selectedIndex = 0;
            
            // Update store
            this.updateStore();
            
            // Notify
            Alpine.store('flowscript').addNotification(
                `State captured: ${label}`,
                'info',
                2000
            );
        },
        
        // Select state from history
        selectState(index) {
            if (index >= 0 && index < this.stateHistory.length) {
                this.selectedIndex = index;
                this.currentState = this.deepClone(this.stateHistory[index].state);
                this.compareMode = false;
                this.stateDiff = null;
            }
        },
        
        // Toggle compare mode
        toggleCompareMode() {
            this.compareMode = !this.compareMode;
            if (this.compareMode && this.selectedIndex >= 0) {
                this.compareFromIndex = this.selectedIndex;
                this.compareToIndex = Math.max(0, this.selectedIndex - 1);
                this.computeDiff();
            } else {
                this.stateDiff = null;
            }
        },
        
        // Set compare indices
        setCompareIndices(fromIndex, toIndex) {
            this.compareFromIndex = fromIndex;
            this.compareToIndex = toIndex;
            this.computeDiff();
        },
        
        // Compute diff between two states
        computeDiff() {
            if (this.compareFromIndex < 0 || this.compareToIndex < 0) return;
            
            const fromState = this.stateHistory[this.compareFromIndex]?.state || {};
            const toState = this.stateHistory[this.compareToIndex]?.state || {};
            
            this.stateDiff = this.diffObjects(fromState, toState);
        },
        
        // Diff two objects
        diffObjects(obj1, obj2, path = '') {
            const diff = {
                added: {},
                removed: {},
                changed: {},
                unchanged: {}
            };
            
            // Check all keys in obj1
            Object.keys(obj1).forEach(key => {
                const currentPath = path ? `${path}.${key}` : key;
                
                if (!(key in obj2)) {
                    // Removed
                    diff.removed[currentPath] = obj1[key];
                } else if (this.isObject(obj1[key]) && this.isObject(obj2[key])) {
                    // Recursively diff objects
                    const subDiff = this.diffObjects(obj1[key], obj2[key], currentPath);
                    Object.assign(diff.added, subDiff.added);
                    Object.assign(diff.removed, subDiff.removed);
                    Object.assign(diff.changed, subDiff.changed);
                    Object.assign(diff.unchanged, subDiff.unchanged);
                } else if (obj1[key] !== obj2[key]) {
                    // Changed
                    diff.changed[currentPath] = {
                        from: obj1[key],
                        to: obj2[key]
                    };
                } else {
                    // Unchanged
                    diff.unchanged[currentPath] = obj1[key];
                }
            });
            
            // Check for added keys in obj2
            Object.keys(obj2).forEach(key => {
                if (!(key in obj1)) {
                    const currentPath = path ? `${path}.${key}` : key;
                    diff.added[currentPath] = obj2[key];
                }
            });
            
            return diff;
        },
        
        // Clear history
        clearHistory() {
            if (confirm('Are you sure you want to clear all state history?')) {
                this.stateHistory = [];
                this.selectedIndex = -1;
                this.compareMode = false;
                this.stateDiff = null;
                this.updateStore();
                Alpine.store('flowscript').addNotification('State history cleared', 'info');
            }
        },
        
        // Export state
        exportState(index = null) {
            const stateToExport = index !== null 
                ? this.stateHistory[index]?.state 
                : this.currentState;
                
            const dataStr = JSON.stringify(stateToExport, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `flowscript-state-${Date.now()}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            Alpine.store('flowscript').addNotification('State exported', 'success');
        },
        
        // Import state
        async importState(file) {
            try {
                const text = await file.text();
                const state = JSON.parse(text);
                this.captureState(state, 'Imported State');
                Alpine.store('flowscript').addNotification('State imported successfully', 'success');
            } catch (error) {
                Alpine.store('flowscript').addNotification('Failed to import state: ' + error.message, 'danger');
            }
        },
        
        // Render state tree
        renderStateTree(obj, path = '', level = 0) {
            if (!this.isObject(obj)) {
                return this.renderValue(obj);
            }
            
            const keys = Object.keys(obj);
            if (keys.length === 0) {
                return '<span class="has-text-grey">{ }</span>';
            }
            
            let html = '';
            keys.forEach(key => {
                const currentPath = path ? `${path}.${key}` : key;
                const value = obj[key];
                const isExpanded = this.expandedPaths.has(currentPath);
                const hasChildren = this.isObject(value) && Object.keys(value).length > 0;
                
                html += `
                    <div class="state-tree-item" style="margin-left: ${level * 20}px">
                        <span class="state-tree-key">
                            ${hasChildren ? `
                                <span class="icon is-small" 
                                      @click="togglePath('${currentPath}')"
                                      style="cursor: pointer">
                                    <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i>
                                </span>
                            ` : '<span style="width: 1rem; display: inline-block"></span>'}
                            <strong>${this.escapeHtml(key)}:</strong>
                        </span>
                        ${!hasChildren || !isExpanded ? 
                            `<span class="state-tree-value">${this.renderValue(value)}</span>` : 
                            ''
                        }
                    </div>
                    ${hasChildren && isExpanded ? 
                        `<div>${this.renderStateTree(value, currentPath, level + 1)}</div>` : 
                        ''
                    }
                `;
            });
            
            return html;
        },
        
        // Render value
        renderValue(value) {
            if (value === null) return '<span class="tag is-light">null</span>';
            if (value === undefined) return '<span class="tag is-light">undefined</span>';
            
            switch (typeof value) {
                case 'string':
                    return `<span class="has-text-success">"${this.escapeHtml(value)}"</span>`;
                case 'number':
                    return `<span class="has-text-info">${value}</span>`;
                case 'boolean':
                    return `<span class="has-text-warning">${value}</span>`;
                case 'object':
                    if (Array.isArray(value)) {
                        return `<span class="has-text-grey">[${value.length} items]</span>`;
                    }
                    return `<span class="has-text-grey">{${Object.keys(value).length} props}</span>`;
                default:
                    return `<span class="has-text-grey">${typeof value}</span>`;
            }
        },
        
        // Toggle path expansion
        togglePath(path) {
            if (this.expandedPaths.has(path)) {
                this.expandedPaths.delete(path);
            } else {
                this.expandedPaths.add(path);
            }
        },
        
        // Filter state by path
        filterState(state, filterPath) {
            if (!filterPath) return state;
            
            const paths = filterPath.split('.').filter(p => p);
            let current = state;
            
            for (const path of paths) {
                if (current && typeof current === 'object' && path in current) {
                    current = current[path];
                } else {
                    return undefined;
                }
            }
            
            return current;
        },
        
        // Get filtered state
        get filteredState() {
            return this.filterState(this.currentState, this.filterPath);
        },
        
        // Utility functions
        deepClone(obj) {
            return JSON.parse(JSON.stringify(obj));
        },
        
        isObject(obj) {
            return obj !== null && typeof obj === 'object';
        },
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        
        calculateSize(obj) {
            const str = JSON.stringify(obj);
            return new Blob([str]).size;
        },
        
        formatSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        },
        
        formatTimestamp(date) {
            return new Date(date).toLocaleString();
        },
        
        // Update store
        updateStore() {
            const store = Alpine.store('flowscript');
            if (store && store.debug) {
                store.debug.currentState = this.currentState;
                store.debug.stateHistory = this.stateHistory;
            }
        }
    }));
    
    // Add to store
    Alpine.store('flowscript').addStateSnapshot = function(state, label) {
        // Emit event for state debugger
        if (window.wsClient) {
            window.wsClient.emit('state_updated', { state });
        }
    };
});

// Export utilities
window.FlowScriptStateDebugger = {
    // Create test state
    createTestState() {
        return {
            workflow: {
                id: 'test-workflow',
                status: 'running',
                startTime: new Date().toISOString()
            },
            variables: {
                counter: 42,
                message: 'Hello, World!',
                items: ['apple', 'banana', 'orange'],
                user: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    roles: ['admin', 'user']
                }
            },
            execution: {
                currentNode: 'process-data',
                completedNodes: ['start', 'fetch-data'],
                errors: []
            }
        };
    }
};