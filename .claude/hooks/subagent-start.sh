#!/bin/bash

# BooksTrack Backend Subagent Start Hook
# Executes when subagents are launched (Claude Code v2.0.43+)
#
# Claude Code 2.0.64+ Features:
# - Agents can run asynchronously with run_in_background parameter
# - Use TaskOutput tool to retrieve results (replaces AgentOutputTool)
# - Background agents can send wake messages to main agent

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Parse subagent information using jq (if available)
if command -v jq &> /dev/null; then
  AGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // "unknown"')
  AGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // "unknown"')
  RUN_IN_BACKGROUND=$(echo "$INPUT" | jq -r '.run_in_background // "false"')
else
  # Fallback if jq not available
  AGENT_TYPE="unknown"
  AGENT_ID="unknown"
  RUN_IN_BACKGROUND="false"
fi

# Map agent types to friendly names
AGENT_NAME="$AGENT_TYPE"
case "$AGENT_TYPE" in
  *"haiku"*|*"Haiku"*)
    AGENT_NAME="⚡ Haiku (Implementation Specialist)"
    ;;
  *"grok"*|*"Grok"*)
    AGENT_NAME="🔍 Grok-4 (Quality Reviewer)"
    ;;
  *"cf-ops-monitor"*)
    AGENT_NAME="🚀 CF Ops Monitor"
    ;;
  *"cf-code-reviewer"*)
    AGENT_NAME="✅ CF Code Reviewer"
    ;;
  *"Explore"*)
    AGENT_NAME="🔎 Codebase Explorer"
    ;;
  *"Plan"*)
    AGENT_NAME="📋 Implementation Planner"
    ;;
esac

echo ""
if [ "$RUN_IN_BACKGROUND" = "true" ]; then
  echo "🤖 Launching subagent (background): $AGENT_NAME"
  echo "   Agent ID: $AGENT_ID"
  echo "   📋 Use TaskOutput tool to retrieve results when ready"
else
  echo "🤖 Launching subagent: $AGENT_NAME"
  echo "   Agent ID: $AGENT_ID"
fi
echo ""

# Optional: Could add context-specific setup here
# - Set environment variables for agent
# - Prepare working directory
# - Load project-specific configuration

exit 0
