# FlowScript Workflow Execution Chain

This document provides a detailed explanation of how FlowScript workflows are executed, from JSON definition to runtime execution.

## Overview

FlowScript follows a multi-stage process to execute workflows:

1. **Workflow Definition** (JSON) → 
2. **Workflow Loading & Validation** → 
3. **Node Registration & Discovery** → 
4. **Workflow Execution** → 
5. **Node Execution** → 
6. **State Management** → 
7. **Event Emission & Human Interaction**

## 1. Workflow Definition (JSON)

Workflows are defined as JSON documents with the following structure:

```json
{
  "id": "workflow-unique-id",
  "name": "Human Readable Workflow Name",
  "initialState": {
    "variable1": "value1",
    "counter": 0
  },
  "nodes": [
    "simpleNode",
    { "nodeWithConfig": { "param": "value" } },
    [
      "conditionNode",
      {
        "branch1": ["node1", "node2"],
        "branch2": "node3",
        "default": null
      }
    ],
    [
      { "forEach": { "items": "state.list", "as": "currentItem" } },
      ["processItem", "updateProgress"]
    ]
  ]
}
```

### Key Concepts:

- **FlowElement**: The building blocks of workflows
  - Simple string: `"nodeName"`
  - Node with config: `{ "nodeName": { config } }`
  - Branch structure: `[ConditionNode, BranchMap]`
  - Loop structure: `[LoopController, NodeSequence]`

## 2. Workflow Loading & Validation

The `WorkflowLoader` class handles loading workflows from the file system:

```typescript
// src/utils/WorkflowLoader.ts
const loader = new WorkflowLoader({ baseDir: './workflows' });
const result = await loader.loadWorkflow('my-workflow.json');
```

### Process:
1. **Read JSON file** from disk
2. **Parse JSON** content
3. **Validate** against Zod schema (`WorkflowDefinitionSchema`)
4. **Cache** the loaded workflow
5. Return `LoadResult` with workflow and validation status

### Validation ensures:
- Required fields are present (id, nodes)
- Node structures are valid
- Branch and loop structures follow correct syntax

## 3. Node Registration & Discovery

All nodes must be registered before workflows can execute them.

### Node Registration Process:

```typescript
// src/nodes/registerAll.ts
export function registerAllNodes(): void {
  const registry = getNodeRegistry();
  
  // Register action nodes
  registry.registerInstance(validateData);
  registry.registerInstance(httpRequest);
  
  // Register control nodes  
  registry.registerInstance(whileCondition);
  registry.registerInstance(forEach);
  
  // Register human nodes
  registry.registerInstance(approveExpense);
  registry.registerInstance(formInput);
}
```

### Node Registry (`NodeRegistry`):
- Singleton pattern for global access
- Stores nodes by name in a Map
- Indexes nodes by type (action, human, control)
- Provides factory functions to create node instances

### Node Structure:
```typescript
interface Node {
  metadata: {
    name: string;           // Unique identifier
    description: string;    
    type?: 'action' | 'human' | 'control';
    ai_hints: {
      purpose: string;
      when_to_use: string;
      expected_edges: string[];
    };
  };
  execute(context: ExecutionContext): Promise<EdgeMap>;
}
```

## 4. Workflow Execution

The `WorkflowExecutor` class orchestrates the entire execution:

```typescript
// src/core/executor/WorkflowExecutor.ts
const executor = new WorkflowExecutor(workflow);
const result = await executor.execute({
  initialState: { customData: true }
});
```

### Execution Flow:

1. **Initialize Execution**:
   - Generate unique `executionId`
   - Create `StateManager` with initial state
   - Create `RuntimeContext` for event handling

2. **Execute Flow Elements**:
   ```typescript
   private async executeFlow(
     elements: FlowElement[],
     state: StateManager,
     runtime: RuntimeContext
   ): Promise<ExecutionResult>
   ```
   - Iterate through elements with program counter (pc)
   - Handle each element type appropriately

3. **Element Type Handling**:

   **a) Simple Node**:
   - Resolve node from registry
   - Execute node
   - Handle special edges (exit, loopTo:)

   **b) Branch Structure** `[condition, branches]`:
   - Execute condition node
   - Get edge name from result
   - Execute matching branch
   - Continue to next element

   **c) Loop Structure** `[controller, body]`:
   - Execute controller node
   - If `next_iteration`: execute body, repeat
   - If `exit_loop`: break and continue

## 5. Node Execution

Individual nodes are executed within the workflow:

```typescript
private async executeNode(
  node: Node,
  state: StateManager,
  runtime: RuntimeContext
): Promise<{ edge?: string; data?: any }>
```

### Process:

1. **Generate Node ID**: Unique identifier for this execution
2. **Set Current Node**: Update runtime context
3. **Emit NODE_EXECUTING Event**
4. **Create Execution Context**:
   ```typescript
   const context: ExecutionContext = {
     state,      // StateManager instance
     config,     // Node-specific config from workflow
     runtime     // RuntimeContext for events/pausing
   };
   ```
