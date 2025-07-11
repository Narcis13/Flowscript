#!/usr/bin/env node

/**
 * FlowScript MCP STDIO Server
 * 
 * This is the entry point for running the FlowScript MCP server over STDIO.
 * It implements the standard input/output transport for MCP, which is the
 * most common way to integrate with AI assistants like Claude.
 * 
 * Usage:
 *   node mcp-stdio-server.js
 *   
 * The server reads JSON-RPC messages from stdin and writes responses to stdout.
 * All logging is sent to stderr to keep stdout clean for protocol messages.
 * 
 * This implementation serves as a reference for MCP STDIO transport.
 */

import { FlowScriptMCPServer } from './FlowScriptMCPServer';
import { MCPTransport, JSONRPCRequest, JSONRPCResponse } from './MCPProtocol';
import { NodeLoader } from '../../nodes/registry/NodeLoader';

/**
 * STDIO Transport implementation for MCP
 * 
 * This transport reads newline-delimited JSON from stdin and writes
 * newline-delimited JSON to stdout, following the JSON-RPC 2.0 protocol.
 */
class StdioTransport implements MCPTransport {
  private messageHandler?: (message: JSONRPCRequest) => void;
  private buffer: string = '';
  
  constructor() {
    // Set up stdin for reading messages
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => this.handleInput(chunk));
    process.stdin.on('end', () => this.close());
    
    // Handle process termination gracefully
    process.on('SIGINT', () => this.close());
    process.on('SIGTERM', () => this.close());
  }
  
  /**
   * Send a message to stdout
   */
  async send(message: JSONRPCRequest | JSONRPCResponse): Promise<void> {
    try {
      // Write newline-delimited JSON to stdout
      const json = JSON.stringify(message);
      process.stdout.write(json + '\n');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
  
  /**
   * Register a handler for incoming messages
   */
  onMessage(handler: (message: JSONRPCRequest) => void): void {
    this.messageHandler = handler;
  }
  
  /**
   * Handle input from stdin
   */
  private handleInput(chunk: string): void {
    // Add chunk to buffer
    this.buffer += chunk;
    
    // Process complete lines
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      
      if (line) {
        this.processLine(line);
      }
    }
  }
  
  /**
   * Process a complete JSON-RPC message
   */
  private processLine(line: string): void {
    try {
      const message = JSON.parse(line) as JSONRPCRequest;
      
      // Validate it's a proper JSON-RPC request
      if (message.jsonrpc !== '2.0' || !message.method) {
        console.error('Invalid JSON-RPC message:', line);
        return;
      }
      
      // Pass to handler
      if (this.messageHandler) {
        this.messageHandler(message);
      }
    } catch (error) {
      console.error('Error parsing JSON-RPC message:', error);
      console.error('Line:', line);
    }
  }
  
  /**
   * Close the transport
   */
  async close(): Promise<void> {
    process.stdin.pause();
    process.stdin.removeAllListeners();
    process.exit(0);
  }
}

/**
 * Main server startup
 */
async function main() {
  console.error('FlowScript MCP Server starting...');
  
  try {
    // Load all nodes before starting the server
    console.error('Loading FlowScript nodes...');
    const loader = new NodeLoader();
    await loader.loadAllNodes();
    console.error('Nodes loaded successfully');
    
    // Create server instance
    const server = new FlowScriptMCPServer({
      serverName: 'flowscript-mcp',
      serverVersion: '1.0.0',
      verbose: process.env.VERBOSE === 'true',
      includeWorkflowTools: true
    });
    
    // Create STDIO transport
    const transport = new StdioTransport();
    
    // Start the server
    await server.start(transport);
    
    console.error('FlowScript MCP Server ready');
    console.error('Listening for JSON-RPC messages on stdin...');
    
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
main();