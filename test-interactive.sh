#!/bin/bash

# Test script for interactive human-in-the-loop workflows

echo "🧪 FlowScript Interactive HITL Testing"
echo "======================================"
echo ""

# Build the project first
echo "📦 Building project..."
npm run build

echo ""
echo "🎮 Test 1: Guess the Number Game"
echo "--------------------------------"
echo "This workflow demonstrates interactive human input with:"
echo "- Form-based number input"
echo "- Conditional branching based on guesses"
echo "- Loop control for multiple attempts"
echo "- Final results display"
echo ""
echo "Starting game..."
echo ""

# Run the guess number game workflow
node dist/cli/index.js run-interactive workflows/test/guess-number-game.json

echo ""
echo "✅ Test completed!"