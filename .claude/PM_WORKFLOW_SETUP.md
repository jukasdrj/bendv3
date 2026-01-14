# PM Workflow Setup - Solo-Dev Edition

**Created:** January 14, 2026
**Context:** BooksTrack Backend (Family App, Solo Developer)
**Philosophy:** Planning saves time, reviews prevent real bugs, perfection is the enemy of shipping

---

## What Was Configured

This setup maximizes usage of planning-with-files and PAL MCP review workflows, tailored for a **solo-dev family app** (not enterprise). It's pragmatic, cost-aware, and respects your limited time.

---

## Files Created/Modified

### 1. **`.claude/hooks/user-prompt-submit.sh`** (NEW)
**Purpose:** Automatically detect multi-step tasks and suggest planning workflow

**Triggers when:**
- Complexity score ≥4 points (multi-file features, integrations, refactoring)
- Suggests `/pm-workflow` or `/planning-with-files`

**Benefits:**
- Don't lose context mid-task (planning files persist)
- Track what worked/failed (save future-you time)
- Parallel subagent work (Haiku codes while you plan)

**Calibration:**
- Threshold set to 4 (catches multi-file features, skips quick fixes)
- Adjust in lines 20-35 if too aggressive/passive

---

### 2. **`.claude/system-prompt.md`** (NEW)
**Purpose:** Define your role as pragmatic PM + technical partner

**Key Principles:**
- **Save time** (force multiplier, not process enforcer)
- **Prevent context loss** (document decisions)
- **Catch real risks** (auth bugs, quota leaks, data loss)
- **Skip theatre** (no enterprise security audits for family apps)

**Quality Gates:**
- ✅ Use PAL MCP for: auth, quota logic, database writes, new API endpoints
- ❌ Skip PAL MCP for: refactoring, tests, docs, logging, UI changes

**Security Posture:**
- Focus: Authentication, data privacy, quota abuse, input validation, rate limiting
- Ignore: DDoS, compliance (GDPR/HIPAA), pentesting, advanced threats

**Cost Strategy:**
- FREE models (gemini-3-flash-preview) for most reviews
- PAID models (grok-code-fast-1) only for critical auth/security logic

---

### 3. **`.claude/skills/pm-workflow.md`** (NEW)
**Purpose:** Complete PM workflow - planning → decomposition → delegation → optional review → delivery

**Workflow Phases:**
1. **Initialization** - Creates `task_plan.md`, `findings.md`, `progress.md`
2. **Decomposition** - Break into 2-4 phases, identify risks
3. **Execution** - Delegate to Haiku (implementation) or you (architecture)
4. **Review** - Optional PAL MCP review (risk-based, not mandatory)
5. **Integration** - Sanity check, update planning files
6. **Delivery** - Communicate clearly, document deferred work

**When to Use:**
- ✅ Multi-file features (3+ files)
- ✅ Complex integrations (Alexandria, Gemini, Workers AI)
- ✅ Refactoring with breakage risk
- ✅ Tasks >30min (context loss likely)
- ✅ Database migrations

**When to Skip:**
- ❌ Single-file bug fixes
- ❌ Documentation updates
- ❌ Linting/formatting
- ❌ Quick experiments

**PAL MCP Review Policy:**
- **Use for:** Auth, quota logic, DB writes, new API endpoints, Alexandria integration
- **Skip for:** Refactoring, tests, docs, logging, UI changes
- **Lightweight review:** `gemini-3-flash-preview` (FREE, quick)
- **Deep review:** `grok-code-fast-1` (PAID, critical code only)

---

### 4. **`.claude/hooks/post-tool-use.sh`** (MODIFIED)
**Purpose:** Suggest PAL MCP review for security-sensitive and data layer changes

**New Triggers:**
- **Security-sensitive code** (`src/middleware/`, `src/api-v3/webhooks/`)
  - Suggests review for: auth, HMAC verification, input validation, rate limiting
  - Quick review (FREE): `gemini-3-flash-preview`
  - Deep review (PAID): `grok-code-fast-1`

