# BooksTrack Autonomous Agent Setup

**Status:** ✅ Complete
**Created:** November 13, 2025
**Project:** BooksTrack Cloudflare Workers API

---

## What Was Created

### 🤖 Two Specialized Agents

#### 1. cf-ops-monitor (Deployment & Observability)
**Location:** `.claude/skills/cf-ops-monitor/skill.md`

**Autonomous Capabilities:**
- Execute `npx wrangler deploy` with pre/post health checks
- Stream logs via `wrangler tail` and analyze error patterns
- Auto-rollback on error rate > 5% for 5 minutes
- Monitor KV cache hit rates and Durable Object metrics
- Track external API quota usage (Google Books, ISBNdb, Gemini)
- Profile cold start times and P95 latency

**Invoke with:**
```bash
/skill cf-ops-monitor
```

---

#### 2. cf-code-reviewer (Code Quality & Best Practices)
**Location:** `.claude/skills/cf-code-reviewer/skill.md`

**Review Focus:**
- Cloudflare Workers-specific patterns (env bindings, KV cache, Durable Objects)
- Security (input validation, secrets management, CORS)
- Performance (async patterns, blocking operations, timeouts)
- Canonical response format compliance
- Service layer separation (handlers → services → providers)
- Anti-pattern detection (event loop blocking, missing cache, synchronous waits)

**Invoke with:**
```bash
/skill cf-code-reviewer
```

---

### 🔗 Automated Hook Integration

#### post-tool-use.sh (Agent Triggers)
**Location:** `.claude/hooks/post-tool-use.sh`

**Automatic Suggestions:**
- `wrangler deploy` → Suggests `cf-ops-monitor`
- `wrangler rollback` → Suggests `cf-ops-monitor`
- `wrangler tail` → Suggests `cf-ops-monitor`
- Code changes in `src/handlers/` → Suggests `cf-code-reviewer`
- Code changes in `src/services/` → Suggests `cf-code-reviewer`
- `wrangler.toml` edits → Suggests both agents

**Example Output:**
```
🤖 Agent Trigger: Deployment detected. Monitoring health and metrics...
   Relevant Skills: cf-ops-monitor

   To invoke manually, use:
   /skill cf-ops-monitor
```

---

#### pre-commit.sh (Quality Gates)
**Location:** `.claude/hooks/pre-commit.sh`

**Blocks commits with:**
- Sensitive files (`.env`, `.dev.vars`, `credentials.json`)
- Hardcoded API keys or secrets
- JavaScript syntax errors
- Invalid `wrangler.toml` configuration

**Warns about:**
- Debug statements (`console.log`, `debugger`)
- Large files > 1MB (should use R2)
- Missing test files for new handlers
- API documentation not updated

---

### 📚 Documentation

#### .claude/skills/README.md
Complete guide to:
- Agent capabilities and use cases
- Invocation methods (manual and automatic)
- Agent coordination and handoff patterns
- Customization and extension
- Troubleshooting and best practices

#### .claude/hooks/README.md
Hook documentation covering:
- Installation and setup
- Trigger conditions and customization
- Testing and troubleshooting
- Integration with CI/CD
- Best practices for maintenance

#### .claude/CLAUDE.md (Updated)
Main project guidelines now include:
- AI Tool Hierarchy (4 levels)
- Agent coordination workflows
- Hook-based triggers
- Incident response patterns

---

## How to Use

### Deploy to Production
```bash
# Method 1: Ask Claude Code
"Deploy the latest changes to production"

# Method 2: Direct invocation
/skill cf-ops-monitor

# Agent will:
# 1. Run pre-flight checks
# 2. Execute wrangler deploy
# 3. Monitor /health endpoint
# 4. Stream logs for 5 minutes
# 5. Auto-rollback if error rate > 5%
```

