# FlowScript Frontend Architecture Redesign

## Overview

This document outlines the new frontend architecture for FlowScript, addressing current limitations and providing a scalable, maintainable solution for workflow execution and human-in-the-loop interactions.

## Technology Stack

### Core Framework
- **React 18+** with TypeScript for component-based architecture
- **Vite** for fast development and optimized builds
- **React Router** for navigation
- **Zustand** for lightweight state management
- **React Query** for server state and caching

### UI & Styling
- **Tailwind CSS** for utility-first styling
- **Headless UI** for accessible components
- **React Hook Form** for form handling
- **React JSON Schema Form** for dynamic HITL forms

### Real-time Communication
- **Custom WebSocket hooks** with reconnection logic
- **Event-driven architecture** with typed events
- **Optimistic updates** for better UX

### Visualization
- **React Flow** for workflow graph visualization
- **Recharts** for metrics and analytics
- **Monaco Editor** for JSON editing

### Development Tools
- **TypeScript** for type safety
- **ESLint & Prettier** for code quality
- **Vitest** for unit testing
- **Playwright** for E2E testing
- **Storybook** for component development

## Architecture Principles

### 1. Separation of Concerns
- **Smart/Container Components**: Handle logic and state
- **Dumb/Presentational Components**: Pure UI rendering
- **Custom Hooks**: Reusable business logic
- **Services**: API and WebSocket communication
- **Utils**: Helper functions and constants

### 2. Type Safety
- Full TypeScript coverage
- Shared types between frontend and backend
- Runtime validation with Zod
- Type-safe WebSocket events

### 3. Performance First
- Code splitting and lazy loading
- Virtual scrolling for large lists
- Memoization for expensive computations
- Optimistic UI updates

### 4. Developer Experience
- Hot module replacement
- Clear error boundaries
- Comprehensive logging
- Component documentation

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── common/         # Shared UI components
│   │   ├── workflow/       # Workflow-specific components
│   │   ├── hitl/          # Human-in-the-loop components
│   │   └── monitoring/     # Monitoring & debugging
│   ├── hooks/              # Custom React hooks
│   │   ├── useWebSocket.ts
│   │   ├── useWorkflow.ts
│   │   └── useNotifications.ts
│   ├── services/           # API and WebSocket services
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   └── workflow.ts
│   ├── store/              # Zustand stores
│   │   ├── workflowStore.ts
│   │   ├── executionStore.ts
│   │   └── uiStore.ts
│   ├── types/              # TypeScript definitions
│   │   ├── workflow.ts
│   │   ├── events.ts
│   │   └── api.ts
│   ├── utils/              # Utility functions
│   ├── pages/              # Route components
│   └── App.tsx            # Main app component
├── public/                 # Static assets
├── tests/                  # Test files
└── package.json

## Key Components

### 1. WebSocket Manager
```typescript
interface WebSocketManager {
  connect(): void;
  disconnect(): void;
  subscribe(executionId: string): void;
  unsubscribe(executionId: string): void;
  send(message: WebSocketMessage): void;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}
```

### 2. Workflow Executor
```typescript
interface WorkflowExecutor {
  loadWorkflow(workflow: WorkflowDefinition): void;
  execute(initialState?: any): Promise<string>;
  pause(executionId: string): void;
  resume(executionId: string, data: any): void;
  stop(executionId: string): void;
}
```

### 3. HITL Form Renderer
```typescript
interface HITLFormRenderer {
  renderForm(schema: JSONSchema, uiSchema?: UISchema): ReactElement;
  handleSubmit(data: any): void;
  validateData(data: any): ValidationResult;
}
```

### 4. State Debugger
```typescript
interface StateDebugger {
  currentState: any;
  history: StateSnapshot[];
  diff(from: number, to: number): StateDiff;
  jumpTo(index: number): void;
  export(): void;
}
```

## State Management

### Global State Structure
```typescript
interface AppState {
  // UI State
  ui: {
    theme: 'light' | 'dark';
    activeTab: string;
    notifications: Notification[];
    isLoading: boolean;
  };
  
  // Workflow State
  workflows: {
    available: WorkflowDefinition[];
    selected: WorkflowDefinition | null;
    isExecuting: boolean;
  };
  
  // Execution State
  executions: {
    active: Map<string, Execution>;
    history: Execution[];
    timeline: TimelineEvent[];
  };
  
  // WebSocket State
  connection: {
    status: 'connected' | 'disconnected' | 'connecting';
    reconnectAttempts: number;
    lastError: Error | null;
  };
  
  // HITL State
  hitl: {
    pending: HITLRequest[];
    active: HITLRequest | null;
    responses: Map<string, any>;
  };
}
```