5. **Execute Node**: Call `node.execute(context)`
6. **Handle Edge Map**:
   - Get first edge name
   - Evaluate lazy data function
   - Update state if needed
7. **Emit NODE_COMPLETED Event**
8. **Return Edge Result**

### Node Config Resolution:
When a node has configuration:
```json
{ "httpRequest": { "url": "https://api.example.com", "method": "GET" } }
```

The executor:
1. Extracts config object
2. Interpolates template variables using current state
3. Merges with execution context
4. Passes to node's execute method

## 6. State Management

The `StateManager` provides centralized state handling:

```typescript
// src/core/state/StateManager.ts
class StateManager {
  get(path: string): any         // JSONPath-like access
  set(path: string, value: any)  // Set specific value
  update(updates: object)         // Merge updates
  getState(): object             // Full state snapshot
}
```

### Features:
- **JSONPath Support**: `state.get('$.user.name')` or `state.get('user.name')`
- **Deep Cloning**: Prevents unintended mutations
- **Array Support**: `state.get('items[0].name')`
- **Hooks**: Before/after update callbacks
- **Path Parsing**: Handles dot and bracket notation

### State Flow:
1. Nodes read state: `const data = state.get('$.inputData')`
2. Nodes update state via edge data:
   ```typescript
   return {
     success: () => ({ processedCount: 10 })
   };
   ```
3. Executor merges edge data into state
4. Next node sees updated state

## 7. Event System & Human Interaction

### Event Emission

The `RuntimeContext` emits events throughout execution:

```typescript
runtime.emit({
  event: WorkflowEvent.NODE_EXECUTING,
  workflowId: 'workflow-id',
  executionId: 'exec-123',
  timestamp: Date.now(),
  data: { nodeId, nodeName }
});
```

### Event Types:
- `STARTED`: Workflow begins
- `NODE_EXECUTING`: Node starts
- `NODE_COMPLETED`: Node finishes
- `NODE_FAILED`: Node errors
- `WORKFLOW_PAUSED`: Human interaction needed
- `WORKFLOW_RESUMED`: Execution continues
- `WORKFLOW_COMPLETED`: All done
- `WORKFLOW_FAILED`: Fatal error

### Human-in-the-Loop (HITL)

Human nodes pause execution:

```typescript
// In human node execute method:
runtime.emit({
  event: 'human_interaction_required',
  nodeInfo: { formSchema, contextData }
});

const pauseToken = runtime.pause();
const response = await runtime.waitForResume(pauseToken);
```

### HITL Flow:
1. **Human Node Executes**
2. **Emit Event** with form schema
3. **Create PauseToken**
4. **Workflow Pauses**
5. **External System** (API/WebSocket) shows UI
6. **User Submits** data
7. **Resume Called** with token ID and data
8. **Node Continues** with user input
9. **Return Edge** based on user action

## Complete Execution Example

Let's trace a simple workflow execution:

```json
{
  "id": "example-flow",
  "initialState": { "count": 0 },
  "nodes": [
    "initialize",
    [
      "checkCount",
      {
        "low": { "incrementCounter": { "amount": 5 } },
        "high": "finish"
      }
    ],
    "logResult"
  ]
}
```

### Execution Steps:

1. **Load Workflow**: WorkflowLoader reads and validates JSON
2. **Register Nodes**: All nodes registered in NodeRegistry
3. **Create Executor**: `new WorkflowExecutor(workflow)`
4. **Initialize**:
   - ExecutionId: `exec-1234567890-abc`
   - State: `{ count: 0 }`
   - Runtime context created
5. **Execute "initialize"**:
   - Resolve from registry
   - Execute with context
   - Returns: `{ success: () => ({ initialized: true }) }`
   - State becomes: `{ count: 0, initialized: true }`
6. **Execute Branch**:
   - Execute "checkCount" condition
   - Returns: `{ low: () => ({}) }` (because count is 0)
   - Execute "low" branch
7. **Execute "incrementCounter"**:
   - Config: `{ amount: 5 }`
   - Reads current count: 0
   - Returns: `{ success: () => ({ count: 5 }) }`
   - State becomes: `{ count: 5, initialized: true }`
8. **Execute "logResult"**:
   - Logs final state
   - Returns: `{ success: () => ({}) }`
9. **Workflow Complete**:
   - Final state: `{ count: 5, initialized: true }`
   - Emit WORKFLOW_COMPLETED event

## Key Design Principles

1. **Lazy Evaluation**: Edge data functions prevent unnecessary computation
2. **Immutable State**: Deep cloning prevents side effects
3. **Event-Driven**: All actions emit events for monitoring
4. **Type Safety**: TypeScript interfaces ensure correctness
5. **Extensibility**: Easy to add new node types
6. **Human-First**: HITL is a core feature, not an afterthought

## Error Handling

Errors are handled at multiple levels:

1. **Node Level**: Try-catch in execute methods
2. **Executor Level**: Catch and emit NODE_FAILED events
3. **Workflow Level**: Emit WORKFLOW_FAILED on fatal errors
4. **Validation Level**: Prevent invalid workflows from executing

This multi-layered approach ensures robust error handling and debugging capabilities throughout the execution chain.