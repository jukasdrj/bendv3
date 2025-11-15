#!/bin/bash

# BooksTrack Backend Subagent Stop Hook
# Logs agent completion and summarizes findings

set -e

# Read JSON input from stdin
INPUT=$(cat)

# Parse agent information using jq
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // "unknown"')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.agent_transcript_path // empty')

# Map agent IDs to friendly names
AGENT_NAME="$AGENT_ID"
case "$AGENT_ID" in
  *"cf-ops-monitor"*)
    AGENT_NAME="Deployment & Ops Monitor"
    ;;
  *"cf-code-reviewer"*)
    AGENT_NAME="Code Quality Reviewer"
    ;;
esac

echo ""
echo "✅ Agent completed: $AGENT_NAME"

# If transcript path is available, we could optionally extract summary
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  echo "   Transcript: $TRANSCRIPT_PATH"
fi

echo ""

exit 0
