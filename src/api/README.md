# FlowScript REST API

The FlowScript REST API provides HTTP endpoints for executing and managing workflows.

## Starting the API Server

```bash
# Using npm script
npm run dev

# Or directly
npx tsx src/index.ts

# The server will start on port 3000 by default
# Set PORT environment variable to use a different port
PORT=8080 npm run dev
```

## API Endpoints

### Health Check
```
GET /health
```

### List Workflows
```
GET /workflows
```

### Execute Workflow
```
POST /workflows/:workflowId/execute
Content-Type: application/json

{
  "input": {
    "key": "value"
  }
}
```

Response:
```json
{
  "executionId": "exec-123...",
  "workflowId": "simple-approval",
  "status": "started",
  "message": "Workflow execution started successfully"
}
```

### Get Execution Status
```
GET /executions/:executionId/status
```

Response:
```json
{
  "executionId": "exec-123...",
  "workflowId": "simple-approval",
  "status": "paused|running|completed|failed",
  "startTime": "2024-01-01T00:00:00.000Z",
  "currentNode": {
    "id": "node-456",
    "name": "requestApproval"
  },
  "state": {
    "key": "value"
  }
}
```

### Resume Paused Execution
```
POST /executions/:executionId/resume
Content-Type: application/json

{
  "nodeId": "node-456",
  "data": {
    "decision": "approved",
    "comment": "Looks good"
  }
}
```

### List All Executions
```
GET /executions
```

## Example Workflows

The API comes with several pre-loaded example workflows:

1. **simple-approval** - Basic approval workflow with amount-based routing
2. **data-processing** - Demonstrates forEach loops for batch processing
3. **multi-step-form** - Multi-step form with human review
4. **retry-workflow** - API calls with retry and exponential backoff

## Error Handling

The API returns standard HTTP status codes:
- 200 - Success
- 201 - Created (workflow execution started)
- 400 - Bad Request (invalid input)
- 404 - Not Found (workflow or execution not found)
- 409 - Conflict (execution not in expected state)
- 500 - Internal Server Error

Error responses include a JSON body:
```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```