## Component Architecture

### 1. Layout Components
- `AppShell`: Main layout with navigation
- `TabLayout`: Tab-based content switching
- `Sidebar`: Workflow library and tools
- `Header`: Connection status and controls

### 2. Workflow Components
- `WorkflowList`: Browse available workflows
- `WorkflowEditor`: JSON editor with validation
- `WorkflowUploader`: Drag-and-drop upload
- `WorkflowGraph`: Visual representation

### 3. Execution Components
- `ExecutionTimeline`: Real-time node progress
- `ExecutionControls`: Play/pause/stop buttons
- `ExecutionStatus`: Current state display
- `ExecutionHistory`: Past executions list

### 4. HITL Components
- `HITLNotification`: Pending interaction alert
- `HITLForm`: Dynamic form renderer
- `HITLQueue`: List of pending interactions
- `HITLTimeout`: Countdown timer

### 5. Monitoring Components
- `EventLog`: Real-time event stream
- `StateViewer`: Current state inspector
- `StateDiff`: State change visualizer
- `MetricsPanel`: Performance metrics

## WebSocket Protocol Enhancement

### Connection Flow
1. **Pre-execution subscription**: Subscribe before starting workflow
2. **Event buffering**: Server buffers events for late subscribers
3. **Acknowledgment**: Client confirms receipt of critical events
4. **Heartbeat**: Regular ping/pong for connection health

### Event Types
```typescript
type WebSocketEvent =
  | { type: 'connection.established'; clientId: string }
  | { type: 'subscription.confirmed'; executionId: string }
  | { type: 'execution.started'; executionId: string; workflowId: string }
  | { type: 'node.executing'; nodeId: string; nodeName: string }
  | { type: 'node.completed'; nodeId: string; edge: string; data: any }
  | { type: 'hitl.required'; request: HITLRequest }
  | { type: 'hitl.timeout'; nodeId: string }
  | { type: 'execution.completed'; result: any }
  | { type: 'execution.failed'; error: Error }
  | { type: 'state.updated'; patch: StatePatch }
  | { type: 'metrics.update'; metrics: Metrics };
```

## Implementation Phases

### Phase 1: Core Setup (Week 1)
- Set up Vite + React + TypeScript project
- Configure Tailwind CSS and build tools
- Create basic routing and layout
- Implement type definitions

### Phase 2: WebSocket Foundation (Week 1)
- Build robust WebSocket client
- Implement reconnection logic
- Create event handling system
- Add connection status UI

### Phase 3: Workflow Management (Week 2)
- Create workflow list and loader
- Implement JSON editor with validation
- Add workflow upload functionality
- Build execution controls

### Phase 4: Execution Monitoring (Week 2)
- Implement execution timeline
- Create event log viewer
- Add state inspector
- Build metrics display

### Phase 5: HITL Implementation (Week 3)
- Create JSON Schema form renderer
- Implement interaction queue
- Add timeout handling
- Build notification system

### Phase 6: Advanced Features (Week 3)
- Add workflow visualization
- Implement state diffing
- Create execution history
- Add performance monitoring

### Phase 7: Testing & Polish (Week 4)
- Write unit tests
- Create E2E tests
- Add error boundaries
- Implement loading states

## Migration Strategy

1. **Parallel Development**: Build new frontend alongside existing
2. **Feature Parity**: Ensure all current features work
3. **Gradual Rollout**: Test with subset of users
4. **Fallback Option**: Keep old frontend available
5. **Data Migration**: Preserve user preferences

## Performance Targets

- **Initial Load**: < 3 seconds
- **WebSocket Connection**: < 1 second
- **Workflow Execution Start**: < 500ms
- **Event Processing**: < 100ms
- **Form Rendering**: < 200ms
- **State Updates**: < 50ms

## Security Considerations

- **Input Validation**: Sanitize all user inputs
- **XSS Protection**: Use React's built-in protections
- **CORS Configuration**: Restrict API access
- **WebSocket Authentication**: Add token-based auth
- **Rate Limiting**: Prevent abuse

## Future Enhancements

1. **Collaboration Features**
   - Multi-user workflow editing
   - Real-time cursor tracking
   - Comments and annotations

2. **Advanced Visualization**
   - 3D workflow graphs
   - Execution heatmaps
   - Performance profiling

3. **AI Integration**
   - Workflow recommendations
   - Intelligent error recovery
   - Predictive monitoring

4. **Mobile Support**
   - Responsive design
   - Touch gestures
   - Offline capability