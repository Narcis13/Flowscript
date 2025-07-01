# FlowScript Implementation Todos

## Phase 1: Project Foundation
- [x] Set up TypeScript Node.js project structure
- [x] Create package.json with dependencies (typescript, hono, ws, @types/*)
- [x] Configure TypeScript (tsconfig.json) with strict mode
- [x] Set up project folder structure (src/, tests/, docs/)

## Phase 2: Core Type System
- [x] Create base interfaces for Node, EdgeMap, ExecutionContext
- [x] Implement StateManager class with get/set/update methods
- [ ] Create RuntimeContext interface and implementation
- [x] Create WorkflowDefinition and FlowElement type system

## Phase 3: Node System
- [x] Implement WorkflowEvent types and event emitter system
- [ ] Create PauseToken mechanism for HITL support
- [ ] Build Node registry system for dynamic node loading
- [ ] Implement basic action nodes (validateData example)
- [ ] Implement whileCondition loop controller node
- [ ] Implement forEach loop controller node

## Phase 4: Workflow Executor
- [ ] Build the core workflow executor (executeFlow function)
- [ ] Implement branch structure execution logic
- [ ] Implement loop structure execution logic
- [ ] Create node execution wrapper with error handling
- [ ] Build node index system for loopTo navigation
- [ ] Implement expression evaluator for conditions

## Phase 5: Human-in-the-Loop
- [ ] Implement human node type with form schema support
- [ ] Create HITL pause/resume mechanism

## Phase 6: API Layer
- [ ] Set up Hono REST API server structure
- [ ] Implement POST /workflows/:workflowId/execute endpoint
- [ ] Implement POST /executions/:executionId/resume endpoint
- [ ] Implement GET /executions/:executionId/status endpoint

## Phase 7: WebSocket Layer
- [ ] Set up WebSocket server with ws library
- [ ] Implement WebSocket subscribe/unsubscribe protocol
- [ ] Create WebSocket event broadcasting for HITL notifications

## Phase 8: Execution Management
- [ ] Build execution manager to track running workflows

## Phase 9: Quality & Tooling
- [ ] Implement workflow definition validation
- [ ] Create unit tests for StateManager
- [ ] Create unit tests for node execution
- [ ] Create unit tests for workflow executor
- [ ] Create integration tests for HITL scenarios
- [ ] Build example workflows (expense approval, document processing)
- [ ] Create development scripts (build, test, dev server)
- [ ] Set up ESLint and Prettier configuration

## Phase 10: Advanced Features
- [ ] Create AI hints system for node metadata
- [ ] Add persistence hooks to StateManager

## Progress Tracking
- **Total Tasks**: 40
- **Completed**: 8
- **In Progress**: 0
- **Remaining**: 32

## Notes
- Update checkboxes as tasks are completed
- Add subtasks if needed for complex items
- Document any blockers or dependencies
- Reference commit hashes for major milestones