/**
 * Hono REST API Server
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { WorkflowStorage, ExecutionManager } from '../services';

// Import routes
import { createExecuteRoute } from './routes/execute';
import { createStatusRoute } from './routes/status';
import { createResumeRoute } from './routes/resume';

/**
 * Create and configure the Hono app
 */
export function createApp(): Hono {
  const app = new Hono();

  // Middleware
  app.use('*', cors());
  app.use('*', logger());

  // Error handling
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    
    console.error('Unhandled error:', err);
    return c.json(
      {
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Unknown error'
      },
      500
    );
  });

  // Health check
  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // API info
  app.get('/api', (c) => {
    return c.json({
      name: 'FlowScript API',
      version: '0.1.0',
      endpoints: {
        health: 'GET /health',
        workflows: {
          list: 'GET /workflows',
          execute: 'POST /workflows/:workflowId/execute'
        },
        executions: {
          list: 'GET /executions',
          status: 'GET /executions/:executionId/status',
          resume: 'POST /executions/:executionId/resume'
        }
      }
    });
  });

  // Workflow endpoints
  app.get('/workflows', (c) => {
    const storage = WorkflowStorage.getInstance();
    const workflowIds = storage.getAllWorkflowIds();
    
    return c.json({
      workflows: workflowIds.map(id => {
        const workflow = storage.getWorkflow(id);
        return {
          id: workflow?.id,
          name: workflow?.name || id
        };
      })
    });
  });

  // Execution endpoints
  app.get('/executions', (c) => {
    const manager = ExecutionManager.getInstance();
    const executions = manager.getAllExecutions();
    
    return c.json({
      executions: executions.map(exec => ({
        executionId: exec.executionId,
        workflowId: exec.workflowId,
        status: exec.status,
        startTime: new Date(exec.startTime).toISOString(),
        endTime: exec.endTime ? new Date(exec.endTime).toISOString() : undefined
      }))
    });
  });

  // Mount routes
  app.route('/workflows/:workflowId/execute', createExecuteRoute());
  app.route('/executions/:executionId/status', createStatusRoute());
  app.route('/executions/:executionId/resume', createResumeRoute());

  return app;
}

/**
 * Start the server
 */
export async function startServer(port: number = 3000): Promise<void> {
  // Initialize services
  const storage = WorkflowStorage.getInstance();
  storage.loadExampleWorkflows();
  
  // Create app
  const app = createApp();
  
  console.log(`FlowScript API Server starting on port ${port}...`);
  console.log(`Server running at http://localhost:${port}`);
  
  // For Hono with Node.js adapter
  const { serve } = await import('@hono/node-server');
  serve({
    fetch: app.fetch,
    port
  });
}