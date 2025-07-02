import { WebSocket } from 'ws';

interface ClientConnection {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>; // Set of execution IDs
  connectedAt: Date;
  lastActivity: Date;
}

export class ConnectionManager {
  private connections: Map<string, ClientConnection> = new Map();
  private executionSubscribers: Map<string, Set<string>> = new Map(); // executionId -> Set<clientId>

  public addConnection(clientId: string, ws: WebSocket): void {
    this.connections.set(clientId, {
      id: clientId,
      ws,
      subscriptions: new Set(),
      connectedAt: new Date(),
      lastActivity: new Date()
    });
  }

  public removeConnection(clientId: string): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    // Remove all subscriptions for this client
    connection.subscriptions.forEach(executionId => {
      this.unsubscribe(clientId, executionId);
    });

    this.connections.delete(clientId);
  }

  public getConnection(clientId: string): WebSocket | null {
    const connection = this.connections.get(clientId);
    if (connection) {
      connection.lastActivity = new Date();
      return connection.ws;
    }
    return null;
  }

  public subscribe(clientId: string, executionId: string): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    // Add to client's subscriptions
    connection.subscriptions.add(executionId);

    // Add to execution's subscribers
    if (!this.executionSubscribers.has(executionId)) {
      this.executionSubscribers.set(executionId, new Set());
    }
    this.executionSubscribers.get(executionId)!.add(clientId);
  }

  public unsubscribe(clientId: string, executionId: string): void {
    const connection = this.connections.get(clientId);
    if (!connection) return;

    // Remove from client's subscriptions
    connection.subscriptions.delete(executionId);

    // Remove from execution's subscribers
    const subscribers = this.executionSubscribers.get(executionId);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.executionSubscribers.delete(executionId);
      }
    }
  }

  public getSubscribersForExecution(executionId: string): WebSocket[] {
    const clientIds = this.executionSubscribers.get(executionId);
    if (!clientIds) return [];

    const connections: WebSocket[] = [];
    clientIds.forEach(clientId => {
      const connection = this.connections.get(clientId);
      if (connection && connection.ws.readyState === WebSocket.OPEN) {
        connections.push(connection.ws);
      }
    });

    return connections;
  }

  public broadcastToExecution(executionId: string, message: string): void {
    const subscribers = this.getSubscribersForExecution(executionId);
    subscribers.forEach(ws => {
      try {
        ws.send(message);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
      }
    });
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getSubscriptionCount(executionId: string): number {
    const subscribers = this.executionSubscribers.get(executionId);
    return subscribers ? subscribers.size : 0;
  }

  public cleanup(): void {
    // Clean up stale connections
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    this.connections.forEach((connection, clientId) => {
      if (connection.ws.readyState !== WebSocket.OPEN) {
        this.removeConnection(clientId);
      } else if (now.getTime() - connection.lastActivity.getTime() > staleThreshold) {
        // Consider implementing a more sophisticated cleanup strategy
        console.log(`Connection ${clientId} appears stale, last activity: ${connection.lastActivity}`);
      }
    });
  }
}