- **Data layer changes** (`src/repositories/`)
  - Suggests review for: data integrity, query performance, error handling
  - Quick review (FREE): `gemini-3-flash-preview`

**Not Auto-Invoked:** Suggestions only, you decide if review is needed

---

### 5. **`.claude/settings.json`** (MODIFIED)
**Purpose:** Enable new hooks and permissions

**Changes:**
- Added `UserPromptSubmit` hook (complexity detection)
- Added `Skill(pm-workflow)` permission

---

## How to Use

### Starting a New Multi-Step Task

**Option 1: Automatic Detection**
Just describe your task normally. If complexity ≥4, you'll see:
```
💡 MULTI-STEP TASK DETECTED (complexity: 5)

   Recommended: /pm-workflow or /planning-with-files

   Benefits for YOU (solo-dev):
   ✓ Don't lose context mid-task (planning files persist)
   ✓ Track what worked/failed (save future-you time)
   ✓ Parallel subagent work (Haiku codes while you plan)
   ✓ Optional PAL review (use for risky changes only)

   ⚡ Quick start: /pm-workflow "<your task>"
```

**Option 2: Manual Invocation**
```bash
/pm-workflow "Add webhook support for Alexandria book processing callbacks"
```

This automatically:
1. Creates planning files (`task_plan.md`, `findings.md`, `progress.md`)
2. Gathers context from codebase
3. Guides you through decomposition
4. Suggests delegation to Haiku
5. Suggests PAL MCP review (if risky)
6. Updates planning files as you go

---

### Example Workflows

#### Example 1: New API Endpoint (Full Workflow)
```
You: "Add GET /v3/books/:isbn/similar endpoint using embeddings"

1. /pm-workflow "Add semantic similarity search endpoint"
   → Creates planning files, gathers context

2. Decomposition (you do this):
   - Phase 1: Research Vectorize usage patterns
   - Phase 2: Handler + service layer (delegate to Haiku)
   - Phase 3: PAL review (lightweight, FREE)
   - Phase 4: Tests + docs (delegate to Haiku)

3. Execution:
   - Research patterns yourself (5 min)
   - Delegate implementation to Haiku (mcp__pal__chat)
   - Quick review with gemini-3-flash-preview (FREE)
   - Haiku writes tests

4. Integration:
   - npm run test:safe (60s)
   - Update task_plan.md phases to "complete"
   - Ship it!
```

#### Example 2: Bug Fix (Skip Workflow)
```
You: "Fix typo in error message"

→ Just fix it directly (30 seconds)
→ No planning needed (overkill)
```

#### Example 3: Security-Sensitive Change (Deep Review)
```
You: "Add HMAC verification to Alexandria webhook"

1. /pm-workflow "Add webhook HMAC verification"
   → Creates planning files

2. Decomposition:
   - Phase 1: Research HMAC patterns (you)
   - Phase 2: Implementation (YOU - too risky to delegate)
   - Phase 3: Deep security review (grok-code-fast-1, PAID)
   - Phase 4: Tests (Haiku)

3. Execution:
   - You implement HMAC logic (critical code)
   - Deep review: mcp__pal__codereview model=grok-code-fast-1 review_type=security
   - Address P0/P1 findings immediately
   - Haiku writes tests

4. Integration + Extra Testing:
   - npm run test:safe
   - Manual testing with wrangler tail
   - Monitor in production
```

---

## PAL MCP Review Cheatsheet

### When to Review (Risk-Based)

| Code Type | Review? | Model | Cost |
|-----------|---------|-------|------|
| Auth/authorization | ✅ YES | grok-code-fast-1 | PAID |
| Quota/rate limits | ✅ YES | gemini-3-flash | FREE |
| Database writes | ✅ YES | gemini-3-flash | FREE |
| New API endpoints | ✅ YES | gemini-3-flash | FREE |
| Alexandria integration | ✅ YES | gemini-3-flash | FREE |
| Internal refactoring | ❌ NO | - | - |
| Tests | ❌ NO | - | - |
| Documentation | ❌ NO | - | - |
| Logging/analytics | ❌ NO | - | - |

