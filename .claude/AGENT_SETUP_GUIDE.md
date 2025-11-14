# Claude Code Agent Setup Guide

**Universal guide for setting up autonomous agents with Claude Code**

Use this guide to replicate the optimal agent architecture across all your projects.

---

## Quick Start

1. **Copy the `.claude/` directory structure** from this repo
2. **Customize for your project** (adjust agent descriptions, hooks, baselines)
3. **Test with** `/skill project-manager`

---

## Directory Structure

```
your-project/
├── .claude/
│   ├── CLAUDE.md                     # Project-specific instructions
│   ├── settings.json                 # Hook configurations (required)
│   ├── settings.local.json           # Personal settings (gitignored)
│   │
│   ├── skills/                       # Autonomous agents
│   │   ├── project-manager/
│   │   │   └── SKILL.md             # Orchestration agent
│   │   ├── cloudflare-agent/        # (Optional: platform-specific)
│   │   │   └── SKILL.md
│   │   └── zen-mcp-master/
│   │       └── SKILL.md             # Deep analysis agent
│   │
│   └── hooks/                        # Automation triggers
│       ├── README.md
│       ├── post-tool-use.sh         # Auto-suggest agents
│       └── pre-commit.sh            # Git pre-commit checks
│
└── .git/hooks/
    └── pre-commit → ../../.claude/hooks/pre-commit.sh
```

---

## Core Files to Copy

### 1. `.claude/settings.json` ✅ REQUIRED

This file tells Claude Code when to run your hooks.

```json
{
  "hooks": {
    "PostToolUse": {
      "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-use.sh",
      "description": "Automatically suggest relevant agents based on tool usage patterns",
      "matchers": [
        {
          "tool": "Bash",
          "commandContains": "deploy"
        },
        {
          "tool": "Write",
          "filePattern": "src/**/*.js"
        },
        {
          "tool": "Edit",
          "filePattern": "src/**/*.js"
        },
        {
          "tool": "MultiEdit"
        }
      ],
      "env": {
        "CLAUDE_TOOL_NAME": "$TOOL_NAME",
        "CLAUDE_TOOL_PATH": "$FILE_PATH",
        "CLAUDE_TOOL_COMMAND": "$COMMAND"
      }
    }
  }
}
```

**Customize `matchers` for your project:**
- `commandContains`: Keywords in bash commands (e.g., `"deploy"`, `"test"`, `"build"`)
- `filePattern`: File paths to watch (e.g., `"src/**/*.py"`, `"lib/**/*.ts"`)

---

### 2. `.claude/settings.local.json` (Optional)

Personal settings, **not committed to git**.

```json
{
  "outputStyle": "Explanatory"
}
```

Add to `.gitignore`:
```
.claude/settings.local.json
```

---

### 3. `.claude/hooks/post-tool-use.sh` ✅ REQUIRED

Analyzes tool usage and suggests agents.

```bash
#!/bin/bash
set -e

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_PATH="${CLAUDE_TOOL_PATH:-}"
TOOL_COMMAND="${CLAUDE_TOOL_COMMAND:-}"

[ -z "$TOOL_NAME" ] && exit 0

INVOKE_AGENT=""
AGENT_CONTEXT=""

# Deployment detection (adjust for your platform)
if [[ "$TOOL_NAME" == "Bash" ]] && echo "$TOOL_COMMAND" | grep -qE "deploy|publish"; then
  INVOKE_AGENT="deployment-agent"
  AGENT_CONTEXT="Deployment detected. Monitoring health..."

# Code changes detection
elif [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]] && echo "$TOOL_PATH" | grep -qE "src/|lib/"; then
  INVOKE_AGENT="zen-mcp-master"
  AGENT_CONTEXT="Code changes detected. Consider code review (codereview tool)..."

# Multiple file changes
elif [[ "$TOOL_NAME" == "MultiEdit" ]]; then
  INVOKE_AGENT="project-manager"
  AGENT_CONTEXT="Multiple files changed. Consider comprehensive review..."
fi

if [ -n "$INVOKE_AGENT" ]; then
  echo ""
  echo "🤖 Agent Suggestion: $AGENT_CONTEXT"
  echo "   Recommended Skills: $INVOKE_AGENT"
  echo ""
  echo "   To invoke manually, use:"
  for agent in $(echo "$INVOKE_AGENT" | tr ',' ' '); do
    echo "   /skill $agent"
  done
  echo ""
fi

exit 0
```

