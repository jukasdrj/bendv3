# Auto-Invoke Agents Guide

## Overview

The BooksTrack backend uses **intelligent auto-invoke hooks** to automatically trigger specialized agents when you perform specific operations. This creates a **proactive AI assistant** that monitors your work and provides help exactly when needed.

---

## How It Works

### 🎯 Trigger Detection
When you use certain tools (Bash, Write, Edit), the post-tool-use hook analyzes:
- **What tool** was used (deployment, code edit, config change)
- **What file** was affected (handlers, services, wrangler.toml)
- **How significant** the change was (lines changed)

### 🤖 Agent Selection
Based on the trigger, the hook routes to the right agent:
- **cf-ops-monitor**: Deployment, rollback, log streaming
- **cf-code-reviewer**: Code changes in handlers/services/providers
- **Both agents**: Critical config changes (wrangler.toml)

### ⚡ Auto-Invoke Decision
The hook decides whether to auto-invoke based on:
1. **Is it critical?** (deployment, rollback, config changes)
2. **Is auto-invoke enabled?** (environment variable)
3. **Is the change significant?** (minimum lines threshold)

---

## Configuration

### Environment Variables

Set these in your shell configuration (`.bashrc`, `.zshrc`, etc.):

```bash
# Enable/disable auto-invoke for ALL agents (default: true)
export AUTO_INVOKE_AGENTS=true

# Enable/disable auto-invoke for CRITICAL operations only (default: true)
export AUTO_INVOKE_CRITICAL=true

# Minimum lines changed to trigger code review (default: 10)
export MIN_LINES_FOR_REVIEW=10
```

### Quick Toggle Commands

```bash
# Enable auto-invoke everywhere
export AUTO_INVOKE_AGENTS=true

# Disable auto-invoke (suggestions only)
export AUTO_INVOKE_AGENTS=false

# Critical operations only (deploy, rollback, wrangler.toml)
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=true

# Disable everything (just manual /skill commands)
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=false
```

---

## What Gets Auto-Invoked?

### 🔴 Critical Operations (Always Auto-Invoke if `AUTO_INVOKE_CRITICAL=true`)

| Operation | Agent | Why Critical |
|-----------|-------|--------------|
| `wrangler deploy` | cf-ops-monitor | Production deployment needs health monitoring |
| `wrangler rollback` | cf-ops-monitor | Rollback requires stability verification |
| `wrangler.toml` edit | cf-ops-monitor + cf-code-reviewer | Config changes affect deployment and code |

### 🟡 Significant Operations (Auto-Invoke if `AUTO_INVOKE_AGENTS=true`)

| Operation | Agent | Trigger Condition |
|-----------|-------|-------------------|
| Edit `src/handlers/*.js` | cf-code-reviewer | Change ≥ 10 lines |
| Edit `src/services/*.js` | cf-code-reviewer | Change ≥ 10 lines |
| Edit `src/providers/*.js` | cf-code-reviewer | Change ≥ 10 lines |
| `wrangler tail` | cf-ops-monitor | Log streaming started |

### 🟢 Trivial Operations (Never Auto-Invoke)

- Edits < 10 lines (e.g., fixing typos, updating comments)
- Changes to test files, docs, or non-code files
- Read operations (Glob, Grep, Read)

---

## Examples

### Example 1: Deploying to Production

```bash
# You run:
npx wrangler deploy

# Hook detects: Critical deployment operation
# Auto-invokes: cf-ops-monitor
# Agent actions:
#   - Monitors deployment health
#   - Checks /health endpoint
#   - Tracks error rates for 5 minutes
#   - Auto-rollback if error rate > 1%
```

### Example 2: Editing a Handler

```bash
# You edit: src/handlers/search.js (30 lines changed)

# Hook detects: Significant code change
# Auto-invokes: cf-code-reviewer
# Agent actions:
#   - Reviews Workers patterns (KV cache, env bindings)
#   - Checks security (input validation, secrets)
#   - Validates performance (async patterns)
#   - Reports issues with severity levels
```

### Example 3: Fixing a Typo

```bash
# You edit: src/services/book-service.js (2 lines changed)

# Hook detects: Trivial change (< 10 lines)
# Action: No auto-invoke (avoids spam)
# Output: Silent (no notification)
```

### Example 4: Modifying wrangler.toml

```bash
# You edit: wrangler.toml

# Hook detects: Critical config change
# Auto-invokes: cf-ops-monitor + cf-code-reviewer
# cf-ops-monitor actions:
#   - Validates deployment config
#   - Checks secret bindings
#   - Verifies KV namespace IDs
# cf-code-reviewer actions:
#   - Reviews compatibility matrix
#   - Checks for breaking changes
```

---

## Workflow Scenarios

### Scenario A: Full Automation (Recommended)
**Goal**: Maximum assistance, agents always active

```bash
export AUTO_INVOKE_AGENTS=true
export AUTO_INVOKE_CRITICAL=true
export MIN_LINES_FOR_REVIEW=10
```

**Result**:
- ✅ Deployments monitored automatically
- ✅ Code reviews on every significant change
- ✅ Config changes validated immediately
- ✅ Minimal manual /skill invocations needed

