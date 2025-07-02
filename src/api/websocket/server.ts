import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { ConnectionManager } from './ConnectionManager';
import { EventBridge } from './EventBridge';
import { ExecutionManager } from '../services/ExecutionManager';
import { parseMessage, createMessage, WebSocketMessage } from './protocol';

export class FlowScriptWebSocketServer {
  private wss: WebSocketServer;
  private connectionManager: ConnectionManager;
  private eventBridge: EventBridge;

  constructor(
    private httpServer: Server,
    private executionManager: ExecutionManager
  ) {
    this.wss = new WebSocketServer({ 
      server: httpServer,
      path: '/ws'
    });

    this.connectionManager = new ConnectionManager();
    this.eventBridge = new EventBridge(this.executionManager, this.connectionManager);

    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      console.log(`New WebSocket connection: ${clientId}`);

      // Add connection to manager
      this.connectionManager.addConnection(clientId, ws);

      // Set up ping/pong for connection health
      this.setupHeartbeat(clientId, ws);

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = parseMessage(data.toString());
          await this.handleMessage(clientId, message);
        } catch (error) {
          console.error(`Error handling message from ${clientId}:`, error);
          ws.send(JSON.stringify(createMessage('error', {
            message: error instanceof Error ? error.message : 'Unknown error'
          })));
        }
      });

      // Handle connection close
      ws.on('close', (code, reason) => {
        console.log(`WebSocket connection closed: ${clientId}, code: ${code}, reason: ${reason}`);
        this.connectionManager.removeConnection(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });

      // Send welcome message
      ws.send(JSON.stringify(createMessage('connected', { clientId })));
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  private async handleMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    const ws = this.connectionManager.getConnection(clientId);
    if (!ws) return;

    switch (message.type) {
      case 'subscribe':
        if (message.data.executionId) {
          this.connectionManager.subscribe(clientId, message.data.executionId);
          ws.send(JSON.stringify(createMessage('subscribed', {
            executionId: message.data.executionId
          })));

          // Send current status immediately
          const status = await this.executionManager.getExecutionStatus(message.data.executionId);
          if (status) {
            ws.send(JSON.stringify(createMessage('execution_status', status)));
          }
        }
        break;

      case 'unsubscribe':
        if (message.data.executionId) {
          this.connectionManager.unsubscribe(clientId, message.data.executionId);
          ws.send(JSON.stringify(createMessage('unsubscribed', {
            executionId: message.data.executionId
          })));
        }
        break;

      case 'resume':
        if (message.data.executionId && message.data.nodeId && message.data.data) {
          try {
            await this.executionManager.resumeExecution(
              message.data.executionId,
              message.data.nodeId,
              message.data.data
            );
            ws.send(JSON.stringify(createMessage('resume_success', {
              executionId: message.data.executionId
            })));
          } catch (error) {
            ws.send(JSON.stringify(createMessage('resume_error', {
              executionId: message.data.executionId,
              error: error instanceof Error ? error.message : 'Resume failed'
            })));
          }
        }
        break;

      case 'ping':
        ws.send(JSON.stringify(createMessage('pong', {})));
        break;

      default:
        ws.send(JSON.stringify(createMessage('error', {
          message: `Unknown message type: ${message.type}`
        })));
    }
  }

  private setupHeartbeat(clientId: string, ws: WebSocket): void {
    let isAlive = true;

    ws.on('pong', () => {
      isAlive = true;
    });

    const interval = setInterval(() => {
      if (isAlive === false) {
        console.log(`Client ${clientId} failed heartbeat, terminating connection`);
        this.connectionManager.removeConnection(clientId);
        ws.terminate();
        return;
      }

      isAlive = false;
      ws.ping();
    }, 30000); // 30 second heartbeat

    ws.on('close', () => {
      clearInterval(interval);
    });
  }

  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  public close(): void {
    this.eventBridge.stop();
    this.wss.close();
  }
}