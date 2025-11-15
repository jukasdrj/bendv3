# BooksTrack Autonomous Agents

This directory contains specialized AI agents that work autonomously to manage Cloudflare Workers deployments and code quality.

---

## Available Agents

### 🚀 cf-ops-monitor
**Purpose:** Deployment automation, observability, and incident response

**Invoke:**
```bash
# Manual invocation
/skill cf-ops-monitor

# Ask Claude Code to invoke
"Use the cf-ops-monitor agent to deploy and monitor the latest changes"
```

**Automatic Triggers:**
- When `wrangler deploy` is executed
- When `wrangler tail` streams logs
- When `wrangler.toml` is modified

**Common Tasks:**
- Deploy to production with health checks
- Investigate error spikes in logs
- Analyze performance bottlenecks
- Monitor KV cache hit rates
- Track external API quota usage
- Auto-rollback on failures

---

### ✅ cf-code-reviewer
**Purpose:** Code quality enforcement for Cloudflare Workers patterns

**Invoke:**
```bash
# Manual invocation
/skill cf-code-reviewer

# Ask Claude Code to invoke
"Have the cf-code-reviewer validate my changes to the search handler"
```

**Automatic Triggers:**
- When code in `src/handlers/` or `src/services/` is modified
- When `wrangler.toml` is updated

**Common Tasks:**
- Pre-PR code reviews
- Validate Workers-specific patterns
- Check security (input validation, secrets)
- Enforce canonical response format
- Detect anti-patterns (blocking, missing timeouts)
- Performance optimization suggestions

---

## Agent Coordination

### When Both Agents Work Together
- **Config changes:** `wrangler.toml` modifications trigger both agents
- **Major refactors:** `cf-code-reviewer` validates, then `cf-ops-monitor` deploys
- **Incident response:** `cf-ops-monitor` detects issue, `cf-code-reviewer` validates fix

### Escalation to Zen MCP
For complex issues requiring deep analysis:
- Security vulnerabilities → `@zen secaudit`
- Complex bugs → `@zen debug`
- Architecture review → `@zen codereview`
- Multi-stage reasoning → `@zen thinkdeep`

---

## Hook Integration

### Post-Tool-Use Hook
Location: `.claude/hooks/post-tool-use.sh`

**Monitors:**
- `Bash` tool executing `wrangler` commands
- `Write`/`Edit` tools modifying Workers code
- Changes to deployment configuration

**Suggests agent invocation** when relevant operations are detected.

### Pre-Commit Hook
Location: `.claude/hooks/pre-commit.sh`

**Validates:**
- No sensitive files committed
- No hardcoded secrets
- JavaScript syntax validity
- `wrangler.toml` configuration
- Test coverage for new handlers

---

## Agent Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User Request                      │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│              Claude Code (Orchestrator)             │
│  - Multi-file refactoring                           │
│  - Architecture decisions                           │
│  - Agent coordination                               │
└───┬─────────────────────────────────────────────┬───┘
    │                                             │
    ▼                                             ▼
┌───────────────────────┐         ┌───────────────────────────┐
│   cf-code-reviewer    │         │     cf-ops-monitor        │
│  - Code quality       │         │  - Deployment             │
│  - Workers patterns   │◄───────►│  - Monitoring             │
│  - Security checks    │         │  - Rollback               │
└───────────┬───────────┘         └───────────┬───────────────┘
            │                                  │
            │         ┌────────────────────┐   │
            └────────►│   Zen MCP Tools    │◄──┘
                      │  - debug           │
                      │  - secaudit        │
                      │  - codereview      │
                      │  - thinkdeep       │
                      └────────────────────┘
```

---

## Usage Examples

### Example 1: Deploy New Feature
```
User: "Deploy the new batch enrichment feature to production"

Claude Code:
  1. Invokes cf-code-reviewer to validate code quality
  2. Invokes cf-ops-monitor to deploy with health checks
  3. cf-ops-monitor streams logs for 5 minutes
  4. Auto-rollback if error rate exceeds threshold
```

### Example 2: Investigate Production Errors
```
User: "We're seeing 5xx errors on /v1/search/isbn"

cf-ops-monitor:
  1. Streams npx wrangler tail --remote to analyze error patterns
  2. Identifies Google Books API timeout issue
  3. Checks KV cache hit rate (low, causing more API calls)
  4. Suggests increasing cache TTL
  5. Hands off to cf-code-reviewer to validate fix
```

### Example 3: Code Review Before PR
```
User: "Review my changes to the bookshelf scan handler"

cf-code-reviewer:
  1. Validates input sanitization for user uploads
  2. Checks Gemini API timeout (should be 30s max)
  3. Ensures proper error handling for AI failures
  4. Validates canonical response format
  5. Suggests extracting OCR logic to service layer
```

---

## Customization

### Adding New Agent Behaviors

**Location:** `.claude/skills/{agent-name}/skill.md`

**Structure:**
```markdown
# Agent Name

**Purpose:** Brief description

**When to use:** Trigger conditions

---

## Core Responsibilities
1. Responsibility 1
2. Responsibility 2

## Autonomous Capabilities
- Capability 1
- Capability 2

## Common Operations
- Operation 1 with code examples
```

### Modifying Hook Triggers

**Location:** `.claude/hooks/post-tool-use.sh`

**Add new trigger:**
```bash
# Example: Trigger on test file changes
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "test/"; then
  INVOKE_AGENT="test-runner"
  AGENT_CONTEXT="Test files modified. Running test suite..."
fi
```

---

## Best Practices

### When to Use Agents
- ✅ **cf-ops-monitor:** Production deployments, live debugging, metrics analysis
- ✅ **cf-code-reviewer:** Pre-PR reviews, refactoring validation, pattern enforcement
- ✅ **Zen MCP:** Deep investigations, security audits, complex architectural decisions

### When NOT to Use Agents
- ❌ Simple one-line changes (use Claude Code directly)
- ❌ Documentation updates (unless API changes)
- ❌ Non-Workers specific code (generic Node.js patterns)

### Agent Response Time
- **cf-code-reviewer:** ~30 seconds for single file review
- **cf-ops-monitor:** ~2 minutes for deployment + monitoring
- **Zen MCP tools:** ~1-5 minutes depending on complexity

---

## Troubleshooting

### Agent Not Auto-Invoking
1. Check hook is executable: `ls -la .claude/hooks/`
2. Verify hook output: Check for agent suggestions in terminal
3. Manually invoke: `/skill {agent-name}`

### Agent Suggestions Incorrect
1. Review agent skill definition: `.claude/skills/{agent}/skill.md`
2. Update trigger conditions in `.claude/hooks/post-tool-use.sh`
3. Provide feedback to improve agent behavior

### Hook Execution Errors
```bash
# Test hook manually
bash .claude/hooks/post-tool-use.sh

# Check logs
echo $CLAUDE_TOOL_NAME
echo $CLAUDE_TOOL_PATH
```

---

## Contributing

### Adding a New Agent
1. Create directory: `.claude/skills/{agent-name}/`
2. Write skill definition: `skill.md` with capabilities and examples
3. Update hook triggers: `.claude/hooks/post-tool-use.sh`
4. Update this README with agent description
5. Test invocation: `/skill {agent-name}`

### Improving Existing Agents
1. Edit skill definition: `.claude/skills/{agent-name}/skill.md`
2. Add new capabilities or refine existing ones
3. Update `.claude/CLAUDE.md` if major changes
4. Test with real scenarios before committing

---

**Last Updated:** November 13, 2025
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer)
