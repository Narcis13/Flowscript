/**
 * Simple API test script
 */

import { startServer } from './rest/server';

async function testAPI() {
  console.log('Starting FlowScript API test...\n');
  
  // Start the server
  await startServer(3000);
  
  console.log('\nAPI is running!');
  console.log('\nExample requests:');
  console.log('1. List workflows:');
  console.log('   curl http://localhost:3000/workflows\n');
  
  console.log('2. Execute a workflow:');
  console.log('   curl -X POST http://localhost:3000/workflows/simple-approval/execute \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"input": {"requestId": "REQ-123", "amount": 150}}\'\n');
  
  console.log('3. Check execution status:');
  console.log('   curl http://localhost:3000/executions/{executionId}/status\n');
  
  console.log('4. Resume a paused execution:');
  console.log('   curl -X POST http://localhost:3000/executions/{executionId}/resume \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"nodeId": "node-id", "data": {"decision": "approved", "comment": "Looks good"}}\'\n');
  
  console.log('Press Ctrl+C to stop the server.');
}

// Run the test
if (require.main === module) {
  testAPI().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}