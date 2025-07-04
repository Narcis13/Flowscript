import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { WorkflowExecutor } from '../../core/executor/WorkflowExecutor';
import { registerAllNodes } from '../../nodes/registerAll';
import { WorkflowDefinition } from '../../core/types';
import { promptForInput, formatContextData, substituteTemplates } from '../utils/interactive';

interface RunInteractiveOptions {
  input?: string;
  port?: number;
  timeout?: number;
}

export async function runInteractiveCommand(workflowPath: string, options: RunInteractiveOptions) {
  try {
    // Resolve workflow path
    const resolvedPath = path.resolve(workflowPath);
    
    // Check if file exists
    await fs.access(resolvedPath);
    
    // Read workflow file
    const workflowContent = await fs.readFile(resolvedPath, 'utf-8');
    const workflow: WorkflowDefinition = JSON.parse(workflowContent);
    
    console.log(`🚀 Running workflow interactively: ${workflow.id || path.basename(workflowPath)}`);
    console.log('   Interactive mode enabled - will prompt for human interactions\n');
    
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
    
    // Create event emitter for workflow events
    const eventEmitter = new EventEmitter();
    
    // Create executor with event emitter
    const executor = new WorkflowExecutor(workflow, { eventEmitter });
    
    // Set up event listeners
    eventEmitter.on('workflow:started', () => {
      console.log('🏁 Workflow started\n');
    });
    
    eventEmitter.on('node:executing', (event: any) => {
      console.log(`⚙️  Executing: ${event.data?.nodeName || 'unknown'}`);
    });
    
    eventEmitter.on('node:completed', (event: any) => {
      if (event.data?.edge && event.data.edge !== 'default') {
        console.log(`   ↳ Completed with edge: ${event.data.edge}\n`);
      }
    });
    
    eventEmitter.on('workflow:completed', () => {
      console.log('\n✅ Workflow completed successfully');
    });
    
    eventEmitter.on('workflow:error', (event: any) => {
      console.error('\n❌ Workflow error:', event.data?.error || event.error);
    });
    
    // Handle human interaction events
    eventEmitter.on('human:input:required', async (event: any) => {
      console.log('\n🤚 Human interaction required:');
      console.log(`   Node: ${event.data?.nodeName || 'unknown'}`);
      
      const nodeData = event.data || {};
      if (nodeData.contextData && Object.keys(nodeData.contextData).length > 0) {
        console.log('   Context:');
        console.log(formatContextData(nodeData.contextData, 6));
      }
      
      try {
        // Get UI hints and substitute templates
        const uiHints = nodeData.uiHints || {};
        const contextData = nodeData.contextData || {};
        
        // Create state object for template substitution
        const stateForTemplates = { state: contextData };
        
        const title = uiHints.title ? substituteTemplates(uiHints.title, stateForTemplates) : undefined;
        const description = uiHints.description ? substituteTemplates(uiHints.description, stateForTemplates) : undefined;
        
        if (uiHints.cancelLabel) {
          console.log(`\n   Press Ctrl+C to ${uiHints.cancelLabel}`);
        }
        
        // Get pause token ID from event data
        const pauseTokenId = nodeData.tokenId;
        
        // Get the runtime context to resume
        const runtime = executor.getRuntimeContext();
        if (runtime && pauseTokenId) {
          // Create a promise to wait for user input
          const inputPromise = promptForInput(
            nodeData.formSchema,
            title,
            description,
            nodeData.defaultValues,
            stateForTemplates
          );
          
          // Handle the input when received
          inputPromise.then((response) => {
            runtime.resume(pauseTokenId, response);
          }).catch((error) => {
            if (error instanceof Error && error.message.includes('force closed')) {
              console.log('\n❌ Interaction cancelled by user');
              runtime.resume(pauseTokenId, { _cancelled: true });
            } else {
              console.error('❌ Error during interaction:', error);
              runtime.resume(pauseTokenId, { _error: error.message });
            }
          });
        }
        
      } catch (error) {
        console.error('❌ Error setting up interaction:', error);
      }
    });
    
    // Execute workflow
    const startTime = Date.now();
    
    const result = await executor.execute({ 
      initialState: { ...workflow.initialState, ...initialInput },
      timeout: options.timeout
    });
    
    const duration = Date.now() - startTime;
    
    // Display results
    console.log(`\n⏱️  Execution time: ${duration}ms`);
    console.log('\n📊 Final State:');
    console.log(JSON.stringify(result.state, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Store the original handler
let originalSigintHandler: NodeJS.SignalsListener | undefined;

// Handle Ctrl+C gracefully for our command
export function setupInteractiveHandlers() {
  // Store original handler if it exists
  const listeners = process.listeners('SIGINT');
  if (listeners.length > 0) {
    originalSigintHandler = listeners[0] as NodeJS.SignalsListener;
    process.removeAllListeners('SIGINT');
  }
  
  process.on('SIGINT', () => {
    console.log('\n\n⚠️  Interrupted - exiting...');
    
    // Restore original handler
    if (originalSigintHandler) {
      process.removeAllListeners('SIGINT');
      process.on('SIGINT', originalSigintHandler);
    }
    
    process.exit(0);
  });
}

// Call setup when module loads
setupInteractiveHandlers();