### Scenario B: Critical-Only Automation
**Goal**: Auto-invoke for risky operations, manual for code review

```bash
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=true
export MIN_LINES_FOR_REVIEW=10
```

**Result**:
- ✅ Deployments monitored automatically
- ❌ Code reviews require manual `/skill cf-code-reviewer`
- ✅ Config changes validated immediately
- ⚠️ More manual work, but less "noise"

### Scenario C: Suggestion-Only Mode
**Goal**: Full manual control, hooks just suggest

```bash
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=false
```

**Result**:
- ❌ All agents require manual invocation
- ✅ Hook still notifies you when agents are relevant
- ✅ Useful if you prefer explicit control

---

## Customization

### Adjust Review Threshold

```bash
# Review every change (even small ones)
export MIN_LINES_FOR_REVIEW=1

# Only review major changes
export MIN_LINES_FOR_REVIEW=50

# Review everything except trivial fixes
export MIN_LINES_FOR_REVIEW=10  # Default
```

### Per-Session Toggle

```bash
# Temporarily disable for this session
export AUTO_INVOKE_AGENTS=false

# Work on your code...

# Re-enable
export AUTO_INVOKE_AGENTS=true
```

### Project-Specific Settings

Create `.env.local` (gitignored):
```bash
# BooksTrack-specific auto-invoke settings
export AUTO_INVOKE_AGENTS=true
export AUTO_INVOKE_CRITICAL=true
export MIN_LINES_FOR_REVIEW=15  # Higher threshold for this project
```

Load with: `source .env.local`

---

## Troubleshooting

### "Agents aren't auto-invoking"

**Check your settings:**
```bash
echo "AUTO_INVOKE_AGENTS: $AUTO_INVOKE_AGENTS"
echo "AUTO_INVOKE_CRITICAL: $AUTO_INVOKE_CRITICAL"
echo "MIN_LINES_FOR_REVIEW: $MIN_LINES_FOR_REVIEW"
```

**Verify hook is enabled:**
```bash
cat .claude/settings.json | jq '.hooks.PostToolUse'
```

**Test hook manually:**
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"wrangler deploy"}}' | \
  .claude/hooks/post-tool-use.sh
```

### "Too many agents auto-invoking"

**Reduce sensitivity:**
```bash
export MIN_LINES_FOR_REVIEW=50  # Higher threshold
```

**Or disable non-critical auto-invoke:**
```bash
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=true
```

### "Agents invoking on trivial changes"

**Increase minimum lines:**
```bash
export MIN_LINES_FOR_REVIEW=20
```

**Or disable auto-invoke temporarily:**
```bash
export AUTO_INVOKE_AGENTS=false
# Make trivial changes...
export AUTO_INVOKE_AGENTS=true
```

---

## Advanced: Extending the Hook

### Add New Agent Triggers

Edit `.claude/hooks/post-tool-use.sh`:

```bash
# Security audit on auth changes
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "src/utils/auth.js"; then
  INVOKE_AGENT="cf-security-auditor"
  AGENT_CONTEXT="Authentication code changed. Running security audit..."
  IS_CRITICAL=true
```

### Add Time-Based Conditions

```bash
# Only auto-invoke during work hours (9 AM - 6 PM)
HOUR=$(date +%H)
if [ "$HOUR" -ge 9 ] && [ "$HOUR" -le 18 ]; then
  SHOULD_AUTO_INVOKE=true
fi
```

### Add Cooldown Period

```bash
# Prevent spam by adding cooldown
LAST_INVOKE_FILE="/tmp/claude-hook-last-invoke"
if [ -f "$LAST_INVOKE_FILE" ]; then
  LAST_INVOKE=$(cat "$LAST_INVOKE_FILE")
  NOW=$(date +%s)
  DIFF=$((NOW - LAST_INVOKE))
  if [ "$DIFF" -lt 60 ]; then
    # Less than 60 seconds since last invoke, skip
    exit 0
  fi
fi
echo "$(date +%s)" > "$LAST_INVOKE_FILE"
```

---

## Best Practices

### ✅ Do:
- **Enable auto-invoke** for critical operations (deploy, rollback)
- **Set reasonable thresholds** (10-20 lines for code review)
- **Monitor agent output** to ensure quality
- **Adjust settings** based on your workflow

### ❌ Don't:
- **Set threshold too low** (< 5 lines = spam)
- **Disable critical auto-invoke** (risky deployments)
- **Ignore agent warnings** (they're there for a reason)
- **Auto-invoke on trivial changes** (wastes resources)

---

## Integration with Zen MCP

Auto-invoked agents can escalate to Zen MCP tools:

```bash
# cf-code-reviewer finds security issue
# → Escalates to: mcp zen secaudit

# cf-ops-monitor detects error spike
# → Escalates to: mcp zen debug
```

This creates a **multi-tier AI assistant** that handles routine tasks automatically and escalates complex issues to more powerful models.

---

## Status

✅ **Implemented**: Auto-invoke mode with configurable triggers
✅ **Tested**: Critical operations (deploy, rollback, config)
✅ **Documented**: Configuration, examples, troubleshooting
🚧 **Next**: Add cooldown period, time-based conditions, more agents

---

**Last Updated**: November 14, 2025
**Maintained By**: AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer)
