#!/bin/bash

# BooksTrack Backend Post-Tool-Use Hook
# Automatically triggers relevant agents based on tool usage patterns

set -e

# ============================================================================
# CONFIGURATION
# ============================================================================
# Set AUTO_INVOKE_AGENTS=true to automatically run agents without prompting
# Set AUTO_INVOKE_AGENTS=false to only show suggestions (default)
AUTO_INVOKE_AGENTS=${AUTO_INVOKE_AGENTS:-true}

# Critical operations always auto-invoke (regardless of AUTO_INVOKE_AGENTS)
AUTO_INVOKE_CRITICAL=${AUTO_INVOKE_CRITICAL:-true}

# Minimum lines changed to trigger code review (avoid spam on trivial edits)
MIN_LINES_FOR_REVIEW=${MIN_LINES_FOR_REVIEW:-10}

# ============================================================================
# INPUT PARSING
# ============================================================================
# Read JSON input from stdin
INPUT=$(cat)

# Parse tool information using jq
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.command // empty')

# For Edit operations, try to estimate change size
if [[ "$TOOL_NAME" == "Edit" ]]; then
  OLD_STRING=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty')
  NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
  OLD_LINES=$(echo "$OLD_STRING" | wc -l | tr -d ' ')
  NEW_LINES=$(echo "$NEW_STRING" | wc -l | tr -d ' ')
  LINES_CHANGED=$((OLD_LINES > NEW_LINES ? OLD_LINES : NEW_LINES))
else
  LINES_CHANGED=999  # Assume significant for Write/Bash operations
fi

# Exit early if no tool name provided
if [ -z "$TOOL_NAME" ]; then
  exit 0
fi

# Track if we should invoke an agent
INVOKE_AGENT=""
AGENT_CONTEXT=""
IS_CRITICAL=false

# ============================================================================
# AGENT ROUTING LOGIC
# ============================================================================

# Deployment-related tools → cf-ops-monitor (CRITICAL)
if [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_PATH" | grep -qE "wrangler (deploy|publish)"; then
  INVOKE_AGENT="cf-ops-monitor"
  AGENT_CONTEXT="Deployment detected. Monitoring health and metrics..."
  IS_CRITICAL=true

# Wrangler rollback → cf-ops-monitor (CRITICAL)
elif [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_PATH" | grep -q "wrangler rollback"; then
  INVOKE_AGENT="cf-ops-monitor"
  AGENT_CONTEXT="Rollback executed. Verifying system stability..."
  IS_CRITICAL=true

# wrangler.toml changes → both agents (CRITICAL)
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "wrangler.toml"; then
  INVOKE_AGENT="cf-ops-monitor,cf-code-reviewer"
  AGENT_CONTEXT="wrangler.toml modified. Validating configuration and deployment impact..."
  IS_CRITICAL=true

# Code changes to handlers/services → cf-code-reviewer (if substantial)
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -qE "src/(handlers|services|providers)/"; then
  if [ "$LINES_CHANGED" -ge "$MIN_LINES_FOR_REVIEW" ]; then
    INVOKE_AGENT="cf-code-reviewer"
    AGENT_CONTEXT="Code changes in $TOOL_PATH detected ($LINES_CHANGED lines). Running quality review..."
    IS_CRITICAL=false
  fi

# Log streaming → cf-ops-monitor (non-critical, informational)
elif [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_PATH" | grep -q "wrangler tail"; then
  INVOKE_AGENT="cf-ops-monitor"
  AGENT_CONTEXT="Log streaming active. Analyzing patterns..."
  IS_CRITICAL=false
fi

# ============================================================================
# AGENT INVOCATION LOGIC
# ============================================================================
if [ -n "$INVOKE_AGENT" ]; then
  # Decide whether to auto-invoke based on settings
  SHOULD_AUTO_INVOKE=false

  if [ "$IS_CRITICAL" = true ] && [ "$AUTO_INVOKE_CRITICAL" = true ]; then
    # Critical operations always auto-invoke (if enabled)
    SHOULD_AUTO_INVOKE=true
  elif [ "$AUTO_INVOKE_AGENTS" = true ]; then
    # Non-critical operations auto-invoke if global setting enabled
    SHOULD_AUTO_INVOKE=true
  fi

  if [ "$SHOULD_AUTO_INVOKE" = true ]; then
    # AUTO-INVOKE MODE: Trigger agent(s) immediately
    echo ""
    echo "🤖 AUTO-INVOKING: $AGENT_CONTEXT"
    echo ""

    # Invoke each agent in the list
    for agent in $(echo "$INVOKE_AGENT" | tr ',' ' '); do
      echo "   ⚡ Launching skill: $agent"
      echo "<user-prompt-submit-hook>/skill $agent</user-prompt-submit-hook>"
    done

    echo ""
    echo "   💡 Tip: Set AUTO_INVOKE_AGENTS=false in your shell to disable auto-invoke"
    echo ""
  else
    # SUGGESTION MODE: Only notify user
    echo ""
    echo "🤖 Agent Trigger: $AGENT_CONTEXT"
    echo "   Relevant Skills: $INVOKE_AGENT"
    echo ""
    echo "   To invoke manually, use:"
    for agent in $(echo "$INVOKE_AGENT" | tr ',' ' '); do
      echo "   /skill $agent"
    done
    echo ""
    echo "   💡 Tip: Set AUTO_INVOKE_AGENTS=true in your shell to enable auto-invoke"
    echo ""
  fi
fi

exit 0
