#!/bin/bash

# BooksTrack Backend - User Prompt Submit Hook
# Detects multi-step tasks and suggests planning workflow
#
# Context: Solo-dev family app
# - Pragmatic complexity detection (not overly aggressive)
# - Encourages planning for YOUR benefit (not bureaucracy)
# - Focuses on time-saving, not process compliance

set -e

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

# Skip empty prompts
if [ -z "$PROMPT" ]; then
  exit 0
fi

# Count indicators of complexity (calibrated for "will I forget something?" threshold)
COMPLEXITY_SCORE=0

# Multi-step indicators (2 points - strong signal)
echo "$PROMPT" | grep -qiE "(step|phase|first.*then|after.*then|next|sequence)" && ((COMPLEXITY_SCORE+=2))

# Feature implementation (2 points - usually multi-step)
echo "$PROMPT" | grep -qiE "(implement|build|create|add feature|refactor|migrate)" && ((COMPLEXITY_SCORE+=2))

# Multiple components (1 point each)
echo "$PROMPT" | grep -qiE "(and|also|additionally|then)" && ((COMPLEXITY_SCORE+=1))
echo "$PROMPT" | grep -qiE "(test|document|deploy)" && ((COMPLEXITY_SCORE+=1))

# Integration/orchestration (2 points - high complexity)
echo "$PROMPT" | grep -qiE "(integrate|orchestrate|workflow|pipeline)" && ((COMPLEXITY_SCORE+=2))

# Multiple questions (1 point - needs investigation)
QUESTION_COUNT=$(echo "$PROMPT" | grep -o "?" | wc -l | tr -d ' ')
[ "$QUESTION_COUNT" -ge 2 ] && ((COMPLEXITY_SCORE+=1))

# Length-based heuristic (>200 chars = likely complex)
PROMPT_LENGTH=${#PROMPT}
[ "$PROMPT_LENGTH" -gt 200 ] && ((COMPLEXITY_SCORE+=1))

# Threshold: 4+ points = suggest planning
# Why 4? Catches "multi-file features" but skips "quick fixes"
if [ $COMPLEXITY_SCORE -ge 4 ]; then
  echo ""
  echo "💡 MULTI-STEP TASK DETECTED (complexity: $COMPLEXITY_SCORE)"
  echo ""
  echo "   Recommended: /pm-workflow or /planning-with-files"
  echo ""
  echo "   Benefits for YOU (solo-dev):"
  echo "   ✓ Don't lose context mid-task (planning files persist)"
  echo "   ✓ Track what worked/failed (save future-you time)"
  echo "   ✓ Parallel subagent work (Haiku codes while you plan)"
  echo "   ✓ Optional PAL review (use for risky changes only)"
  echo ""
  echo "   Creates:"
  echo "   - task_plan.md (phases, decisions, progress)"
  echo "   - findings.md (research, patterns discovered)"
  echo "   - progress.md (session log, errors, tests)"
  echo ""
  echo "   ⚡ Quick start: /pm-workflow \"<your task>\""
  echo ""

  # Optional: Auto-invoke for very high complexity (6+ points)
  # Uncomment if you want workflow to start automatically for big tasks
  # if [ $COMPLEXITY_SCORE -ge 6 ]; then
  #   echo "<user-prompt-submit-hook>/pm-workflow</user-prompt-submit-hook>"
  # fi
fi

exit 0
