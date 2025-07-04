# Human-in-the-Loop (HITL) Testing Guide

This guide explains how to test FlowScript workflows that require human interaction without a web UI or WebSocket client.

## Overview

FlowScript provides multiple ways to test HITL workflows:

1. **Interactive CLI Mode** - Direct command-line interaction for testing
2. **REST API** - Programmatic testing via HTTP endpoints
3. **Mock Testing** - Unit tests with simulated human responses

## Interactive CLI Mode

The easiest way to test HITL workflows is using the `run-interactive` command:

```bash
# Basic usage
flowscript run-interactive <workflow-file>

# With initial input
flowscript run-interactive <workflow-file> -i '{"key": "value"}'

# With timeout
flowscript run-interactive <workflow-file> -t 60000
```

### How It Works

1. The CLI monitors workflow execution for human interaction events
2. When a human node is reached, it prompts you in the terminal
3. Form schemas are converted to interactive prompts using Inquirer.js
4. Your responses are fed back into the workflow to resume execution

### Example Session

```bash
$ flowscript run-interactive workflows/test/simple-hitl-test.json

🚀 Running workflow interactively: simple-hitl-test
   Interactive mode enabled - will prompt for human interactions

🏁 Workflow started

⚙️  Executing: formInput

🤚 Human interaction required:
   Node: formInput

📋 Welcome to FlowScript!
   Let's test the interactive features. Please provide some information:

? Your Name: John Doe
? Your Age: 30
? Favorite Color: Blue

   ↳ Completed with edge: submitted

⚙️  Executing: setData
⚙️  Executing: setData
⚙️  Executing: setData
⚙️  Executing: checkValue
   ↳ Completed with edge: true

⚙️  Executing: setData

✅ Workflow completed successfully

⏱️  Execution time: 15234ms

📊 Final State:
{
  "userName": "John Doe",
  "favoriteColor": "Blue",
  "age": 30,
  "summary": "Hello John Doe! You are 30 years old and your favorite color is Blue."
}
```

## Test Workflows

### 1. Simple Form Input Test
`workflows/test/simple-hitl-test.json` - Basic form collection with:
- Text input
- Number input with validation
- Selection from predefined options
- Conditional logic based on input

### 2. Guess the Number Game
`workflows/test/guess-number-game.json` - Interactive game demonstrating:
- Loop control with human input
- Dynamic prompts based on state
- Multiple decision branches
- Game state management

### 3. Approval Flow (Example)
`workflows/examples/approval-flow.json` - Business process with:
- Conditional approval based on amount
- Human approval node for high-value items
- Branching based on approval decision

## Testing Patterns

### 1. Direct CLI Testing

Run workflows directly and interact via terminal:

```bash
# Run the test script
./test-interactive.sh

# Or run individual workflows
flowscript run-interactive workflows/test/guess-number-game.json
```

### 2. Automated Testing with Mock Responses

Create test scripts that provide predefined responses:

```javascript
// test-hitl-automated.js
const { WorkflowExecutor } = require('./dist/core/executor/WorkflowExecutor');
const { registerAllNodes } = require('./dist/nodes/registerAll');

async function testWithMockResponses() {
  registerAllNodes();
  
  const workflow = require('./workflows/test/simple-hitl-test.json');
  const executor = new WorkflowExecutor(workflow);
  
  // Override human interaction handling
  executor.on('human:input_required', (event) => {
    // Simulate user input
    const mockResponse = {
      name: 'Test User',
      age: 25,
      favoriteColor: 'Green'
    };
    
    // Resume with mock data
    event.resume(mockResponse);
  });
  
  const result = await executor.execute();
  console.log('Result:', result.state);
}
```

### 3. REST API Testing

When the API server is running, you can test HITL via HTTP:

```bash
# Start the API server
npm run dev

# In another terminal, execute a workflow
curl -X POST http://localhost:3000/workflows/simple-hitl-test/execute \
  -H "Content-Type: application/json" \
  -d '{}'

# Monitor for paused executions
curl http://localhost:3000/executions/{executionId}/status

# Resume with user input
curl -X POST http://localhost:3000/executions/{executionId}/resume \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "node-123",
    "data": {
      "name": "API Test",
      "age": 30,
      "favoriteColor": "Red"
    }
  }'
```

## Form Schema Support

The interactive CLI supports various JSON Schema types:

- **String**: Text input or selection from enum
- **Number/Integer**: Numeric input with min/max validation
- **Boolean**: Yes/No confirmation
- **Array**: Multiple selection checkboxes

### Example Form Schemas

```json
// Simple text input
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "title": "Your Name"
    }
  }
}

// Number with validation
{
  "type": "object",
  "properties": {
    "age": {
      "type": "integer",
      "minimum": 18,
      "maximum": 100,
      "title": "Your Age"
    }
  }
}

// Selection from options
{
  "type": "object",
  "properties": {
    "choice": {
      "type": "string",
      "enum": ["Option A", "Option B", "Option C"],
      "title": "Select One"
    }
  }
}
```

## Tips for Testing

1. **Use Descriptive UI Hints**: Add clear titles and descriptions to help testers understand what input is needed

2. **Set Appropriate Timeouts**: Give enough time for manual input but not too long for automated tests

3. **Handle Cancellations**: Always provide cancel/skip options and handle them gracefully

4. **Test Edge Cases**: Try invalid inputs, timeouts, and cancellations

5. **Use Template Substitution**: Show dynamic context in prompts using `{{state.variable}}` syntax

## Troubleshooting

### Common Issues

1. **Build Errors**: Run `npm run build` before testing
2. **Node Not Found**: Ensure all custom nodes are registered in `registerAll.ts`
3. **Template Errors**: Check that template variables exist in state
4. **Timeout Issues**: Increase timeout for complex interactions

### Debug Mode

Add logging to see detailed execution:

```bash
DEBUG=flowscript:* flowscript run-interactive workflow.json
```

## Next Steps

- Create more complex test workflows
- Build automated test suites
- Integrate with CI/CD pipelines
- Add WebSocket client for real-time monitoring