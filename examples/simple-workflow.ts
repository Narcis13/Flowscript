/**
 * Simple example workflow demonstrating the executor
 */

import { WorkflowDefinition } from '../src/core/types/workflow';
import { WorkflowExecutor } from '../src/core/executor';
import { getNodeRegistry } from '../src/nodes/registry';
import '../src/nodes/actions'; // Import action nodes
import '../src/nodes/controls'; // Import control nodes

// Create a simple workflow
const simpleWorkflow: WorkflowDefinition = {
  id: 'simple-example',
  name: 'Simple Example Workflow',
  initialState: {
    count: 0,
    items: [1, 2, 3, 4, 5]
  },
  elements: [
    // This workflow uses the actual node implementations from the spec
    // but we need to adapt to the current implementation structure
  ]
};

// Example: Increment counter workflow
async function runIncrementExample() {
  console.log('=== Running Increment Example ===');
  
  // Register nodes
  const registry = getNodeRegistry();
  
  // Create a simple increment workflow
  const workflow: WorkflowDefinition = {
    id: 'increment-test',
    name: 'Increment Test',
    initialState: { count: 0 },
    elements: [
      // Note: In the current implementation, nodes are actual Node objects
      // not string references as in the spec
    ]
  };

  const executor = new WorkflowExecutor(workflow);
  const result = await executor.execute();
  
  console.log('Workflow completed:', result.completed);
  console.log('Final state:', result.state);
}

// Example: Branch workflow
async function runBranchExample() {
  console.log('\n=== Running Branch Example ===');
  
  const workflow: WorkflowDefinition = {
    id: 'branch-test',
    name: 'Branch Test',
    initialState: { 
      value: 10,
      result: null
    },
    elements: [
      // Branch structure example
    ]
  };

  const executor = new WorkflowExecutor(workflow);
  const result = await executor.execute();
  
  console.log('Workflow completed:', result.completed);
  console.log('Final state:', result.state);
}

// Example: Loop workflow
async function runLoopExample() {
  console.log('\n=== Running Loop Example ===');
  
  const workflow: WorkflowDefinition = {
    id: 'loop-test',
    name: 'Loop Test',
    initialState: { 
      items: [1, 2, 3, 4, 5],
      sum: 0
    },
    elements: [
      // Loop structure example
    ]
  };

  const executor = new WorkflowExecutor(workflow);
  const result = await executor.execute();
  
  console.log('Workflow completed:', result.completed);
  console.log('Final state:', result.state);
}

// Run examples
if (require.main === module) {
  (async () => {
    try {
      await runIncrementExample();
      await runBranchExample();
      await runLoopExample();
    } catch (error) {
      console.error('Example failed:', error);
    }
  })();
}