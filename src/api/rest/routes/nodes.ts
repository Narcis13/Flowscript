/**
 * Direct node execution API endpoints
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { NodeExecutor } from '../../services/NodeExecutor';
import { NodeRegistry } from '../../../nodes/registry';

// Request schema for node execution
const nodeExecuteSchema = z.object({
  config: z.record(z.any()).optional(),
  initialState: z.record(z.any()).optional(),
  previousData: z.any().optional()
});

// Request schema for node chain execution
const nodeChainSchema = z.object({
  nodeIds: z.array(z.string()).min(1),
  config: z.record(z.any()).optional(),
  initialState: z.record(z.any()).optional(),
  previousData: z.any().optional()
});

/**
 * Create node execution routes
 */
export function createNodeRoutes(): Hono {
  const app = new Hono();
  const executor = NodeExecutor.getInstance();
  const registry = NodeRegistry.getInstance();

  // List all available nodes
  app.get('/', (c) => {
    const nodes = registry.getAllNodes();
    const nodeList = Object.entries(nodes).map(([id, node]) => ({
      id,
      name: node.metadata.name,
      description: node.metadata.description,
      type: node.metadata.type || 'action',
      expectedEdges: node.metadata.ai_hints.expected_edges
    }));

    return c.json({
      nodes: nodeList,
      total: nodeList.length
    });
  });

  // Get node metadata
  app.get('/:nodeId', (c) => {
    const nodeId = c.req.param('nodeId');
    const node = registry.getNode(nodeId);

    if (!node) {
      throw new HTTPException(404, { message: `Node not found: ${nodeId}` });
    }

    return c.json({
      id: nodeId,
      metadata: node.metadata
    });
  });

  // Execute a single node
  app.post('/:nodeId/execute', async (c) => {
    const nodeId = c.req.param('nodeId');
    
    // Validate node exists
    const node = registry.getNode(nodeId);
    if (!node) {
      throw new HTTPException(404, { message: `Node not found: ${nodeId}` });
    }

    // Parse and validate request body
    let body;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parseResult = nodeExecuteSchema.safeParse(body);
    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: parseResult.error.errors
      });
    }

    try {
      // Execute the node
      const result = await executor.executeNode(nodeId, parseResult.data);

      return c.json({
        nodeId,
        ...result
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: 'Failed to execute node',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Execute a chain of nodes
  app.post('/chain/execute', async (c) => {
    // Parse and validate request body
    const body = await c.req.json();
    const parseResult = nodeChainSchema.safeParse(body);
    
    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: parseResult.error.errors
      });
    }

    const { nodeIds, ...options } = parseResult.data;

    // Validate all nodes exist
    for (const nodeId of nodeIds) {
      if (!registry.getNode(nodeId)) {
        throw new HTTPException(404, { message: `Node not found: ${nodeId}` });
      }
    }

    try {
      // Execute the node chain
      const results = await executor.executeNodeChain(nodeIds, options);

      return c.json({
        nodeIds,
        results,
        finalState: results[results.length - 1]?.finalState || {}
      });
    } catch (error) {
      throw new HTTPException(500, {
        message: 'Failed to execute node chain',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return app;
}