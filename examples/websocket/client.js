/**
 * Example WebSocket client for FlowScript
 * 
 * This demonstrates how to connect to the FlowScript WebSocket server
 * and interact with workflow executions in real-time.
 */

const WebSocket = require('ws');
const readline = require('readline');

class FlowScriptClient {
  constructor(url = 'ws://localhost:3000/ws') {
    this.url = url;
    this.ws = null;
    this.clientId = null;
    this.subscriptions = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${this.url}...`);
      
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('Connected to FlowScript WebSocket server');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`Disconnected: ${code} - ${reason}`);
        this.cleanup();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      // Send ping every 30 seconds to keep connection alive
      this.pingInterval = setInterval(() => {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping', data: {} });
        }
      }, 30000);
    });
  }

  handleMessage(message) {
    console.log('\n📨 Received:', JSON.stringify(message, null, 2));

    switch (message.type) {
      case 'connected':
        this.clientId = message.data.clientId;
        console.log(`✅ Client ID: ${this.clientId}`);
        break;

      case 'human_interaction_required':
        this.handleHumanInteraction(message.data);
        break;

      case 'workflow_completed':
        console.log(`✅ Workflow ${message.data.executionId} completed`);
        break;

      case 'workflow_failed':
        console.log(`❌ Workflow ${message.data.executionId} failed:`, message.data.error);
        break;

      case 'node_started':
        console.log(`⚡ Node started: ${message.data.nodeName} in ${message.data.executionId}`);
        break;

      case 'node_completed':
        console.log(`✅ Node completed: ${message.data.nodeName} -> ${message.data.edge}`);
        break;
    }
  }

  async handleHumanInteraction(data) {
    console.log('\n🤝 Human interaction required!');
    console.log(`Execution: ${data.executionId}`);
    console.log(`Node: ${data.nodeInfo.name}`);
    
    if (data.nodeInfo.formSchema) {
      console.log('Form schema:', JSON.stringify(data.nodeInfo.formSchema, null, 2));
    }

    if (data.nodeInfo.contextData) {
      console.log('Context:', JSON.stringify(data.nodeInfo.contextData, null, 2));
    }

    // In a real application, you would display a form based on the schema
    // For this example, we'll use readline for simple input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\nEnter your response (or type "skip" to skip):');
    
    rl.question('Decision (approve/reject/request_info): ', (decision) => {
      rl.question('Comment: ', (comment) => {
        rl.close();

        if (decision !== 'skip') {
          this.resumeExecution(data.executionId, data.nodeId, {
            decision,
            comment
          });
        }
      });
    });
  }

  subscribe(executionId) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    this.send({
      type: 'subscribe',
      data: { executionId }
    });

    this.subscriptions.add(executionId);
    console.log(`📡 Subscribed to execution: ${executionId}`);
  }

  unsubscribe(executionId) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    this.send({
      type: 'unsubscribe',
      data: { executionId }
    });

    this.subscriptions.delete(executionId);
    console.log(`🔕 Unsubscribed from execution: ${executionId}`);
  }

  resumeExecution(executionId, nodeId, data) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected');
      return;
    }

    this.send({
      type: 'resume',
      data: {
        executionId,
        nodeId,
        data
      }
    });

    console.log(`▶️ Resumed execution: ${executionId} at node: ${nodeId}`);
  }

  send(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
    }
  }

  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.subscriptions.clear();
  }
}

// Example usage
async function main() {
  const client = new FlowScriptClient();

  try {
    await client.connect();

    // Example: Subscribe to an execution
    // Replace with an actual execution ID from your workflow
    // client.subscribe('exec-123456789-abc');

    // Keep the client running
    console.log('\n💡 Client is running. Press Ctrl+C to exit.');
    console.log('To subscribe to an execution, use: client.subscribe("exec-id")');
    
    // Make client available in REPL for testing
    const repl = require('repl');
    const replServer = repl.start('> ');
    replServer.context.client = client;

  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  if (global.client) {
    global.client.disconnect();
  }
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { FlowScriptClient };