# BooksTrack Hooks

Automated checks and agent triggers for Cloudflare Workers development.

---

## Available Hooks

### 🔒 pre-commit.sh (Git Hook)
Runs code quality and security checks before allowing commits.

**Installation:**
```bash
ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit
chmod +x .claude/hooks/pre-commit.sh
```

**Checks Performed:**

#### 🔐 Security
- **Sensitive files:** Blocks `.env`, `.dev.vars`, `credentials.json`
- **Hardcoded secrets:** Detects API keys (Google Books, ISBNdb, Gemini)
- **Large files:** Warns about files > 1MB (should use R2 storage)

#### ✨ Code Quality
- **JavaScript syntax:** Validates with `node --check`
- **Prettier formatting:** Checks code formatting (if installed)
- **Debug statements:** Warns about `console.log()`, `debugger`

#### ⚙️ Configuration
- **wrangler.toml:** Validates Cloudflare Workers config
- **API documentation:** Reminds to update `docs/API_README.md` when handlers change

#### 🧪 Testing
- **Test coverage:** Warns if new handlers lack test files

**Bypass (emergencies only):**
```bash
git commit --no-verify -m "Emergency production fix"
```

---

### 🤖 post-tool-use.sh (Claude Code Hook)
**Automatically invokes relevant agents** based on tool usage patterns.

**⚡ NEW: Auto-Invoke Mode**
The hook now **automatically launches agents** when triggered, creating a proactive AI assistant. See [AUTO_INVOKE_GUIDE.md](./AUTO_INVOKE_GUIDE.md) for full documentation.

**Configuration:**
```bash
# Enable auto-invoke (default: true)
export AUTO_INVOKE_AGENTS=true

# Enable critical operations only (deploy, rollback, config)
export AUTO_INVOKE_CRITICAL=true

# Minimum lines changed to trigger code review
export MIN_LINES_FOR_REVIEW=10
```

**How It Works:**
Monitors Claude Code tool invocations and automatically launches specialized agents when relevant operations are detected.

**Automatic Triggers:**

| Tool Activity | Triggered Agent | Priority | Auto-Invoke |
|--------------|----------------|----------|-------------|
| `wrangler deploy` | `cf-ops-monitor` | 🔴 Critical | Always (if enabled) |
| `wrangler rollback` | `cf-ops-monitor` | 🔴 Critical | Always (if enabled) |
| Edits to `wrangler.toml` | Both agents | 🔴 Critical | Always (if enabled) |
| Code changes in `src/handlers/` | `cf-code-reviewer` | 🟡 Significant | If ≥ 10 lines changed |
| Code changes in `src/services/` | `cf-code-reviewer` | 🟡 Significant | If ≥ 10 lines changed |
| Code changes in `src/providers/` | `cf-code-reviewer` | 🟡 Significant | If ≥ 10 lines changed |
| `wrangler tail` | `cf-ops-monitor` | 🟢 Informational | Optional |

**Example Output (Auto-Invoke Mode):**
```
🤖 AUTO-INVOKING: Deployment detected. Monitoring health and metrics...

   ⚡ Launching skill: cf-ops-monitor

   💡 Tip: Set AUTO_INVOKE_AGENTS=false in your shell to disable auto-invoke
```

**Example Output (Suggestion Mode):**
```
🤖 Agent Trigger: Code changes in src/handlers/search.js detected (23 lines). Running quality review...
   Relevant Skills: cf-code-reviewer

   To invoke manually, use:
   /skill cf-code-reviewer

   💡 Tip: Set AUTO_INVOKE_AGENTS=true in your shell to enable auto-invoke
```

**Customization:**
Add new triggers by editing `.claude/hooks/post-tool-use.sh`:

```bash
# Example: Trigger on Durable Object changes
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "durable-objects/"; then
  INVOKE_AGENT="cf-code-reviewer,cf-ops-monitor"
  AGENT_CONTEXT="Durable Object modified. Validate WebSocket patterns..."
fi
```

---

## Hook Integration with Agents

### Agent Coordination Flow

```
┌─────────────────────────────────────────┐
│     Claude Code Tool Execution          │
│  (Write, Edit, Bash with wrangler)      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│       post-tool-use.sh Hook             │
│  - Analyzes tool name and file path     │
│  - Matches trigger conditions           │
│  - Suggests relevant agent              │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         User Invokes Agent              │
│  /skill cf-ops-monitor                  │
│  /skill cf-code-reviewer                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│     Agent Performs Autonomous Work      │
│  - cf-ops-monitor: Deploy + monitor     │
│  - cf-code-reviewer: Validate patterns  │
└─────────────────────────────────────────┘
```

### When Hooks Trigger Agents

**Deployment Scenario:**
1. User asks: "Deploy the latest changes"
2. Claude Code runs: `npx wrangler deploy`
3. `post-tool-use.sh` detects `wrangler deploy`
4. Suggests: `cf-ops-monitor`
5. User invokes: `/skill cf-ops-monitor`
6. Agent monitors health, auto-rollbacks if needed

**Code Review Scenario:**
1. Claude Code edits: `src/handlers/search.js`
2. `post-tool-use.sh` detects handler modification
3. Suggests: `cf-code-reviewer`
4. User invokes: `/skill cf-code-reviewer`
5. Agent validates Workers patterns, security, performance

---

## Customization

### Adding Custom Checks to pre-commit.sh

