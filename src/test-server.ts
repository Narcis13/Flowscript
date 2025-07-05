/**
 * Test server with static file serving
 */

import { startFullServer } from './api/server';

async function main() {
  console.log('Starting FlowScript server with static file serving...\n');
  
  try {
    const port = parseInt(process.env.PORT || '3013', 10);
    await startFullServer(port);
    
    console.log('\nServer is ready! Test the following:');
    console.log(`1. Open http://localhost:${port} to see the web interface`);
    console.log(`2. Check http://localhost:${port}/api for API info`);
    console.log(`3. Test http://localhost:${port}/health for health check`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();