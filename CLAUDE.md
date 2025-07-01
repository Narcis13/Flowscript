# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowScript is a declarative workflow system designed for orchestrating complex, long-running processes that involve both automated (agentic) tasks and essential human interaction. It uses a script-like JSON structure instead of traditional graph-based state machines.

### Key Features
- **Functional Nodes**: Atomic units of work that return edges with lazy-evaluated data
- **Explicit Control Flow**: First-class support for branching and looping structures
- **Human-in-the-Loop (HITL)**: Native support for pausing, resuming, and gathering human input
- **Edge-Based Routing**: Nodes communicate decisions through named edges

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Web Framework**: Hono (for REST API)
- **WebSocket**: Native ws library
- **State Management**: In-memory StateManager with persistence hooks
- **Event System**: Node.js EventEmitter

## Project Structure

```
src/
├── core/          # Core types, state manager, runtime, executor
├── nodes/         # Node implementations (actions, controls, human)
├── api/           # REST and WebSocket endpoints
└── utils/         # Utility functions
```

# VERY IMPORTANT

  At the very start of every coding sessiom read the following docs:
  - A succint presentation of the specification of this project at: /docs/specs.md
  - The implementation plan at: /docs/implementation-plan.md
  - tasks/todo.md to evaluate the phase of the development we ar in
  After you implement something you MUST update the /tasks/todo.md so we can track the progress. If the task(s) you just implemented aent included in todo.md update this todo.md file accordingly.

## Common Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run development server
npm run dev

# Run tests
npm test

# Run specific test
npm test -- --testNamePattern="StateManager"

# Lint code
npm run lint

# Type check
npm run typecheck
```

## Core Concepts

### Node Structure
Nodes are the basic building blocks that:
- Receive an ExecutionContext with state and configuration
- Return an EdgeMap with named edges and lazy-evaluated data
- Can be action nodes, human nodes, or control nodes

### Workflow Definition
Workflows are JSON documents containing:
- Initial state
- Array of FlowElements (nodes, branches, loops)

### Control Flow
- **Sequential**: Simple array of nodes
- **Branch**: `[ConditionNode, BranchMap]`
- **Loop**: `[LoopController, NodeSequence]`

## Implementation Status

Track implementation progress in the todo list. Key phases:
1. Project setup and core types
2. Node system implementation
3. Workflow executor
4. HITL support
5. API layer (REST + WebSocket)
6. Testing and examples

## Notes

- The `.claude/settings.local.json` file contains permissions for basic file system operations
- Full specification available in `/docs/specs.md`
- Implementation plan in `/docs/implementation-plan.md`
- The repository is on the `main` branch