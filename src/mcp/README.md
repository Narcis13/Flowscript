# FlowScript MCP Integration

This directory contains the Model Context Protocol (MCP) server implementation for FlowScript, enabling AI assistants to interact with FlowScript workflows through a standardized protocol.

## What is MCP?

The Model Context Protocol (MCP) is Anthropic's open standard that enables seamless integration between LLM applications and external data sources/tools. It provides a standardized way for AI models to:

- **Discover** available capabilities
- **Execute** tools with proper typing
- **Access** resources and documentation
- **Interact** with external systems safely

## FlowScript MCP Features

### Phase 1: Node-to-Tool Adapter (Implemented)
- Every FlowScript node is automatically exposed as an MCP tool
- Nodes can be discovered and executed by AI models
- Full parameter validation and error handling
- Edge-based responses mapped to MCP format

### Phase 2: Workflow Composition (Implemented)
- `flowscript_findNodes` - Discover nodes based on task descriptions
- `flowscript_composeWorkflow` - Create workflows from natural language
- `flowscript_validateWorkflow` - Validate workflow definitions

### Future Phases
- Phase 3: Resource exposure (workflow templates, documentation)
- Phase 4: Prompt templates for common patterns
- Phase 5: Advanced features (multi-agent coordination, learning)

## Quick Start

### 1. Build the MCP Server
```bash
npm run mcp:build
```

### 2. Test the Server
```bash
# Simple test to verify the server starts
npm run mcp:test

# Interactive testing
npm run mcp:dev
```

### 3. Configure Claude Desktop
Add to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "flowscript": {
      "command": "node",
      "args": ["/path/to/flowscript/dist/mcp/server/mcp-stdio-server.js"]
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────┐
│        AI Assistant (Claude)            │
└────────────────┬────────────────────────┘
                 │ JSON-RPC 2.0
┌────────────────┴────────────────────────┐
│      FlowScript MCP Server              │
├─────────────────────────────────────────┤
│ • Protocol Handler (MCPProtocol.ts)     │
│ • Server Core (FlowScriptMCPServer.ts)  │
│ • Transport Layer (STDIO)               │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│           Adapters                      │
├─────────────────────────────────────────┤
│ • NodeToToolAdapter                     │
│ • SchemaConverter                       │
│ • EdgeResponseMapper                    │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│      FlowScript Core                    │
├─────────────────────────────────────────┤
│ • Node Registry                         │
│ • Workflow Executor                     │
│ • State Manager                         │
└─────────────────────────────────────────┘
```

## Using FlowScript via MCP

### Discovering Nodes
```
AI: "I need to make HTTP requests"
MCP: Uses flowscript_findNodes tool
Result: Suggests httpRequest node with usage examples
```

### Executing Nodes
```
AI: "Fetch data from https://api.example.com"
MCP: Uses flowscript_httpRequest tool
Result: Returns response data and status
```

### Composing Workflows
```
AI: "Create a workflow that fetches user data, validates it, and sends notifications"
MCP: Uses flowscript_composeWorkflow tool
Result: Complete workflow JSON with appropriate nodes
```

## Development Guide

### Adding New Nodes
1. Create node in appropriate directory
2. Register with `@RegisterNode` decorator
3. Node automatically becomes available as MCP tool

### Custom MCP Tools
1. Implement the Node interface
2. Add to `tools/` directory
3. Register in `FlowScriptMCPServer.registerWorkflowTools()`

### Testing MCP Tools
```typescript
// Example test for a tool
const tool = new NodeDiscoveryTool();
const result = await tool.execute({
  config: { task: "send email" },
  state: {},
  executionId: "test",
  updateState: async () => {}
});
```

## Best Practices

### For Node Developers
1. **Clear Metadata**: Provide comprehensive `ai_hints` in node metadata
2. **Edge Names**: Use descriptive edge names that indicate outcomes
3. **Error Handling**: Return error edges with helpful messages
4. **Documentation**: Include usage examples in metadata

### For MCP Integration
1. **Schema Generation**: Ensure node configs have clear types
2. **Validation**: Validate inputs before execution
3. **Logging**: Use stderr for logs to keep stdout clean
4. **Error Messages**: Provide actionable error messages

## Troubleshooting

### Server Won't Start
- Check Node.js version (requires 16+)
- Ensure all dependencies are installed
- Verify node modules are built (`npm run build`)

### Tools Not Found
- Verify nodes are registered in NodeRegistry
- Check that NodeLoader is finding node files
- Enable verbose logging: `VERBOSE=true npm run mcp:dev`

### Communication Issues
- Ensure JSON-RPC messages are newline-delimited
- Check that stdout is not polluted with logs
- Verify protocol version compatibility

## Reference Implementation

This MCP implementation serves as a reference for:

1. **Protocol Implementation**: How to implement MCP protocol correctly
2. **Tool Design**: Best practices for exposing functionality as tools
3. **Error Handling**: Proper error propagation and messaging
4. **Type Safety**: Full TypeScript typing for protocol messages
5. **Documentation**: Comprehensive inline documentation

Each file includes detailed comments explaining MCP concepts and implementation decisions.

## Contributing

When contributing to the MCP integration:

1. Maintain the didactic nature - add comments explaining decisions
2. Follow existing patterns for consistency
3. Add tests for new tools
4. Update documentation for new features
5. Consider AI model perspective when designing tools

## Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [FlowScript Documentation](../../README.md)
- [Example Configuration](examples/example-mcp-config.json)