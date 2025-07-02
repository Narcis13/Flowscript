/**
 * Human-in-the-Loop Demo with WebSocket
 * 
 * This example demonstrates:
 * 1. Starting a workflow that requires human approval
 * 2. Receiving real-time notifications via WebSocket
 * 3. Submitting human input through WebSocket
 */

import WebSocket from 'ws';
import axios from 'axios';

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

class HITLDemo {
  private ws: WebSocket | null = null;
  private executionId: string | null = null;

  async run() {
    console.log('🚀 Starting Human-in-the-Loop Demo\n');

    // Step 1: Connect to WebSocket
    await this.connectWebSocket();

    // Step 2: Start a workflow that requires human approval
    await this.startWorkflow();

    // The WebSocket will receive events and handle human interactions
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('📡 Connecting to WebSocket...');
      
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log('✅ WebSocket connected\n');
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
      });
    });
  }

  private async startWorkflow() {
    console.log('📋 Starting expense approval workflow...');

    try {
      // First, let's create a simple expense approval workflow
      const workflow = {
        id: 'expense-approval-demo',
        initialState: {
          expense: {
            amount: 1500,
            description: 'Team offsite dinner',
            submittedBy: 'john.doe@company.com',
            date: new Date().toISOString()
          },
          approved: false
        },
        nodes: [
          'validateExpense',
          {
            approveExpense: {
              requiredApprover: 'manager@company.com'
            }
          },
          'processPayment'
        ]
      };

      // Start the workflow execution
      const response = await axios.post(
        `${API_URL}/workflows/${workflow.id}/execute`,
        { 
          initialInput: workflow.initialState 
        }
      );

      this.executionId = response.data.executionId;
      console.log(`✅ Workflow started: ${this.executionId}\n`);

      // Subscribe to execution events
      this.subscribeToExecution(this.executionId);

    } catch (error: any) {
      console.error('❌ Failed to start workflow:', error.message);
    }
  }

  private subscribeToExecution(executionId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'subscribe',
      data: { executionId }
    };

    this.ws.send(JSON.stringify(message));
    console.log(`📡 Subscribed to execution: ${executionId}\n`);
  }

  private handleWebSocketMessage(message: any) {
    console.log(`\n📨 Event: ${message.type}`);
    console.log('Data:', JSON.stringify(message.data, null, 2));

    switch (message.type) {
      case 'connected':
        console.log(`✅ Connected with client ID: ${message.data.clientId}`);
        break;

      case 'subscribed':
        console.log(`✅ Successfully subscribed to ${message.data.executionId}`);
        break;

      case 'workflow_started':
        console.log(`⚡ Workflow started at ${new Date(message.timestamp).toLocaleTimeString()}`);
        break;

      case 'node_started':
        console.log(`⚡ Node "${message.data.nodeName}" started`);
        break;

      case 'node_completed':
        console.log(`✅ Node "${message.data.nodeName}" completed with edge: ${message.data.edge}`);
        break;

      case 'human_interaction_required':
        this.handleHumanInteraction(message.data);
        break;

      case 'workflow_paused':
        console.log(`⏸️  Workflow paused at node: ${message.data.nodeId}`);
        break;

      case 'workflow_resumed':
        console.log(`▶️  Workflow resumed`);
        break;

      case 'workflow_completed':
        console.log(`\n🎉 Workflow completed successfully!`);
        console.log('Final state:', message.data.finalState);
        this.cleanup();
        break;

      case 'workflow_failed':
        console.log(`\n❌ Workflow failed: ${message.data.error}`);
        this.cleanup();
        break;
    }
  }

  private async handleHumanInteraction(data: any) {
    console.log('\n🤝 HUMAN INTERACTION REQUIRED!');
    console.log('─'.repeat(50));
    
    const { executionId, nodeId, nodeInfo } = data;
    
    console.log(`Node: ${nodeInfo.name}`);
    console.log(`Execution: ${executionId}`);
    
    if (nodeInfo.contextData) {
      console.log('\nContext:');
      console.log(`  Expense Amount: $${nodeInfo.contextData.expense?.amount}`);
      console.log(`  Description: ${nodeInfo.contextData.expense?.description}`);
      console.log(`  Submitted By: ${nodeInfo.contextData.expense?.submittedBy}`);
    }

    console.log('\n📝 Simulating manager approval in 3 seconds...');
    
    // Simulate manager reviewing and approving
    setTimeout(() => {
      this.submitHumanInput(executionId, nodeId, {
        decision: 'approve',
        comment: 'Approved for Q4 team building budget',
        approvedBy: 'manager@company.com',
        timestamp: new Date().toISOString()
      });
    }, 3000);
  }

  private submitHumanInput(executionId: string, nodeId: string, data: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    console.log(`\n📤 Submitting human input...`);
    console.log(`Decision: ${data.decision}`);
    console.log(`Comment: ${data.comment}`);

    const message = {
      type: 'resume',
      data: {
        executionId,
        nodeId,
        data
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  private cleanup() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Exit after a short delay to see final messages
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run the demo
async function main() {
  const demo = new HITLDemo();
  
  try {
    await demo.run();
  } catch (error) {
    console.error('Demo failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  process.exit(0);
});

if (require.main === module) {
  main();
}

export { HITLDemo };