FlowScript: A Declarative Specification for Agentic and Human-in-the-Loop Workflows
Abstract
FlowScript is a declarative workflow system designed for orchestrating complex, long-running processes that involve both automated (agentic) tasks and essential human interaction. It introduces a paradigm shift from traditional graph-based state machines to an interpretable, script-like JSON structure. This approach enhances readability and maintainability while providing powerful control flow. The system's core innovations are its functional nodes with edge-based routing; its explicit and symmetrical structural elements for branching and looping; and its native, first-class support for pausing, resuming, and gathering input for human-in-the-loop (HITL) scenarios. By defining workflows as explicit scripts, FlowScript enables developers to build, audit, and manage sophisticated business logic with unprecedented clarity.
1. Introduction
Modern business processes are rarely simple, linear automations. They involve conditional logic, iterative tasks, and critical decision points requiring human judgment. Traditional workflow engines, often based on complex graph definitions, can obscure this logic, making them difficult to write, debug, and evolve.
FlowScript addresses these challenges by modeling workflows as sequential scripts of instructions. This specification details a system where control flow is not hidden in node-to-node pointers but is represented as explicit, structural elements within the workflow document itself.
1.1 Core Principles

Declarative, Script-like Syntax: Workflows are defined in JSON documents that are executed by an interpreter. The structure directly mirrors the flow of execution.
Functional Nodes: Nodes are the atomic units of work. They receive the current state and return edges with lazy-evaluated data payloads. Nodes can perform side effects such as database operations or API calls.
Explicit Structural Control Flow: Branching and looping are first-class, well-defined structures within the JSON syntax, providing clarity and preventing ambiguity.
First-Class Human Interaction: Human-in-the-Loop (HITL) is a core system concept. The engine natively supports pausing for human input and resuming with new data, facilitated by an event-driven architecture.
Edge-Based Routing: Nodes communicate their decisions through named edges, not by specifying next nodes directly, enabling dynamic and flexible flow control.

2. System Specification
2.1 Node Definition
A Node is a self-contained, reusable object that encapsulates a unit of work.
typescriptinterface Node {
  metadata: {
    name: string;                    // Unique identifier
    description: string;
    type?: 'action' | 'human' | 'control';  // Classification
    ai_hints: {
      purpose: string;
      when_to_use: string;
      expected_edges: string[];
      example_usage?: string;
    };
    humanInteraction?: {
      formSchema?: JSONSchema;       // What data to collect
      uiHints?: UIHints;            // How to present it
      timeout?: number;              // Max wait time in ms
    };
  };
  execute: (context: ExecutionContext) => Promise<EdgeMap>;
}

type EdgeMap = {
  [edgeName: string]: () => any;     // Lazy evaluation via thunks
};

interface ExecutionContext {
  state: StateManager;
  config?: Record<string, any>;      // Node-specific config from workflow
  runtime: RuntimeContext;           // For advanced interactions
}

