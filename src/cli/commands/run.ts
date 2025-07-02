import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkflowExecutor } from '../../core/executor/WorkflowExecutor';
import { registerAllNodes } from '../../nodes/registerAll';
import { WorkflowDefinition } from '../../core/types';
import WebSocket from 'ws';

interface RunOptions {
  input?: string;
  watch?: boolean;
}

export async function runCommand(workflowPath: string, options: RunOptions) {
  try {
    // Resolve workflow path
    const resolvedPath = path.resolve(workflowPath);
    
    // Check if file exists
    await fs.access(resolvedPath);
    
    // Read workflow file
    const workflowContent = await fs.readFile(resolvedPath, 'utf-8');
    const workflow: WorkflowDefinition = JSON.parse(workflowContent);
    
    console.log(`🚀 Running workflow: ${workflow.id || path.basename(workflowPath)}`);
    
    // Parse initial input if provided
    let initialInput = {};
    if (options.input) {
      try {
        initialInput = JSON.parse(options.input);
      } catch (e) {
        console.error('❌ Invalid JSON input provided');
        process.exit(1);
      }
    }
    
    // Register all nodes
    registerAllNodes();
    
    // Create executor
    const executor = new WorkflowExecutor(workflow);
    
    // Set up WebSocket connection if watch mode is enabled
    let ws: WebSocket | null = null;
    if (options.watch) {
      console.log('👀 Watch mode enabled - connecting to WebSocket server...');
      ws = new WebSocket('ws://localhost:3001');
      
      ws.on('open', () => {
        console.log('✅ Connected to WebSocket server');
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'human_interaction_required') {
          console.log('\n🤚 Human interaction required:');
          console.log(`   Node: ${message.nodeInfo.name}`);
          console.log(`   Context: ${JSON.stringify(message.nodeInfo.contextData, null, 2)}`);
          console.log('\n   Use the API or UI to resume this workflow');
        }
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
      });
    }
    
    // Execute workflow
    const startTime = Date.now();
    const result = await executor.execute({ initialState: { ...workflow.initialState, ...initialInput } });
    const duration = Date.now() - startTime;
    
    // Close WebSocket if connected
    if (ws) {
      ws.close();
    }
    
    // Display results
    console.log(`\n✅ Workflow completed in ${duration}ms`);
    console.log('\n📊 Final State:');
    console.log(JSON.stringify(result.state, null, 2));
    
    // Events are handled via WebSocket if watch mode is enabled
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}