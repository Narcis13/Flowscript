# FlowScript Frontend Refactoring Plan (AlpineJS + Bulma)

## Overview

This document outlines the refactoring plan for the existing AlpineJS and Bulma CSS frontend to address current limitations and improve functionality, particularly for HITL support and WebSocket handling.

## Current Issues to Address

### 1. Critical Issues
- **WebSocket Race Conditions**: Events missed due to subscription timing
- **HITL Not Implemented**: No form rendering or interaction handling
- **State Debugger Non-functional**: Missing diff viewer and history

### 2. Major Issues
- **Error Handling**: Limited recovery and retry mechanisms
- **Event Handling**: Some handlers not properly connected
- **Performance**: No pagination or virtualization for large datasets

### 3. Minor Issues
- **Code Organization**: JavaScript files could be better structured
- **Type Safety**: No TypeScript or JSDoc type annotations
- **Testing**: No frontend tests

## Refactoring Strategy

### Phase 1: Fix Critical WebSocket Issues
1. **Pre-execution Subscription**
   - Modify workflow execution to subscribe before starting
   - Add event buffering on the server side
   - Implement acknowledgment protocol

2. **Connection Management**
   - Enhance reconnection logic with state recovery
   - Add connection health monitoring
   - Implement message queuing with persistence

### Phase 2: Implement HITL Support
1. **JSON Schema Form Rendering**
   - Create dynamic form generator using AlpineJS
   - Support all JSON Schema types and validation
   - Add custom UI hints support

2. **Interaction Flow**
   - Handle form submission and validation
   - Implement timeout countdown
   - Add notification system for pending interactions

### Phase 3: Enhance State Management
1. **State Debugger**
   - Implement state diff viewer
   - Add state history navigation
   - Create state export/import functionality

2. **Execution Context**
   - Track execution state more granularly
   - Add execution history
   - Implement state rollback capability

### Phase 4: Improve Error Handling
1. **API Error Recovery**
   - Add retry logic with exponential backoff
   - Implement fallback strategies
   - Better error messaging and user feedback

2. **WebSocket Error Handling**
   - Handle connection errors gracefully
   - Add automatic recovery mechanisms
   - Implement offline mode detection

### Phase 5: Performance Optimizations
1. **Virtual Scrolling**
   - Implement for event logs
   - Add lazy loading for timeline
   - Optimize DOM updates

2. **Data Management**
   - Add pagination for large datasets
   - Implement event log pruning
   - Cache frequently accessed data

## Implementation Details

### 1. WebSocket Manager Refactoring

```javascript
// Enhanced WebSocket manager with pre-subscription and buffering
class EnhancedWebSocketManager extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.messageBuffer = [];
    this.subscriptions = new Map();
    this.pendingAcks = new Map();
    this.connectionId = null;
  }

  // Pre-subscribe to execution before it starts
  preSubscribe(executionId) {
    this.subscriptions.set(executionId, {
      status: 'pending',
      bufferedEvents: []
    });
    return this.waitForSubscriptionConfirmation(executionId);
  }

  // Wait for server confirmation with timeout
  async waitForSubscriptionConfirmation(executionId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Subscription timeout'));
      }, timeout);

      this.once(`subscription.confirmed.${executionId}`, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
```

### 2. HITL Form Generator

```javascript
// Dynamic form generator for JSON Schema
Alpine.data('formGenerator', () => ({
  schema: null,
  formData: {},
  errors: {},

  generateForm(schema, uiSchema = {}) {
    // Implementation using AlpineJS directives
    return this.buildFormElement(schema, '', uiSchema);
  },

  buildFormElement(schema, path, uiSchema) {
    switch (schema.type) {
      case 'object':
        return this.buildObjectField(schema, path, uiSchema);
      case 'array':
        return this.buildArrayField(schema, path, uiSchema);
      case 'string':
        return this.buildStringField(schema, path, uiSchema);
      case 'number':
      case 'integer':
        return this.buildNumberField(schema, path, uiSchema);
      case 'boolean':
        return this.buildBooleanField(schema, path, uiSchema);
      default:
        return this.buildDefaultField(schema, path, uiSchema);
    }
  }
}));
```

### 3. State Debugger Enhancement

