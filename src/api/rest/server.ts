/**
 * Hono REST API Server
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { WorkflowStorage, ExecutionManager } from '../services';
import * as fs from 'fs';
import * as path from 'path';

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
  app.use('*', cors({
    origin: ['http://localhost:3013', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3013'],
    credentials: true
  }));
  app.use('*', logger());

  // Serve static files from public directory
  // Note: serveStatic needs to come after specific routes to avoid conflicts
  
  // First, serve the root specifically
  app.get('/', (c) => {
    // Manually serve the index.html
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    
    try {
      const html = fs.readFileSync(indexPath, 'utf-8');
      return c.html(html);
    } catch (error) {
      console.error('Error serving index.html:', error);
      return c.text('Welcome to FlowScript API', 404);
    }
  });

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
          name: workflow?.name || id,
          description: '', // WorkflowDefinition doesn't have description
          source: 'example' // All loaded workflows are treated as examples
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

  // Serve static files AFTER API routes
  // Manual static file serving for better control
  app.get('/css/*', (c) => {
    const filePath = c.req.path;
    const fullPath = path.join(process.cwd(), 'public', filePath);
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      c.header('Content-Type', 'text/css');
      return c.text(content);
    } catch (error) {
      return c.notFound();
    }
  });
  
  app.get('/js/*', (c) => {
    const filePath = c.req.path;
    const fullPath = path.join(process.cwd(), 'public', filePath);
    
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      c.header('Content-Type', 'application/javascript');
      return c.text(content);
    } catch (error) {
      return c.notFound();
    }
  });

  return app;
}

/**
 * Start the server
 */
export async function startServer(port: number = 3013): Promise<{ app: Hono; server: any }> {
  // Initialize services
  const storage = WorkflowStorage.getInstance();
  storage.loadExampleWorkflows();
  
  // Create app
  const app = createApp();
  
  console.log(`FlowScript API Server starting on port ${port}...`);
  console.log(`Server running at http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
  
  // For Hono with Node.js adapter
  const { serve } = await import('@hono/node-server');
  const server = serve({
    fetch: app.fetch,
    port
  });

  return { app, server };
}