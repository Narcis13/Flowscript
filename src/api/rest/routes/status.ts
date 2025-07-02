/**
 * Execution status endpoint
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ExecutionManager } from '../../services';

/**
 * Create status route handler
 */
export function createStatusRoute(): Hono {
  const app = new Hono();

  app.get('/', async (c) => {
    // Get execution ID from params
    const executionId = c.req.param('executionId');
    if (!executionId) {
      throw new HTTPException(400, { message: 'Execution ID is required' });
    }

    // Get execution status
    const manager = ExecutionManager.getInstance();
    const execution = manager.getExecutionStatus(executionId);
    
    if (!execution) {
      throw new HTTPException(404, { message: `Execution not found: ${executionId}` });
    }

    // Format response
    return c.json({
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      status: execution.status,
      startTime: new Date(execution.startTime).toISOString(),
      endTime: execution.endTime ? new Date(execution.endTime).toISOString() : undefined,
      currentNode: execution.currentNodeName ? {
        id: execution.currentNodeId,
        name: execution.currentNodeName
      } : undefined,
      error: execution.error,
      pauseTokens: execution.pauseTokens.length > 0 ? execution.pauseTokens : undefined,
      state: execution.state
    });
  });

  return app;
}