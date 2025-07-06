/**
 * Execute workflow endpoint
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { WorkflowStorage, ExecutionManager } from '../../services';

// Request schema
const executeRequestSchema = z.object({
  input: z.record(z.any()).optional(),
  initialInput: z.record(z.any()).optional() // Also accept initialInput from frontend
});

/**
 * Create execute route handler
 */
export function createExecuteRoute(): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    // Get workflow ID from params
    const workflowId = c.req.param('workflowId');
    if (!workflowId) {
      throw new HTTPException(400, { message: 'Workflow ID is required' });
    }

    // Parse and validate request body
    let body;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parseResult = executeRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: parseResult.error.errors
      });
    }

    // Get workflow definition
    const storage = WorkflowStorage.getInstance();
    const workflow = storage.getWorkflow(workflowId);
    if (!workflow) {
      throw new HTTPException(404, { message: `Workflow not found: ${workflowId}` });
    }

    // Start execution
    const manager = ExecutionManager.getInstance();
    try {
      // Use initialInput if provided (from frontend), otherwise use input
      const inputData = parseResult.data.initialInput || parseResult.data.input;
      const executionId = await manager.startExecution(workflow, inputData);
      
      // Return execution ID
      return c.json(
        {
          executionId,
          workflowId,
          status: 'started',
          message: 'Workflow execution started successfully'
        },
        201
      );
    } catch (error) {
      throw new HTTPException(500, {
        message: 'Failed to start workflow execution',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return app;
}