### Review Code Before PR
```bash
# Method 1: After code changes
# Hook automatically suggests: /skill cf-code-reviewer

# Method 2: Manual invocation
/skill cf-code-reviewer

# Agent will:
# 1. Validate Workers-specific patterns
# 2. Check security (input validation, secrets)
# 3. Analyze performance (async, caching)
# 4. Verify canonical response format
# 5. Suggest improvements
```

### Investigate Production Errors
```bash
# Ask Claude Code
"We're seeing 5xx errors on /v1/search/isbn"

# Claude Code will:
# 1. Invoke cf-ops-monitor
# 2. Stream wrangler tail logs
# 3. Analyze error patterns
# 4. Identify root cause
# 5. Suggest fix
# 6. Invoke cf-code-reviewer to validate fix
```

---

## Agent Workflows

### Code Change Workflow
```
User makes change → Hook suggests cf-code-reviewer → Agent reviews
                  → Claude Code refactors if needed
                  → Hook suggests cf-ops-monitor → Agent deploys
                  → Auto-monitors health → Rollback if errors
```

### Incident Response Workflow
```
Production error → User asks Claude Code → cf-ops-monitor investigates
                 → Identifies root cause → Claude Code fixes
                 → cf-code-reviewer validates → cf-ops-monitor deploys
                 → Monitors recovery
```

### New Feature Workflow
```
Claude Code implements → cf-code-reviewer validates → Zen MCP deep review
                      → cf-ops-monitor deploys → Monitors metrics
                      → Jules documents in PR
```

---

## Customization

### Add New Agent Trigger
Edit `.claude/hooks/post-tool-use.sh`:

```bash
# Example: Trigger on Durable Object changes
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "durable-objects/"; then
  INVOKE_AGENT="cf-code-reviewer,cf-ops-monitor"
  AGENT_CONTEXT="Durable Object modified. Validate WebSocket patterns..."
fi
```

### Extend Agent Capabilities
Edit `.claude/skills/{agent-name}/skill.md`:

**Add to cf-ops-monitor:**
- New monitoring metrics (WebSocket connection count)
- Custom alert thresholds
- Integration with external observability tools

**Add to cf-code-reviewer:**
- New anti-pattern detection rules
- Custom linting rules specific to your codebase
- Performance benchmarks

---

## Integration with Existing Tools

### AI Tool Hierarchy

**Level 1: Inline**
- GitHub Copilot (code completion)

**Level 2: Project Agents (NEW)**
- cf-ops-monitor (deployment & monitoring)
- cf-code-reviewer (code quality)

**Level 3: Orchestration**
- Claude Code (multi-file refactoring)
- Jules (PR reviews)

**Level 4: Deep Analysis**
- Zen MCP (debug, secaudit, codereview, thinkdeep)

### Handoff Rules

**cf-code-reviewer → Zen MCP:**
- Complex architectural issues
- Security vulnerabilities requiring deep analysis
- Performance bottlenecks needing profiling

**cf-ops-monitor → Zen MCP:**
- Complex debugging (use `mcp__zen__debug`)
- Pre-commit validation (use `mcp__zen__precommit`)
- Security audit (use `mcp__zen__secaudit`)

**Both Agents → Claude Code:**
- Multi-file refactoring
- Architecture changes
- Cross-cutting concerns

---

## Testing the Setup

### Test Agent Invocation
```bash
# Invoke cf-ops-monitor
/skill cf-ops-monitor

# Expected: Agent provides deployment guidance

# Invoke cf-code-reviewer
/skill cf-code-reviewer

# Expected: Agent asks which files to review
```

### Test Hook Triggers
```bash
# Test deployment hook
npx wrangler deploy --dry-run

# Expected: Hook suggests cf-ops-monitor

# Test code change hook (simulate)
export CLAUDE_TOOL_NAME="Edit"
export CLAUDE_TOOL_PATH="src/handlers/search.js"
.claude/hooks/post-tool-use.sh

# Expected: Hook suggests cf-code-reviewer
```

