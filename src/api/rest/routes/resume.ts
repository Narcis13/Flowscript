/**
 * Resume execution endpoint
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { ExecutionManager } from '../../services';

// Request schema
const resumeRequestSchema = z.object({
  nodeId: z.string(),
  data: z.record(z.any())
});

/**
 * Create resume route handler
 */
export function createResumeRoute(): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    // Get execution ID from params
    const executionId = c.req.param('executionId');
    if (!executionId) {
      throw new HTTPException(400, { message: 'Execution ID is required' });
    }

    // Parse and validate request body
    let body;
    try {
      body = await c.req.json();
    } catch {
      throw new HTTPException(400, { message: 'Invalid JSON body' });
    }

    const parseResult = resumeRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: parseResult.error.errors
      });
    }

    // Resume execution
    const manager = ExecutionManager.getInstance();
    try {
      await manager.resumeExecution(
        executionId,
        parseResult.data.nodeId,
        parseResult.data.data
      );
      
      // Get updated status
      const execution = manager.getExecutionStatus(executionId);
      
      return c.json({
        executionId,
        status: execution?.status || 'unknown',
        message: 'Execution resumed successfully'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      
      // Check if it's a not found error
      if (message.includes('not found')) {
        throw new HTTPException(404, { message });
      }
      
      // Check if it's a state error (not paused)
      if (message.includes('not paused')) {
        throw new HTTPException(409, { message });
      }
      
      // Other errors
      throw new HTTPException(500, {
        message: 'Failed to resume execution',
        cause: message
      });
    }
  });

  return app;
}