interface RuntimeContext {
  workflowId: string;
  executionId: string;
  emit: (event: WorkflowEvent) => void;
  pause: () => PauseToken;
  waitForResume: (token: PauseToken) => Promise<any>;
}
Example action node:
typescriptexport const validateData: Node = {
  metadata: {
    name: "validateData",
    description: "Validates input data against schema",
    type: "action",
    ai_hints: {
      purpose: "Data validation",
      when_to_use: "When input needs to be verified",
      expected_edges: ["valid", "invalid", "error"]
    }
  },
  
  execute: async ({ state, config }) => {
    try {
      const data = state.get(config?.dataPath || '$.input');
      const isValid = await validateAgainstSchema(data);
      
      if (isValid) {
        return {
          valid: () => ({ validatedAt: Date.now() })
        };
      } else {
        return {
          invalid: () => ({ errors: getValidationErrors(data) })
        };
      }
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
2.2 Workflow Definition Structure
A workflow is a JSON document containing the initial state and an array of Flow Elements.
typescriptinterface WorkflowDefinition {
  id: string;
  initialState: Record<string, any>;
  nodes: FlowElement[];
}

type FlowElement = 
  | string                                    // Simple node reference: "nodeName"
  | { [nodeName: string]: Record<string, any> } // Node with config: {"nodeName": {config}}
  | [FlowElement, BranchMap]                  // Branch structure
  | [LoopController, FlowElement[]];          // Loop structure

type BranchMap = {
  [edgeName: string]: FlowElement | FlowElement[] | null;
};

type LoopController = 
  | string                                    // Loop controller node name
  | { [nodeName: string]: Record<string, any> }; // Loop controller with config
2.3 Control Flow Elements
2.3.1 Sequential Execution
Simple nodes execute in sequence. Nodes can be expressed in two forms:
json{
  "nodes": [
    "fetchData",                              // Simple form
    { "processData": { "batchSize": 10 } },   // With configuration
    "saveResults"
  ]
}
2.3.2 Branch Structure (Conditional Execution)
A two-element array where the first element is a condition node and the second is a branch map.
Syntax: [ConditionNode, BranchMap]
json[
  "checkUserType",
  {
    "premium": ["grantPremiumAccess", "sendWelcomeGift"],
    "regular": "grantBasicAccess",
    "guest": { "redirectToSignup": { "campaign": "convert-guest" } }
  }
]
2.3.3 Loop Structure (Iterative Execution)
A two-element array where the first element is a loop controller node and the second is the sequence to repeat.
Syntax: [LoopControllerNode, NodeSequence]
Loop controller nodes must emit specific edges:

next_iteration: Continue to next iteration
exit_loop: Exit the loop

Example - While Loop:
json[
  { "whileCondition": { "condition": "state.attempts < 3" } },
  [
    "attemptOperation",
    { "incrementCounter": { "field": "attempts" } }
  ]
]
Example - For Each Loop:
json[
  { "forEach": { "items": "state.documents", "as": "currentDoc" } },
  [
    { "processDocument": { "docPath": "state.currentDoc" } },
    "updateProgress"
  ]
]
2.4 Special Edge Conventions

exit: Exit the current flow/subflow
loop: Return to the beginning of the current flow (deprecated in favor of loop structures)
loopTo:nodeName: Jump to a specific named node
Loop controller edges:

next_iteration: Continue loop
exit_loop: Exit loop



3. Human-in-the-Loop (HITL) Support
3.1 Human Node Definition
typescriptexport const approveExpense: Node = {
  metadata: {
    name: "approveExpense",
    description: "Manager approval for expense",
    type: "human",
    ai_hints: {
      purpose: "Human approval gate",
      when_to_use: "When expense exceeds threshold",
      expected_edges: ["approved", "rejected", "needsInfo"]
    },
    humanInteraction: {
      formSchema: {
        type: "object",
        properties: {
          decision: {
            type: "string",
            enum: ["approve", "reject", "request_info"]
          },
          comment: { type: "string" }
        },
        required: ["decision"]
      },
      timeout: 86400000  // 24 hours
    }
  },
  
  execute: async ({ state, runtime }) => {
    runtime.emit({
      type: 'human_interaction_required',
      nodeInfo: {
        name: 'approveExpense',
        formSchema: approveExpense.metadata.humanInteraction?.formSchema,
        contextData: {
          expense: state.get('$.currentExpense'),
          employee: state.get('$.employee')
        }
      }
    });
    
    const pauseToken = runtime.pause();
    const response = await runtime.waitForResume(pauseToken);
    
    switch (response.decision) {
      case 'approve':
        return {
          approved: () => ({
            approvedBy: response.userId,
            approvedAt: Date.now(),
            comment: response.comment
          })
        };
      case 'reject':
        return {
          rejected: () => ({
            rejectedBy: response.userId,
            reason: response.comment
          })
        };
      default:
        return {
          needsInfo: () => ({
            questions: response.comment
          })
        };
    }
  }
};
3.2 HITL Workflow Example
json{
  "id": "expense-approval",
  "initialState": {
    "expense": null,
    "approved": false
  },
  "nodes": [
    "validateExpense",
    [
      "checkAmount",
      {
        "under100": "autoApprove",
        "over100": "requestApproval"
      }
    ],
    "requestApproval",
    [
      "requestApproval",
      {
        "approved": "processPayment",
        "rejected": ["notifyRejection", "exit"],
        "needsInfo": [
          "requestAdditionalInfo",
          "waitForInfo",
          [
            { "whileCondition": { "condition": "!state.infoReceived" } },
            [
              "checkForInfo",
              { "wait": { "seconds": 3600 } }
            ]
          ],
          "loopTo:validateExpense"
        ]
      }
    ],
    "processPayment",
    "notifySuccess"
  ]
}
4. Execution Model
4.1 The Workflow Executor
The FlowScript engine is a recursive interpreter that processes node sequences.
typescriptasync function executeFlow(
  elements: FlowElement[],
  state: StateManager,
  runtime: RuntimeContext
): Promise<ExecutionResult> {
  const nodeIndex = buildNodeIndex(elements);
  let pc = 0;
  let exitSignal: string | null = null;
  
  while (pc < elements.length && !exitSignal) {
    const element = elements[pc];
    
    // Branch Structure: [ConditionNode, BranchMap]
    if (isBranchStructure(element)) {
      const [condition, branchMap] = element;
      const result = await executeNode(condition, state, runtime);
      
      if (result.edge && branchMap[result.edge]) {
        const branch = branchMap[result.edge];
        const branchResult = await executeBranch(branch, state, runtime);
        
        if (branchResult.exit) {
          exitSignal = branchResult.exit;
        }
      }
    }
    
    // Loop Structure: [LoopController, NodeSequence]
    else if (isLoopStructure(element)) {
      const [controller, sequence] = element;
      
      while (true) {
        const controlResult = await executeNode(controller, state, runtime);
        
        if (controlResult.edge === 'exit_loop') {
          break;
        } else if (controlResult.edge === 'next_iteration') {
          if (controlResult.data) {
            state.update(controlResult.data());
          }
          
          const iterResult = await executeFlow(sequence, state, runtime);
          if (iterResult.exit) {
            exitSignal = iterResult.exit;
            break;
          }
        }
      }
    }
    
    // Simple Node Execution
    else {
      const result = await executeNode(element, state, runtime);
      
      if (result.edge === 'exit') {
        exitSignal = 'explicit_exit';
      } else if (result.edge?.startsWith('loopTo:')) {
        const target = result.edge.substring(7);
        const targetIndex = nodeIndex.get(target);
        if (targetIndex !== undefined) {
          pc = targetIndex - 1;
        }
      }
    }
    
    pc++;
  }
  
  return { completed: !exitSignal, exitSignal };
}
4.2 Built-in Loop Controllers
While Loop Controller
typescriptexport const whileCondition: Node = {
  metadata: {
    name: "whileCondition",
    type: "control",
    description: "Loops while condition is true"
  },
  
  execute: async ({ state, config }) => {
    const condition = evaluateExpression(config.condition, state);
    
    if (condition) {
      return { next_iteration: () => ({}) };
    } else {
      return { exit_loop: () => ({}) };
    }
  }
};
For Each Loop Controller
typescriptexport const forEach: Node = {
  metadata: {
    name: "forEach",
    type: "control",
    description: "Iterates over array items"
  },
  
  execute: async ({ state, config }) => {
    const items = state.get(config.items);
    const currentIndex = state.get('$._loopIndex') || 0;
    
    if (currentIndex < items.length) {
      return {
        next_iteration: () => ({
          [config.as]: items[currentIndex],
          _loopIndex: currentIndex + 1
        })
      };
    } else {
      return {
        exit_loop: () => ({ _loopIndex: 0 })
      };
    }
  }
};
5. Communication Layer
5.1 WebSocket Protocol
typescript// Client → Server: Subscribe to workflow
{
  type: 'subscribe',
  workflowId: 'expense-approval',
  executionId: 'exec-123'
}

// Server → Client: Human interaction required
{
  type: 'human_interaction_required',
  executionId: 'exec-123',
  nodeInfo: {
    name: 'approveExpense',
    formSchema: { /* JSON Schema */ },
    contextData: { /* Current state data */ }
  }
}

// Client → Server: Resume with user input
{
  type: 'resume',
  executionId: 'exec-123',
  nodeId: 'node-456',
  data: {
    decision: 'approve',
    comment: 'Approved for Q4 budget'
  }
}
5.2 REST API Endpoints
typescript// Execute workflow
POST /workflows/:workflowId/execute
Body: { /* initial input */ }
Response: { executionId: "exec-123" }

// Resume paused execution
POST /executions/:executionId/resume
Body: { nodeId: "node-456", data: { /* user input */ } }

// Get execution status
GET /executions/:executionId/status
Response: { status: "paused", currentNode: "approveExpense" }
6. Complete Example: Document Processing Pipeline
json{
  "id": "document-processing-pipeline",
  "initialState": {
    "documents": [],
    "processed": 0,
    "failed: 0,
    "maxRetries": 3
  },
  "nodes": [
    "initializePipeline",
    [
      { "whileCondition": { "condition": "state.hasMore" } },
      [
        { "fetchDocumentBatch": { "size": 50 } },
        [
          "checkBatchResult",
          {
            "success": "processBatch",
            "empty": { "setFlag": { "flag": "hasMore", "value": false } },
            "error": [
              "logError",
              [
                { "retryController": { "max": "state.maxRetries" } },
                [
                  { "wait": { "seconds": 30 } },
                  "incrementRetryCount"
                ]
              ]
            ]
          }
        ],
        [
          { "forEach": { "items": "state.currentBatch", "as": "doc" } },
          [
            { "validateDocument": { "docPath": "state.doc" } },
            [
              "validationResult",
              {
                "valid": [
                  { "extractText": { "docPath": "state.doc" } },
                  { "analyzeContent": { "nlpModel": "bert-base" } },
                  "saveToDatabase"
                ],
                "invalid": [
                  "quarantineDocument",
                  "requestHumanReview"
                ]
              }
            ],
            "updateProgress"
          ]
        ],
        "commitBatch"
      ]
    ],
    "generateReport",
    "sendNotifications"
  ]
}
7. Implementation Considerations
7.1 Technology Stack

Runtime: Node.js with TypeScript
Web Framework: Hono for REST API
WebSocket: Native ws library
State Management: In-memory StateManager with persistence hooks
Event System: Node.js EventEmitter

7.2 Performance Optimizations

Lazy evaluation of edge data reduces memory usage
Node registry with dynamic loading
Efficient loop execution without stack overflow
WebSocket connection pooling for scalability

7.3 Error Handling

Each node execution is wrapped in try-catch
Failed nodes can emit error edges
Workflow-level error handlers can be defined
Automatic retry mechanisms for transient failures

8. Benefits and Design Rationale
8.1 Clarity Through Structure

Workflows read like scripts with clear control flow
No hidden connections or implicit behavior
Visual representation maps directly to JSON structure

8.2 Symmetrical Design

Branches: [ConditionNode, BranchMap]
Loops: [LoopController, NodeSequence]
Both follow the same two-element array pattern

8.3 Practical Flexibility

Nodes can perform any operation including side effects
Support for complex patterns without special syntax
Easy to extend with custom node types and controllers

8.4 Human-Centric Design

HITL is not an afterthought but a core feature
Rich metadata enables automatic UI generation
Event-driven architecture supports real-time updates

9. Conclusion
FlowScript represents a fundamental rethinking of workflow orchestration. By combining the simplicity of sequential scripts with the power of structural control flow elements, it achieves a balance between expressiveness and clarity that traditional systems struggle to match.
The explicit loop and branch structures, combined with native human-in-the-loop support, create a system that is both powerful enough for complex business processes and simple enough for rapid development and maintenance. The edge-based routing system provides flexibility without sacrificing predictability, while the functional node design ensures testability and reusability.
This specification provides a complete foundation for implementing FlowScript, enabling developers to build the next generation of intelligent, collaborative workflow applications with unprecedented clarity and control.