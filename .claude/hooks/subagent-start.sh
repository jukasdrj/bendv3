#!/bin/bash

# BooksTrack Backend Subagent Start Hook
# Executes when subagents are launched (Claude Code v2.0.43+)

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Parse subagent information using jq (if available)
if command -v jq &> /dev/null; then
  AGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // "unknown"')
  AGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // "unknown"')
else
  # Fallback if jq not available
  AGENT_TYPE="unknown"
  AGENT_ID="unknown"
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
esac

echo ""
echo "🤖 Launching subagent: $AGENT_NAME"
echo "   Agent ID: $AGENT_ID"
echo ""

# Optional: Could add context-specific setup here
# - Set environment variables for agent
# - Prepare working directory
# - Load project-specific configuration

exit 0