**Make executable:**
```bash
chmod +x .claude/hooks/post-tool-use.sh
```

---

### 4. `.claude/hooks/pre-commit.sh` (Optional)

Git pre-commit quality checks.

```bash
#!/bin/bash
set -e

echo "🔍 Running pre-commit checks..."

# Block sensitive files
SENSITIVE_FILES=(".env" ".dev.vars" "credentials.json" "*.pem" "*.key")
for pattern in "${SENSITIVE_FILES[@]}"; do
  if git diff --cached --name-only | grep -q "$pattern"; then
    echo "❌ Blocked: $pattern files cannot be committed"
    exit 1
  fi
done

# Validate syntax (adjust for your language)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.js$' || true)
if [ -n "$STAGED_FILES" ]; then
  for file in $STAGED_FILES; do
    node --check "$file" || exit 1
  done
fi

echo "✅ Pre-commit checks passed"
exit 0
```

**Install as git hook:**
```bash
chmod +x .claude/hooks/pre-commit.sh
ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit
```

---

## Agent Architecture

### Three-Tier Design

```
User Request
     ↓
project-manager (orchestrator)
     ↓
     ├─→ deployment-agent (platform-specific)
     └─→ zen-mcp-master (analysis: 14 Zen MCP tools)
```

---

### Agent 1: project-manager ✅ REQUIRED

**Purpose:** Top-level orchestration and delegation

**Location:** `.claude/skills/project-manager/SKILL.md`

**Minimal Template:**
```markdown
# Project Manager

**Purpose:** Orchestrates complex workflows by delegating to specialized agents.

**When to use:** Multi-phase tasks, strategic planning, or when unsure which agent to invoke.

## Core Responsibilities

1. **Analyze** user requests to identify required specialists
2. **Delegate** to appropriate agents (deployment-agent, zen-mcp-master)
3. **Coordinate** multi-agent workflows
4. **Maintain** context across handoffs

## Delegation Patterns

### Simple Deployment
```
User: "Deploy to production"
→ Delegate to deployment-agent
```

### Code Review + Deploy
```
User: "Review code and deploy"
→ Phase 1: zen-mcp-master (codereview)
→ Phase 2: deployment-agent (deploy + monitor)
```

## Available Agents

- **deployment-agent**: Platform-specific deployment and monitoring
- **zen-mcp-master**: Deep technical analysis (14 Zen MCP tools)

---

**Invoke:** `/skill project-manager`
```

**Customization:**
- Add project-specific delegation patterns
- Document common workflows
- Define escalation criteria

---

### Agent 2: deployment-agent (Platform-Specific)

**Purpose:** Platform-specific deployment and monitoring

**Examples:**
- `cloudflare-agent` for Cloudflare Workers
- `vercel-agent` for Vercel
- `aws-agent` for AWS Lambda
- `k8s-agent` for Kubernetes

**Location:** `.claude/skills/deployment-agent/SKILL.md`

**Minimal Template:**
```markdown
# Deployment Agent

**Purpose:** Deploy and monitor [YOUR PLATFORM] applications.

**When to use:** Deploying to production, investigating logs, monitoring performance.

## Core Capabilities

- Execute deployment commands (e.g., `npx wrangler deploy`)
- Health check validation
- Log streaming and analysis
- Auto-rollback on errors
- Performance monitoring

## Performance Baselines

### Request Latency
- P50: < 200ms (target)
- P95: < 1000ms (target)
- P99: < 2000ms (warning)

### Error Rate
- Good: < 1%
- Warning: 1-5%
- **Auto-rollback**: > 5%

### Monitoring Duration
- Standard: 5 minutes post-deploy
- Critical: 10 minutes post-deploy

## Auto-Rollback Triggers

1. Error rate > 5% for 60 seconds
2. Health endpoint down for 30 seconds

---

**Invoke:** `/skill deployment-agent`
```

**Customization:**
- Replace `[YOUR PLATFORM]` with actual platform (AWS, Vercel, etc.)
- Adjust performance baselines for your SLA
- Add platform-specific monitoring commands

---

### Agent 3: zen-mcp-master ✅ RECOMMENDED

**Purpose:** Deep technical analysis using Zen MCP tools

**Location:** `.claude/skills/zen-mcp-master/SKILL.md`

**Copy from BooksTrack repo:** This agent is universal and works for all projects.

