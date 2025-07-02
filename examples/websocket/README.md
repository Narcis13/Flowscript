# FlowScript WebSocket Examples

This directory contains examples demonstrating how to use the FlowScript WebSocket API for real-time workflow monitoring and human-in-the-loop interactions.

## Prerequisites

1. Start the FlowScript server:
```bash
npm run dev
```

2. The server will start on `http://localhost:3000` with WebSocket endpoint at `ws://localhost:3000/ws`

## Examples

### 1. Basic WebSocket Client (`client.js`)

A Node.js WebSocket client that demonstrates:
- Connecting to the FlowScript WebSocket server
- Subscribing to workflow executions
- Receiving real-time events
- Handling human interaction requests
- Interactive REPL for testing

**Usage:**
```bash
node client.js
```

Once connected, you can use the REPL to interact with the server:
```javascript
// Subscribe to an execution
> client.subscribe('exec-123456789-abc')

// Unsubscribe from an execution
> client.unsubscribe('exec-123456789-abc')

// Resume a paused execution
> client.resumeExecution('exec-123', 'node-456', { decision: 'approve' })
```

### 2. Human-in-the-Loop Demo (`hitl-demo.ts`)

A complete example that demonstrates:
- Starting a workflow that requires human approval
- Receiving real-time notifications via WebSocket
- Automatically submitting human input through WebSocket
- Full workflow lifecycle from start to completion

**Usage:**
```bash
# Compile TypeScript (if needed)
npx tsc hitl-demo.ts

# Run the demo
node hitl-demo.js
```

## WebSocket Protocol

### Client → Server Messages

1. **Subscribe to execution**
```json
{
  "type": "subscribe",
  "data": {
    "executionId": "exec-123"
  }
}
```

2. **Resume paused execution**
```json
{
  "type": "resume",
  "data": {
    "executionId": "exec-123",
    "nodeId": "node-456",
    "data": {
      "decision": "approve",
      "comment": "Looks good"
    }
  }
}
```

3. **Ping (keep-alive)**
```json
{
  "type": "ping",
  "data": {}
}
```

### Server → Client Messages

1. **Workflow Events**
- `workflow_started`
- `node_started`
- `node_completed`
- `node_failed`
- `workflow_paused`
- `workflow_resumed`
- `workflow_completed`
- `workflow_failed`

2. **Human Interaction Required**
```json
{
  "type": "human_interaction_required",
  "data": {
    "executionId": "exec-123",
    "nodeId": "node-456",
    "nodeInfo": {
      "name": "approveExpense",
      "formSchema": { /* JSON Schema */ },
      "contextData": { /* Current state data */ }
    }
  },
  "timestamp": 1234567890
}
```

## Building Your Own Client

To build your own WebSocket client:

1. Connect to `ws://localhost:3000/ws`
2. Handle the `connected` message to get your client ID
3. Subscribe to executions you want to monitor
4. Handle incoming events based on your needs
5. Send `resume` messages to complete human interactions
6. Implement ping/pong for connection health

## Tips

- The server sends a heartbeat ping every 30 seconds
- Subscriptions are per-execution, not global
- Human interactions have optional timeouts
- All messages include timestamps for ordering
- The connection manager handles reconnection logic