### Review Commands

**Lightweight Review (FREE):**
```javascript
mcp__pal__codereview({
  model: "gemini-3-flash-preview",
  step: "Quick review for auth bugs, quota leaks, data integrity issues",
  findings: "",
  relevant_files: ["<changed files>"],
  review_type: "quick",
  review_validation_type: "internal",
  severity_filter: "medium",
  step_number: 1,
  total_steps: 1,
  next_step_required: false
})
```

**Deep Review (PAID - critical code only):**
```javascript
mcp__pal__codereview({
  model: "grok-code-fast-1",
  step: "Deep security review for HMAC verification. Check for: timing attacks, replay attacks, signature validation bypasses.",
  findings: "",
  relevant_files: ["<all related files>"],
  review_type: "security",
  review_validation_type: "external",
  severity_filter: "low",
  step_number: 1,
  total_steps: 2,
  next_step_required: true
})
```

---

## Customization

### Adjust Complexity Threshold
Edit `.claude/hooks/user-prompt-submit.sh` lines 20-35:

**Current:** Triggers at complexity ≥4
- **Too aggressive?** Change line 39: `if [ $COMPLEXITY_SCORE -ge 5 ]; then`
- **Too passive?** Change line 39: `if [ $COMPLEXITY_SCORE -ge 3 ]; then`

### Disable Auto-Detection
Comment out UserPromptSubmit hook in `.claude/settings.json`:

```json
// "UserPromptSubmit": [
//   {
//     "hooks": [
//       {
//         "type": "command",
//         "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.sh",
//         "timeout": 3000
//       }
//     ]
//   }
// ],
```

### Adjust Review Triggers
Edit `.claude/hooks/post-tool-use.sh` lines 91-125:
- Change file patterns (currently: `src/middleware`, `src/api-v3/webhooks`, `src/repositories`)
- Change line threshold (currently: 5 lines)

---

## Cost Management

**FREE Models (Use Liberally):**
- `gemini-3-flash-preview` - Fast, smart, FREE (2M context, thinking mode)
- `gemini-2.5-flash` - Good for most reviews (1M context)
- `gemini-2.5-flash-lite` - Ultra-fast, lighter tasks

**PAID Models (Use Sparingly):**
- `grok-code-fast-1` - Security reviews, critical logic
- `gemini-3-pro-preview` - Complex refactoring (rarely needed)

**Estimated Monthly Cost (if you follow this workflow):**
- **Free tier:** ~90% of reviews (quick reviews, debugging)
- **Paid tier:** ~10% of reviews (auth changes, critical security)
- **Total:** ~$5-10/month (depends on feature velocity)

---

## Success Metrics

### ✅ This is Working When:
- You ship features faster (subagents save time)
- Context isn't lost mid-task (planning files help)
- Real bugs caught before production (auth, quotas, data loss)
- Workflow feels lightweight (not bureaucratic)
- You use it voluntarily (not because you "have to")

### ❌ Warning Signs (Needs Adjustment):
- Simple tasks take longer than direct implementation
- Reviews flag theoretical issues (no real impact)
- Planning overhead exceeds task complexity
- You skip the workflow often (signal: too heavy)
- Cost is high (too many paid reviews)

---

## Integration with Existing Workflows

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `/pm-workflow` | **Full PM workflow** | Multi-step tasks, complex features |
| `/planning-with-files` | Just planning | When you want planning without delegation |
| `/work-review` | Discover backlog | Before starting new work |
| `/multi-agent-dev` | Enterprise workflow | Heavier process (not recommended for solo-dev) |
| `/commit-push-pr` | Ship code | After integration phase |
| `/deploy` | Production deploy | With monitoring |
| `/review` | CF-specific review | Lighter than PAL MCP |

---

## Troubleshooting