```bash
cp bookstrack-backend/.claude/skills/zen-mcp-master/SKILL.md your-project/.claude/skills/zen-mcp-master/
```

**Available Tools:**
- `debug` - Complex bug investigation
- `codereview` - Code quality and architecture review
- `secaudit` - Security vulnerability assessment
- `thinkdeep` - Multi-stage reasoning
- `planner` - Task planning
- `analyze` - Codebase analysis
- `refactor` - Refactoring opportunities
- `testgen` - Test generation
- `tracer` - Execution flow tracing
- `precommit` - Pre-commit validation
- `docgen` - Documentation generation
- `consensus` - Multi-model decision making

**No customization needed** - works universally for all projects.

---

## Customization Checklist

### For Your Project

- [ ] Copy `.claude/` directory structure
- [ ] Edit `.claude/CLAUDE.md` with project-specific instructions
- [ ] Update `settings.json` matchers for your file types
- [ ] Customize `post-tool-use.sh` for your deployment commands
- [ ] Rename `deployment-agent` to match your platform
- [ ] Adjust performance baselines in deployment agent
- [ ] Update `pre-commit.sh` for your language/linter
- [ ] Install git hook: `ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit`
- [ ] Test with `/skill project-manager`

---

## Platform-Specific Examples

### Cloudflare Workers (BooksTrack)

```bash
# post-tool-use.sh
if [[ "$TOOL_COMMAND" =~ "npx wrangler deploy" ]]; then
  INVOKE_AGENT="cloudflare-agent"
fi
```

### AWS Lambda

```bash
# post-tool-use.sh
if [[ "$TOOL_COMMAND" =~ "aws lambda update-function" ]]; then
  INVOKE_AGENT="aws-agent"
fi
```

### Vercel

```bash
# post-tool-use.sh
if [[ "$TOOL_COMMAND" =~ "vercel --prod" ]]; then
  INVOKE_AGENT="vercel-agent"
fi
```

### Kubernetes

```bash
# post-tool-use.sh
if [[ "$TOOL_COMMAND" =~ "kubectl apply" ]]; then
  INVOKE_AGENT="k8s-agent"
fi
```

### Python Projects

```json
// settings.json
{
  "hooks": {
    "PostToolUse": {
      "matchers": [
        {
          "tool": "Write",
          "filePattern": "**/*.py"
        },
        {
          "tool": "Bash",
          "commandContains": "pytest"
        }
      ]
    }
  }
}
```

### TypeScript Projects

```json
// settings.json
{
  "hooks": {
    "PostToolUse": {
      "matchers": [
        {
          "tool": "Write",
          "filePattern": "src/**/*.ts"
        },
        {
          "tool": "Bash",
          "commandContains": "npm run build"
        }
      ]
    }
  }
}
```

---

## Testing Your Setup

### 1. Test Hook Activation

```bash
# Make a code change
echo "console.log('test')" >> src/test.js

# Should see agent suggestion after Claude Code edits files
```

### 2. Test Agent Invocation

```bash
# In Claude Code chat:
/skill project-manager

# Should see agent load and respond
```

### 3. Test Git Hook

```bash
# Try committing a sensitive file (should block)
echo "API_KEY=secret" > .env
git add .env
git commit -m "test"
# Expected: Blocked by pre-commit hook
```

---

## Troubleshooting

### Hooks Not Running

**Problem:** No agent suggestions after tool use

**Solution:**
```bash
# Verify settings.json exists
cat .claude/settings.json

# Make hook executable
chmod +x .claude/hooks/post-tool-use.sh

# Test manually
export CLAUDE_TOOL_NAME="Bash"
export CLAUDE_TOOL_COMMAND="npx wrangler deploy"
.claude/hooks/post-tool-use.sh
```

### Agents Not Loading

**Problem:** `/skill agent-name` doesn't work

**Solution:**
```bash
# Verify SKILL.md exists (uppercase)
ls -la .claude/skills/*/SKILL.md

# Rename if lowercase
mv .claude/skills/agent-name/skill.md .claude/skills/agent-name/SKILL.md
```

### Git Hook Not Blocking

**Problem:** Sensitive files can be committed

**Solution:**
```bash
# Verify symlink exists
ls -la .git/hooks/pre-commit

# Recreate if missing
ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit
chmod +x .claude/hooks/pre-commit.sh
```

---

## Advanced: Zen MCP Configuration

### Model Selection Strategy