```javascript
// Enhanced state debugger with diff and history
Alpine.store('stateDebugger', {
  history: [],
  currentIndex: -1,
  maxHistory: 100,

  addState(state, metadata = {}) {
    const snapshot = {
      state: JSON.parse(JSON.stringify(state)),
      timestamp: Date.now(),
      metadata
    };

    // Trim history if at max
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }

    this.history.push(snapshot);
    this.currentIndex = this.history.length - 1;
  },

  getDiff(fromIndex, toIndex) {
    const from = this.history[fromIndex]?.state;
    const to = this.history[toIndex]?.state;
    return this.computeDiff(from, to);
  },

  computeDiff(obj1, obj2, path = '') {
    // Recursive diff implementation
    const diff = {};
    // ... implementation
    return diff;
  }
});
```

### 4. Error Handling System

```javascript
// Centralized error handling with recovery
Alpine.store('errorHandler', {
  errors: [],
  retryQueue: new Map(),

  handle(error, context = {}) {
    const errorEntry = {
      id: Date.now(),
      error,
      context,
      timestamp: new Date(),
      retryCount: 0
    };

    this.errors.push(errorEntry);

    // Determine if retryable
    if (this.isRetryable(error)) {
      this.scheduleRetry(errorEntry);
    }

    // Notify user
    this.notifyUser(errorEntry);
  },

  async retry(errorId) {
    const entry = this.retryQueue.get(errorId);
    if (!entry) return;

    entry.retryCount++;
    
    try {
      await entry.retryFn();
      this.retryQueue.delete(errorId);
    } catch (error) {
      if (entry.retryCount < 3) {
        this.scheduleRetry(entry);
      } else {
        this.handleFatalError(entry);
      }
    }
  }
});
```

### 5. Performance Optimization

```javascript
// Virtual scrolling for large lists
Alpine.directive('virtual-scroll', (el, { expression }, { evaluate }) => {
  const items = evaluate(expression);
  const itemHeight = 50; // Configurable
  const viewportHeight = el.clientHeight;
  const totalHeight = items.length * itemHeight;
  
  // Create virtual viewport
  const viewport = document.createElement('div');
  viewport.style.height = `${totalHeight}px`;
  viewport.style.position = 'relative';
  
  // Render only visible items
  const renderVisibleItems = () => {
    const scrollTop = el.scrollTop;
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.ceil((scrollTop + viewportHeight) / itemHeight);
    
    // Render items in range
    // ... implementation
  };
  
  el.addEventListener('scroll', renderVisibleItems);
  renderVisibleItems();
});
```

## File Structure Changes

```
frontend/
├── js/
│   ├── core/
│   │   ├── websocket-enhanced.js    # Enhanced WebSocket manager
│   │   ├── error-handler.js         # Centralized error handling
│   │   └── event-bus.js            # Event communication
│   ├── components/
│   │   ├── form-generator.js       # HITL form generator
│   │   ├── state-debugger.js       # State debugging tools
│   │   ├── workflow-executor.js    # Refactored executor
│   │   └── event-monitor.js        # Event monitoring
│   ├── utils/
│   │   ├── diff.js                 # Diff algorithms
│   │   ├── validators.js           # Data validators
│   │   └── formatters.js           # Data formatters
│   └── app.js                      # Main application
├── css/
│   ├── app.css                     # Main styles
│   └── components/                 # Component-specific styles
└── index.html                      # Updated HTML
```

## Testing Strategy

### 1. Unit Tests
- Use Jest for JavaScript testing
- Test critical functions like form generation, diff computation
- Mock WebSocket connections

### 2. Integration Tests
- Test WebSocket communication flow
- Test form submission and validation
- Test error recovery mechanisms

### 3. E2E Tests
- Use Cypress for end-to-end testing
- Test complete workflow execution
- Test HITL interactions

## Migration Steps

1. **Backup Current Frontend**
   - Create a copy of the current frontend
   - Document current functionality

2. **Incremental Refactoring**
   - Refactor one component at a time
   - Maintain backward compatibility
   - Test each change thoroughly

3. **Feature Flags**
   - Use feature flags for new functionality
   - Allow gradual rollout
   - Easy rollback if issues arise

## Success Metrics

- **WebSocket Reliability**: 99.9% message delivery
- **HITL Response Time**: < 200ms form rendering
- **Error Recovery**: 95% automatic recovery rate
- **Performance**: 60fps scrolling with 10k+ events
- **User Satisfaction**: Reduced error reports by 80%

## Timeline

- **Week 1**: WebSocket fixes and HITL implementation
- **Week 2**: State debugger and error handling
- **Week 3**: Performance optimizations and testing
- **Week 4**: Documentation and deployment