**Block additional file patterns:**
```bash
# Add to SENSITIVE_FILES array (line 22)
SENSITIVE_FILES=(
  ".dev.vars"
  ".env"
  "*.pem"          # New: Block SSL certificates
  "*.key"          # New: Block private keys
)
```

**Add custom linting:**
```bash
# Add after line 98
echo "🔍 Running custom lint rules..."
if command -v eslint &> /dev/null; then
  npx eslint $STAGED_JS
fi
```

**Require specific comment patterns:**
```bash
# Add after line 117
echo "📝 Checking for TODO cleanup..."
if git diff --cached | grep -i "TODO:" > /dev/null; then
  echo -e "${YELLOW}⚠ Warning: TODO comments found${NC}"
  echo "  Consider resolving before commit"
fi
```

### Adding Custom Triggers to post-tool-use.sh

**Trigger on test file changes:**
```bash
# Add after line 30
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "test/"; then
  INVOKE_AGENT="test-runner"
  AGENT_CONTEXT="Test files modified. Consider running test suite..."
```

**Trigger on package.json updates:**
```bash
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -q "package.json"; then
  INVOKE_AGENT="cf-ops-monitor"
  AGENT_CONTEXT="Dependencies updated. Rebuild and redeploy required..."
```

**Trigger on secrets changes:**
```bash
elif [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_PATH" | grep -q "wrangler secret"; then
  INVOKE_AGENT="cf-ops-monitor"
  AGENT_CONTEXT="Secrets modified. Verify production config..."
```

---

## Testing Hooks

### Test pre-commit Hook
```bash
# Make a test change
echo "console.log('test')" >> src/test.js
git add src/test.js

# Run hook manually
.claude/hooks/pre-commit.sh

# Cleanup
git reset HEAD src/test.js
rm src/test.js
```

### Test post-tool-use Hook
```bash
# Simulate Claude Code tool execution
export CLAUDE_TOOL_NAME="Bash"
export CLAUDE_TOOL_PATH="npx wrangler deploy"

# Run hook
.claude/hooks/post-tool-use.sh

# Expected: Suggests cf-ops-monitor agent
```

### Verify Hook Installation
```bash
# Check git hooks
ls -la .git/hooks/pre-commit

# Should point to: ../../.claude/hooks/pre-commit.sh

# Check hook is executable
ls -la .claude/hooks/*.sh

# All should have -rwxr-xr-x permissions
```

---

## Troubleshooting

### pre-commit Hook Not Running
**Symptoms:** Commits succeed without checks

**Solutions:**
1. Check symlink exists: `ls -la .git/hooks/pre-commit`
2. Re-create symlink: `ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit`
3. Make executable: `chmod +x .claude/hooks/pre-commit.sh`

### post-tool-use Hook Not Suggesting Agents
**Symptoms:** No agent suggestions after tool use

**Solutions:**
1. Verify hook is executable: `chmod +x .claude/hooks/post-tool-use.sh`
2. Check Claude Code version (feature requires recent version)
3. Test manually with environment variables set

### Hook Blocking Valid Commits
**Symptoms:** False positives on security checks

**Solutions:**
1. Review pattern matches in `.claude/hooks/pre-commit.sh`
2. Adjust regex patterns to be more specific
3. Emergency bypass: `git commit --no-verify`

### Hook Performance Issues
**Symptoms:** Slow commit times

**Solutions:**
1. Disable Prettier check if not needed
2. Skip test file check for large codebases
3. Comment out non-critical checks

---

## Best Practices

### When to Bypass Hooks
- ✅ **Emergency production fix** (rollback immediately after)
- ✅ **Work-in-progress branch** (fix before merging to main)
- ❌ **Production branch commits** (never bypass on main)
- ❌ **Avoiding code review** (hooks are for quality assurance)

### Keeping Hooks Updated
- Review hook logic quarterly
- Add new patterns as project evolves
- Remove obsolete checks
- Test after major Claude Code updates

### Hook Maintenance
- Keep hook scripts under 200 lines
- Document custom checks with comments
- Version control all hook changes
- Test hooks in CI/CD pipeline

---

## Integration with CI/CD

### GitHub Actions Validation
```yaml
# .github/workflows/validate.yml
- name: Run pre-commit checks
  run: |
    .claude/hooks/pre-commit.sh
```

### Pre-Push Hook (Optional)
```bash
# .git/hooks/pre-push
#!/bin/bash

echo "Running pre-push validation..."

# Run tests
npm test

# Validate wrangler config
npx wrangler publish --dry-run

# Check for main branch commits
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ]; then
  echo "✓ Deploying to main branch"
  # Could trigger cf-ops-monitor here
fi
```

---

## Hook Evolution

### Future Enhancements
- [ ] Add performance regression detection
- [ ] Integrate with Zen MCP for deep analysis
- [ ] Auto-fix formatting violations
- [ ] Parallel hook execution for speed
- [ ] Hook telemetry (track trigger frequency)

### Contributing Hook Improvements
1. Test new hook logic thoroughly
2. Document trigger conditions
3. Add examples to this README
4. Submit PR with hook changes
5. Update `.claude/CLAUDE.md` if major changes

---

**Last Updated:** November 13, 2025
**Maintained By:** AI Team (Claude Code, cf-ops-monitor, cf-code-reviewer)
**Location:** `.claude/hooks/`
