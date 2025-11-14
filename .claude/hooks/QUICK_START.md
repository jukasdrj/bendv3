# Auto-Invoke Quick Start

Get started with auto-invoke agents in 30 seconds.

---

## ⚡ Quick Setup

**1. Enable Auto-Invoke (Add to your `~/.zshrc` or `~/.bashrc`):**
```bash
export AUTO_INVOKE_AGENTS=true
export AUTO_INVOKE_CRITICAL=true
export MIN_LINES_FOR_REVIEW=10
```

**2. Reload Shell:**
```bash
source ~/.zshrc  # or source ~/.bashrc
```

**3. Test It:**
```bash
# Make a small code change
echo "// test" >> src/handlers/search.js

# Ask Claude Code to save it
# → Hook detects the change
# → Agents auto-invoke!
```

---

## 🎛️ Control Modes

### Full Automation (Recommended)
```bash
export AUTO_INVOKE_AGENTS=true
```
✅ Deploy monitoring automatic
✅ Code reviews automatic
✅ Config validation automatic

### Critical Only
```bash
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=true
```
✅ Deploy monitoring automatic
❌ Code reviews manual
✅ Config validation automatic

### Manual (Suggestions Only)
```bash
export AUTO_INVOKE_AGENTS=false
export AUTO_INVOKE_CRITICAL=false
```
❌ All agents require manual `/skill` command
✅ Hook still suggests when to invoke

---

## 🚀 What Happens

### When You Deploy:
```
You: "Deploy to production"
Claude Code: npx wrangler deploy
Hook: 🤖 AUTO-INVOKING cf-ops-monitor
Agent: ✅ Deployment successful, monitoring health...
```

### When You Edit Code:
```
You: "Fix the search handler"
Claude Code: Edits src/handlers/search.js (25 lines)
Hook: 🤖 AUTO-INVOKING cf-code-reviewer
Agent: ✅ Code looks good! No issues found.
```

### When You Edit Config:
```
You: "Update the KV namespace"
Claude Code: Edits wrangler.toml
Hook: 🤖 AUTO-INVOKING cf-ops-monitor + cf-code-reviewer
Both Agents: ✅ Config validated, deployment ready.
```

---

## 🛠️ Customization

### Adjust Review Threshold
```bash
# More sensitive (review smaller changes)
export MIN_LINES_FOR_REVIEW=5

# Less sensitive (only major changes)
export MIN_LINES_FOR_REVIEW=20
```

### Temporarily Disable
```bash
# Disable for this session
export AUTO_INVOKE_AGENTS=false

# Make quick fixes...

# Re-enable
export AUTO_INVOKE_AGENTS=true
```

---

## 📚 Learn More

- **Full Guide**: [AUTO_INVOKE_GUIDE.md](./AUTO_INVOKE_GUIDE.md)
- **Hook Details**: [README.md](./README.md)
- **Agent Skills**: [../skills/README.md](../skills/README.md)

---

**Last Updated**: November 14, 2025
