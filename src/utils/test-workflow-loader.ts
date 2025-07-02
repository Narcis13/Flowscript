/**
 * Test script for WorkflowLoader
 */

import { createWorkflowLoader, WorkflowLoader } from './WorkflowLoader';
import * as path from 'path';

async function testWorkflowLoader() {
  console.log('=== Testing WorkflowLoader ===\n');

  // Create loader instance
  const loader = createWorkflowLoader({
    baseDir: path.join(process.cwd(), 'workflows')
  });

  // 1. List all workflows
  console.log('1. Listing all workflow files:');
  const files = await loader.listWorkflows();
  files.forEach(file => console.log(`   - ${file}`));
  console.log();

  // 2. Load a specific workflow
  console.log('2. Loading hello-world workflow:');
  try {
    const result = await loader.loadWorkflow('examples/hello-world.json');
    console.log(`   ✓ Loaded: ${result.workflow.name}`);
    console.log(`   - ID: ${result.workflow.id}`);
    console.log(`   - Nodes: ${result.workflow.nodes.length}`);
    console.log(`   - Valid: ${result.validation?.valid}`);
  } catch (error: any) {
    console.error(`   ✗ Error: ${error.error?.message || error.message}`);
  }
  console.log();

  // 3. Load all workflows from examples directory
  console.log('3. Loading all workflows from examples directory:');
  const { workflows, errors } = await loader.loadDirectory('examples');
  
  console.log(`   Found ${workflows.length} valid workflows:`);
  workflows.forEach(w => {
    console.log(`   - ${w.workflow.id}: ${w.workflow.name}`);
  });

  if (errors.length > 0) {
    console.log(`   Found ${errors.length} errors:`);
    errors.forEach(e => {
      console.log(`   - ${e.filePath}: ${e.type} error`);
    });
  }
  console.log();

  // 4. Validate a workflow
  console.log('4. Validating a workflow structure:');
  const testWorkflow = {
    id: 'test-validation',
    name: 'Test Validation',
    initialState: {},
    nodes: [
      'node1',
      ['condition', { 'true': 'node2', 'false': 'node3' }]
    ]
  };

  const validation = WorkflowLoader.validateWorkflow(testWorkflow);
  console.log(`   Valid: ${validation.valid}`);
  if (!validation.valid) {
    console.log(`   Errors: ${validation.errors?.errors.length}`);
  }
  console.log();

  // 5. Test invalid workflow
  console.log('5. Testing invalid workflow:');
  const invalidWorkflow = {
    // Missing required fields
    nodes: ['node1']
  };

  const invalidValidation = WorkflowLoader.validateWorkflow(invalidWorkflow);
  console.log(`   Valid: ${invalidValidation.valid}`);
  if (!invalidValidation.valid) {
    console.log('   Errors:');
    invalidValidation.errors?.errors.forEach((err: any) => {
      console.log(`   - ${err.path.join('.')}: ${err.message}`);
    });
  }
}

// Run the test
if (require.main === module) {
  testWorkflowLoader().catch(console.error);
}