**For Critical Work:**
- Security audits: `gemini-2.5-pro` or `grok-4-heavy`
- Complex debugging: `gemini-2.5-pro`
- Architecture decisions: `gemini-2.5-pro`

**For Fast Work:**
- Quick code review: `flash-preview`
- Simple analysis: `flash-preview`
- Documentation: `flash-preview`

**For Coding Tasks:**
- Test generation: `grokcode`
- Refactoring: `grokcode`

### Using continuation_id

**Multi-turn workflows:**
```
1. debug (finds root cause) → continuation_id: abc123
2. codereview (validates fix, reuse: abc123)
3. precommit (checks changes, reuse: abc123)
```

**Benefits:**
- Preserves full conversation context
- Shares findings across tools
- Avoids re-analyzing code

---

## Best Practices

### 1. Start Simple

Begin with:
- `project-manager` (orchestration)
- `zen-mcp-master` (analysis)
- Skip deployment agent if not needed yet

### 2. Add Platform Agent When Ready

Once your project has deployment pipelines, add:
- `cloudflare-agent`, `aws-agent`, `vercel-agent`, etc.
- Customize performance baselines
- Configure auto-rollback triggers

### 3. Iterate on Hooks

Start with basic triggers:
```bash
# Simple: Any code change
if [[ "$TOOL_NAME" =~ ^(Write|Edit)$ ]]; then
  INVOKE_AGENT="zen-mcp-master"
fi
```

Then add specificity:
```bash
# Advanced: Specific file patterns
if echo "$TOOL_PATH" | grep -q "src/handlers/"; then
  INVOKE_AGENT="zen-mcp-master"
  AGENT_CONTEXT="Handler modified. Consider API review..."
fi
```

### 4. Document Your Patterns

In `.claude/CLAUDE.md`, document:
- Common workflows (deploy, review, debug)
- Project-specific conventions
- Agent delegation patterns
- Performance baselines

---

## Migration Guide

### From Manual to Automated

**Before (manual):**
```
User: "Can you review this code?"
Claude: Reviews code manually
```

**After (automated):**
```
User: Edits code
Hook: "🤖 Agent Suggestion: zen-mcp-master"
User: "/skill zen-mcp-master"
Agent: Comprehensive codereview with 14 Zen tools
```

### From Old Agent Names

If you have legacy agents (`cf-ops-monitor`, `cf-code-reviewer`):

```bash
# Rename directory
mv .claude/skills/cf-ops-monitor .claude/skills/cloudflare-agent

# Update SKILL.md
sed -i '' 's/cf-ops-monitor/cloudflare-agent/g' .claude/skills/cloudflare-agent/SKILL.md

# Update hooks
sed -i '' 's/cf-ops-monitor/cloudflare-agent/g' .claude/hooks/post-tool-use.sh
```

---

## File Checklist

Copy these files from BooksTrack to your project:

```
✅ .claude/settings.json                 (customize matchers)
✅ .claude/skills/project-manager/       (customize workflows)
✅ .claude/skills/zen-mcp-master/        (copy as-is)
⚠️  .claude/skills/deployment-agent/     (rename & customize)
✅ .claude/hooks/post-tool-use.sh        (customize triggers)
⚠️  .claude/hooks/pre-commit.sh          (customize checks)
✅ .claude/hooks/README.md               (reference)
```

Legend:
- ✅ = Copy and customize
- ⚠️ = Optional, project-specific

---

## Summary

### Minimum Setup (15 minutes)

1. Create `.claude/settings.json` with PostToolUse hook
2. Copy `project-manager/` and `zen-mcp-master/` skills
3. Create `post-tool-use.sh` hook with basic triggers
4. Test with `/skill project-manager`

### Full Setup (30 minutes)

1. Everything above, plus:
2. Create platform-specific deployment agent
3. Add `pre-commit.sh` git hook
4. Customize performance baselines
5. Document in `.claude/CLAUDE.md`

### Result

- **Autonomous agents** suggest themselves after tool use
- **project-manager** coordinates complex workflows
- **zen-mcp-master** provides 14 specialized analysis tools
- **deployment-agent** handles platform-specific operations
- **Git hooks** prevent sensitive file commits

---

**Last Updated:** November 14, 2025
**Source Project:** BooksTrack Backend
**License:** Use freely in your projects
**Maintained By:** AI Team (project-manager, cloudflare-agent, zen-mcp-master, Claude Code)
