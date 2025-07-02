/**
 * FlowScript - A declarative workflow system for orchestrating complex processes
 * with human-in-the-loop capabilities
 */

export const VERSION = '0.1.0';

// Core exports
export * from './core';
export * from './nodes';

// API exports
export * from './api';

// Convenience function to start the API server
export { startServer as startAPIServer } from './api/rest/server';

// Export main types for users
export type { 
  Node,
  EdgeMap,
  ExecutionContext 
} from './core/types';

export type {
  WorkflowDefinition,
  FlowElement,
  BranchMap,
  LoopController
} from './core/types/workflow';

// CLI mode detection
if (require.main === module) {
  console.log(`FlowScript v${VERSION} - Starting API Server...`);
  
  // Load environment variables
  const port = parseInt(process.env.PORT || '3000', 10);
  
  // Import and start server
  import('./api/rest/server').then(({ startServer }) => {
    startServer(port).catch(error => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
  });
}