### Test Pre-Commit Hook
```bash
# Create test commit with debug statement
echo "console.log('test')" >> src/test.js
git add src/test.js
git commit -m "Test"

# Expected: Hook warns about debug statement

# Cleanup
git reset HEAD~1
rm src/test.js
```

---

## Troubleshooting

### Agent Not Found
**Error:** "Skill not found: cf-ops-monitor"

**Solution:**
```bash
# Verify skill file exists
ls -la .claude/skills/cf-ops-monitor/skill.md

# Check Claude Code can read it
cat .claude/skills/cf-ops-monitor/skill.md
```

### Hook Not Triggering
**Symptom:** No agent suggestions after tool use

**Solution:**
```bash
# Make hook executable
chmod +x .claude/hooks/post-tool-use.sh

# Test manually
bash .claude/hooks/post-tool-use.sh
```

### Agent Behavior Incorrect
**Symptom:** Agent suggests wrong actions

**Solution:**
1. Review skill definition: `.claude/skills/{agent}/skill.md`
2. Update capabilities and examples
3. Test with `/skill {agent-name}`

---

## Maintenance

### Regular Updates
- **Monthly:** Review agent trigger patterns
- **Quarterly:** Update agent capabilities based on new Workers features
- **After major incidents:** Document learnings in agent skill files

### Performance Monitoring
- Track agent invocation frequency
- Measure deployment success rate with cf-ops-monitor
- Collect feedback on code review quality from cf-code-reviewer

### Evolution Path
- [ ] Add cost tracking to cf-ops-monitor
- [ ] Integrate cf-code-reviewer with GitHub PR comments
- [ ] Create cf-test-runner agent for automated testing
- [ ] Add cf-security-audit agent for deeper security analysis

---

## Benefits

### Before Agents
- Manual deployment with no automatic monitoring
- Inconsistent code review patterns
- No automatic rollback on errors
- Manual log analysis
- Ad-hoc security checks

### After Agents
- ✅ Autonomous deployment with health monitoring
- ✅ Consistent Workers-specific code review
- ✅ Automatic rollback on error spikes
- ✅ Intelligent log pattern analysis
- ✅ Systematic security validation
- ✅ Cost optimization recommendations
- ✅ Performance profiling built-in

---

## File Structure

```
.claude/
├── CLAUDE.md                   # Main project guidelines (updated)
├── AGENT_SETUP.md             # This file
├── hooks/
│   ├── README.md              # Hook documentation
│   ├── pre-commit.sh          # Git pre-commit validation
│   └── post-tool-use.sh       # Agent trigger suggestions (new)
└── skills/
    ├── README.md              # Agent usage guide (new)
    ├── cf-ops-monitor/
    │   └── skill.md           # Deployment & monitoring agent (new)
    └── cf-code-reviewer/
        └── skill.md           # Code quality agent (new)
```

---

## Next Steps

### Immediate
1. ✅ Test agent invocation: `/skill cf-ops-monitor`
2. ✅ Test hook triggers with code changes
3. ✅ Deploy using cf-ops-monitor
4. ✅ Review code using cf-code-reviewer

### Short-term
- Customize agent behaviors for your workflow
- Add project-specific patterns to cf-code-reviewer
- Integrate agents with CI/CD pipeline
- Document incident response playbooks

### Long-term
- Create additional specialized agents (testing, security)
- Build agent telemetry dashboard
- Share agent patterns with team
- Contribute improvements back to Claude Code

---

**Congratulations!** Your BooksTrack backend now has autonomous AI agents managing deployments and code quality. 🎉

**Questions?** Review:
- `.claude/skills/README.md` - Agent usage guide
- `.claude/hooks/README.md` - Hook documentation
- `.claude/CLAUDE.md` - Project guidelines

**Invoke agents anytime:**
- `/skill cf-ops-monitor` - For deployments and monitoring
- `/skill cf-code-reviewer` - For code quality reviews

---

**Last Updated:** November 13, 2025
**Created By:** Claude Code
**Status:** Production Ready ✅
