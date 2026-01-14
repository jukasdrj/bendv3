# PM Workflow Quick Reference

**Solo-Dev Edition** | **Family App Context** | **Cost-Aware**

---

## 🚀 Quick Start

### Automatic Detection
Just describe your task. If complexity ≥4, you'll see:
```
💡 MULTI-STEP TASK DETECTED
   Recommended: /pm-workflow "<your task>"
```

### Manual Start
```bash
/pm-workflow "Add webhook support for Alexandria callbacks"
```

---

## ⚡ When to Use

### ✅ USE /pm-workflow for:
- Multi-file features (3+ files)
- Complex integrations (Alexandria, Gemini, Workers AI)
- Refactoring with risk
- Tasks >30min (context loss likely)
- Database migrations

### ❌ SKIP for:
- Single-file bug fixes → just fix it
- Documentation → just write it
- Linting → `npm run lint:fix`
- Quick experiments → don't plan experiments

---

## 🔒 PAL MCP Review Policy

### ✅ REVIEW for (Real Risks):
| Code Type | Model | Cost |
|-----------|-------|------|
| Auth/authorization | grok-code-fast-1 | PAID |
| Quota/rate limits | gemini-3-flash | FREE |
| Database writes | gemini-3-flash | FREE |
| New API endpoints | gemini-3-flash | FREE |
| Alexandria integration | gemini-3-flash | FREE |

### ❌ SKIP for:
- Internal refactoring
- Tests
- Documentation
- Logging/analytics

---

## 📋 Workflow Steps

```
1. Initialization → Creates planning files (task_plan.md, findings.md, progress.md)
2. Decomposition → Break into 2-4 phases, identify risks
3. Execution → Delegate to Haiku or implement yourself
4. Review → Optional PAL MCP (risk-based)
5. Integration → Sanity check, update planning files
6. Delivery → Communicate clearly
```

---

## 🤖 PAL MCP Commands

### Lightweight Review (FREE)
```javascript
mcp__pal__codereview({
  model: "gemini-3-flash-preview",
  step: "Quick review for auth bugs, quota leaks, data integrity issues",
  relevant_files: ["<changed files>"],
  review_type: "quick",
  review_validation_type: "internal",
  step_number: 1,
  total_steps: 1,
  next_step_required: false
})
```

### Deep Review (PAID - Critical Code Only)
```javascript
mcp__pal__codereview({
  model: "grok-code-fast-1",
  step: "Deep security review for HMAC verification",
  relevant_files: ["<all files>"],
  review_type: "security",
  review_validation_type: "external",
  step_number: 1,
  total_steps: 2,
  next_step_required: true
})
```

---

## 💰 Cost Strategy

**FREE (90% of reviews):**
- `gemini-3-flash-preview` - Most reviews
- `gemini-2.5-flash` - General code review
- `gemini-2.5-flash-lite` - Ultra-fast checks

**PAID (10% of reviews):**
- `grok-code-fast-1` - Auth/security only
- `gemini-3-pro-preview` - Rarely needed

**Estimated Cost:** ~$5-10/month

---

## 🎯 Review Triage

| Priority | Fix When | Examples |
|----------|----------|----------|
| **P0** | Before merge | Auth bypass, data loss, quota leaks |
| **P1** | This week | Error exposure, cache bugs, slow queries |
| **P2** | When convenient | Code smells, missing tests |
| **P3** | Document + ignore | Style issues, theoretical vulns |

---

## 🔧 Customization

### Adjust Complexity Threshold
Edit `.claude/hooks/user-prompt-submit.sh` line 39:
```bash
# Current: triggers at 4
if [ $COMPLEXITY_SCORE -ge 4 ]; then

# Too aggressive? Raise to 5:
if [ $COMPLEXITY_SCORE -ge 5 ]; then

# Too passive? Lower to 3:
if [ $COMPLEXITY_SCORE -ge 3 ]; then
```

### Disable Auto-Detection
Comment out in `.claude/settings.json`:
```json
// "UserPromptSubmit": [ ... ]
```

---

## 📊 Success Metrics

### ✅ Working:
- Ship features faster
- Context not lost mid-task
- Real bugs caught
- Workflow feels lightweight

### ❌ Warning:
- Simple tasks take longer
- Reviews flag theoretical issues
- You skip workflow often
- Cost is high

---

## 🔗 Related Skills

| Skill | Purpose |
|-------|---------|
| `/pm-workflow` | **Full PM workflow** (use this!) |
| `/planning-with-files` | Planning only |
| `/work-review` | Discover backlog |
| `/commit-push-pr` | Ship code |
| `/deploy` | Production deploy |

---

## 📚 Full Docs

- **Setup Guide:** `.claude/PM_WORKFLOW_SETUP.md`
- **System Prompt:** `.claude/system-prompt.md`
- **Skill:** `.claude/skills/pm-workflow.md`
- **Hooks:** `.claude/hooks/user-prompt-submit.sh`, `post-tool-use.sh`

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Planning too heavy | Raise threshold to 5 |
| Reviews too noisy | Use `severity_filter: "medium"` |
| Haiku wrong code | Clearer specs + reference files |
| Cost too high | Use gemini-3-flash (FREE) more |
| Hook not working | `chmod +x .claude/hooks/*.sh` |

---

## Example: Full Workflow

```
You: "Add GET /v3/books/:isbn/similar endpoint using embeddings"

1. AUTO-DETECT: Complexity 5 → suggests /pm-workflow

2. YOU: /pm-workflow "Add semantic similarity search"
   → Creates task_plan.md, findings.md, progress.md

3. DECOMPOSE:
   Phase 1: Research Vectorize patterns (you)
   Phase 2: Handler + service (Haiku)
   Phase 3: Review (gemini-3-flash, FREE)
   Phase 4: Tests (Haiku)

4. EXECUTE:
   - Research: 5 min
   - Delegate: mcp__pal__chat model=haiku (implementation)
   - Review: mcp__pal__codereview model=gemini-3-flash-preview
   - Tests: Haiku writes tests

5. INTEGRATE:
   - npm run test:safe
   - Update task_plan.md → all phases "complete"
   - Ship!
```

---

**Philosophy:** Planning saves time, reviews prevent bugs, perfection is the enemy of shipping.

**Context:** Family app, solo dev, pragmatic quality, cost-aware.

**Last Updated:** January 14, 2026