### Issue: Planning feels too heavy
**Solution:** Raise complexity threshold to 5 or 6 in `user-prompt-submit.sh`

### Issue: Reviews flag too many non-issues
**Solution:** Use `severity_filter: "medium"` or `review_type: "quick"`

### Issue: Haiku produces wrong code
**Solution:** Provide clearer specs, reference files, acceptance criteria

### Issue: PAL MCP costs too high
**Solution:** Use `gemini-3-flash-preview` (FREE) for most reviews, `grok` only for auth/security

### Issue: Workflow skipped too often
**Solution:** Lower complexity threshold OR simplify workflow steps

### Issue: Hook not triggering
**Solution:** Check permissions: `chmod +x .claude/hooks/user-prompt-submit.sh`

---

## Testing the Setup

### Test 1: Complexity Detection
```
You: "Implement user authentication with JWT tokens, session management, and refresh token rotation"

Expected: Hook detects complexity ≥4, suggests /pm-workflow
```

### Test 2: Security Trigger
```
# Edit a file in src/middleware/
Expected: post-tool-use hook suggests PAL MCP review with model options
```

### Test 3: Full Workflow
```
You: /pm-workflow "Add rate limiting to all V3 API endpoints"

Expected:
1. Creates task_plan.md, findings.md, progress.md
2. Guides through decomposition
3. Suggests Haiku delegation
4. Suggests PAL review (if risky)
5. Updates planning files
```

---

## What's Different from Enterprise Setup

| Aspect | Enterprise | Solo-Dev (This Setup) |
|--------|------------|----------------------|
| **Security Reviews** | Mandatory for all changes | Optional, risk-based |
| **Planning** | Required for all features | Triggered by complexity |
| **PAL MCP Usage** | Extensive (all code) | Strategic (auth, data, quotas) |
| **Quality Gates** | Strict (100% coverage) | Pragmatic (good enough ships) |
| **Cost** | Budget allocated | Minimize with FREE models |
| **Process** | Compliance-driven | Time-saving tool, not bureaucracy |
| **Risk Tolerance** | Low (SLAs, legal) | Medium (can hotfix, no SLA) |

---

## Next Steps

1. **Start a new session** to load the new system prompt
2. **Try a multi-step task** to see complexity detection
3. **Adjust thresholds** based on your preferences (lines 39, 93, 113)
4. **Monitor PAL MCP costs** after a week (adjust FREE/PAID balance)
5. **Iterate on the workflow** (feedback → update `.claude/system-prompt.md`)

---

## Files Reference

```
.claude/
├── system-prompt.md                    # Your PM role definition (NEW)
├── hooks/
│   ├── user-prompt-submit.sh           # Complexity detection (NEW)
│   ├── post-tool-use.sh                # PAL MCP review suggestions (MODIFIED)
│   ├── session-start.sh                # Project context
│   └── subagent-start.sh               # Subagent tracking
├── skills/
│   ├── pm-workflow.md                  # Full PM workflow (NEW)
│   ├── planning-with-files/            # Planning infrastructure
│   ├── work-review.md                  # Backlog discovery
│   └── multi-agent-dev.md              # Enterprise workflow (heavier)
└── settings.json                       # Hooks + permissions (MODIFIED)
```

---

## Philosophy Reminder

**This is a family app, not a startup.**

- Planning saves YOU time (not about process compliance)
- Reviews catch REAL bugs (not security theatre)
- Subagents are YOUR force multiplier (not delegation for delegation's sake)
- Good enough ships (perfection is the enemy of done)
- Cost matters (use FREE models, PAID only for critical)

**You built this for your family. Build pragmatically, ship confidently, iterate quickly.**

---

**Version:** 1.0-solo-dev
**Created:** January 14, 2026
**Maintained By:** Claude Code (Sonnet 4.5)
**Project:** BooksTrack Backend (Cloudflare Workers)
**User:** Justin (@jukasdrj) - Solo dev, family app, limited time, trusted users
