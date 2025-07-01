# FlowScript Implementation Todos

## Phase 1: Project Foundation
- [x] Set up TypeScript Node.js project structure
- [x] Create package.json with dependencies (typescript, hono, ws, @types/*)
- [x] Configure TypeScript (tsconfig.json) with strict mode
- [x] Set up project folder structure (src/, tests/, docs/)

## Phase 2: Core Type System
- [x] Create base interfaces for Node, EdgeMap, ExecutionContext
- [x] Implement StateManager class with get/set/update methods
- [x] Create RuntimeContext interface and implementation
- [x] Create WorkflowDefinition and FlowElement type system

## Phase 3: Node System
- [x] Implement WorkflowEvent types and event emitter system
- [x] Create PauseToken mechanism for HITL support
- [x] Build Node registry system for dynamic node loading
- [x] Implement basic action nodes 
- [x] Implement whileCondition loop controller node
- [x] Implement forEach loop controller node

## Phase 4: Workflow Executor
- [x] Build the core workflow executor (executeFlow function)
- [x] Implement branch structure execution logic
- [x] Implement loop structure execution logic
- [x] Create node execution wrapper with error handling
- [x] Implement expression evaluator for conditions

## Phase 5: Human-in-the-Loop
- [x] Implement human node type with form schema support
- [x] Create HITL pause/resume mechanism

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
- **Completed**: 21
- **In Progress**: 0
- **Remaining**: 19

## Notes
- Update checkboxes as tasks are completed
- Add subtasks if needed for complex items
- Document any blockers or dependencies
- Reference commit hashes for major milestones