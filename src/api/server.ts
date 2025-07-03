/**
 * Main API Server combining REST and WebSocket
 */

import { createServer } from 'http';
import { FlowScriptWebSocketServer } from './websocket';
import { ExecutionManager, WorkflowStorage } from './services';
import { registerAllNodes } from '../nodes/registerAll';

export async function startFullServer(port: number = 3000): Promise<void> {
  // Register all nodes before starting the server
  registerAllNodes();
  
  // Initialize services
  const storage = WorkflowStorage.getInstance();
  storage.loadExampleWorkflows();
  
  const executionManager = ExecutionManager.getInstance();

  // Create HTTP server
  const httpServer = createServer();

  // Create Hono app
  const { createApp } = await import('./rest/server');
  const app = createApp();
  
  // Attach Hono app to HTTP server
  httpServer.on('request', async (req, res) => {
    // Check if this is a WebSocket upgrade request
    if (req.headers.upgrade === 'websocket') {
      return; // Let WebSocket server handle it
    }
    
    // Convert Node request to Fetch Request
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.append(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    
    const body = req.method !== 'GET' && req.method !== 'HEAD' 
      ? await new Promise<Buffer>((resolve) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        })
      : undefined;
    
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body
    });
    
    // Handle with Hono
    const response = await app.fetch(request);
    
    // Write response
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    if (response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } else {
      res.end();
    }
  });

  // Create WebSocket server
  const wsServer = new FlowScriptWebSocketServer(httpServer, executionManager);

  // Start listening
  httpServer.listen(port, () => {
    console.log(`FlowScript Full API Server running on port ${port}`);
    console.log(`REST API: http://localhost:${port}`);
    console.log(`WebSocket: ws://localhost:${port}/ws`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    wsServer.close();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    wsServer.close();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Export for use in other modules
export { FlowScriptWebSocketServer } from './websocket';
export { createApp } from './rest/server';