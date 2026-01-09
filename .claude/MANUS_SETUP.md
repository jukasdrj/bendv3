# Manus Plugin Setup Guide - BooksTrack Backend

**Plugin:** planning-with-files (v2.0.0)
**Repository:** https://github.com/OthmanAdi/planning-with-files
**Installed:** January 9, 2026
**Project:** BooksTrack Cloudflare Workers API

---

## Installation Status

✅ **Plugin installed** at `.claude/plugins/planning-with-files/`
✅ **Skill registered** at `.claude/skills/planning-with-files/`
✅ **Scripts executable** in `.claude/skills/planning-with-files/scripts/`

## Quick Start

### 1. Initialize Planning Files (For New Tasks)

When starting a complex task (>5 tool calls), run:

```bash
.claude/skills/planning-with-files/scripts/init-session.sh "task-name"
```

This creates three files in your project root:
- `task_plan.md` - Phase tracking, decisions, errors
- `findings.md` - Research, discoveries, resources
- `progress.md` - Session log, test results

### 2. Using the /planning-with-files Skill

The skill is now available as a slash command:

```
/planning-with-files
```

This will invoke the planning workflow for complex tasks.

### 3. Manual File Creation

If you prefer to create files manually, use the templates:

```bash
# Copy templates to project root
cp .claude/skills/planning-with-files/templates/task_plan.md .
cp .claude/skills/planning-with-files/templates/findings.md .
cp .claude/skills/planning-with-files/templates/progress.md .

# Edit to customize for your task
```

---

## How It Works

### The 3-File Pattern

**Manus Pattern:**
```
Context Window = RAM (volatile, limited)
Filesystem = Disk (persistent, unlimited)

→ Anything important gets written to disk.
```

| File | Purpose | Update When |
|------|---------|-------------|
| `task_plan.md` | Roadmap: phases, decisions, errors | After each phase |
| `findings.md` | Knowledge base: research, discoveries | After ANY discovery (2-Action Rule) |
| `progress.md` | Session log: actions, tests, errors | Throughout session |

### The 2-Action Rule (CRITICAL)

**After every 2 view/browser/search operations, IMMEDIATELY save findings to `findings.md`**

This prevents multimodal/visual information from being lost when context resets.

### The 5-Question Reboot Test

Can you answer these? If yes, your context is solid:

1. **Where am I?** → Current phase in `task_plan.md`
2. **Where am I going?** → Remaining phases
3. **What's the goal?** → Goal statement in `task_plan.md`
4. **What have I learned?** → `findings.md`
5. **What have I done?** → `progress.md`

---

## Hooks Integration

The plugin includes hooks that automatically trigger during Claude Code operations:

### PreToolUse Hook (Automatic Plan Re-reading)

**Triggers before:** Write, Edit, Bash commands
**Action:** Reads first 30 lines of `task_plan.md` into context
**Why:** Keeps your goals/phases fresh in attention window

### Stop Hook (Completion Verification)

**Triggers on:** Session stop/exit
**Action:** Runs `.claude/skills/planning-with-files/scripts/check-complete.sh`
**Why:** Verifies all phases marked complete before allowing exit

**Note:** These hooks are defined in the skill's `SKILL.md` frontmatter, not in `.claude/settings.json`

---

## BooksTrack-Specific Workflow

### When to Use Manus Pattern

**Use for:**
- Sprint planning (Sprint 3+)
- Multi-phase refactoring (Durable Objects, Circuit Breakers)
- New feature implementation (Webhooks, Job systems)
- Complex debugging sessions (D1 reads, KV cache tuning)
- TypeScript error resolution sprints

**Skip for:**
- Quick bug fixes
- Single-file edits
- Simple questions
- Linting/formatting

### Integration with Existing Tools

**BooksTrack has:**
- `TODO.md` - Master sprint/issue tracker
- `CLAUDE.md` - Project guidelines
- `.claude/CLAUDE.md` - Full Claude Code guidelines
- `.claude/rules/*.md` - Context-aware rules

**Manus adds:**
- `task_plan.md` - Task-level phase tracking
- `findings.md` - Task-level research/discoveries
- `progress.md` - Task-level session logging

**Relationship:**
```
TODO.md (master tracker)
   ├── Issue #256 → task_plan.md (webhook HMAC)
   ├── Issue #257 → task_plan.md (D1 migration)
   └── Sprint 3 → task_plan.md (frontend optimization)
```

### Example: Using Manus for Issue #256 (Webhook HMAC)

```bash
# 1. Initialize planning files
.claude/skills/planning-with-files/scripts/init-session.sh "webhook-hmac-256"

# 2. Edit task_plan.md
## Goal
Implement HMAC-SHA256 signature verification for Alexandria webhook callbacks to prevent unauthorized requests.

## Phases
### Phase 1: Research & Design
- [ ] Review RFC 2104 HMAC spec
- [ ] Research best practices (Stripe, GitHub)
- [ ] Design signature format
- **Status:** in_progress

### Phase 2: Implementation
- [ ] Add signature header to Alexandria
- [ ] Implement verification in Bend
- [ ] Add secret rotation support
- **Status:** pending

# 3. During work, update findings.md
## Research Findings
- Stripe uses `X-Stripe-Signature: t=timestamp,v1=signature` format
- GitHub uses `X-Hub-Signature-256: sha256=signature`
- Replay attack prevention: timestamp validation (<5min window)

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use `X-Alexandria-Signature` header | Clear origin, follows GitHub pattern |
| Include timestamp in HMAC payload | Prevents replay attacks |
| 5-minute validation window | Balance security/clock drift |

# 4. Update progress.md as you work
### Phase 1: Research & Design
- **Status:** complete
- **Started:** 2026-01-09 10:00
- Actions taken:
  - Researched HMAC implementations (Stripe, GitHub, Twilio)
  - Designed signature format: `timestamp.rawBody`
  - Added findings to findings.md
- Files created/modified:
  - findings.md (research)
  - task_plan.md (phase 1 → complete)
```

---

## Advanced Features

### Templates

Located at `.claude/skills/planning-with-files/templates/`:
- `task_plan.md` - Phase tracking template
- `findings.md` - Research/discovery template
- `progress.md` - Session logging template

### Scripts

Located at `.claude/skills/planning-with-files/scripts/`:
- `init-session.sh` - Creates all three planning files
- `check-complete.sh` - Verifies all phases complete (used by Stop hook)

### Reference Docs

Located at `.claude/skills/planning-with-files/`:
- `SKILL.md` - Skill definition + quick reference
- `reference.md` - Manus principles deep dive
- `examples.md` - Real-world usage examples

---

## Critical Rules (Manus Pattern)

### 1. Create Plan First
Never start a complex task without `task_plan.md`. Non-negotiable.

### 2. The 2-Action Rule
After every 2 view/browser/search operations, IMMEDIATELY save findings to `findings.md`.

### 3. Read Before Decide
Before major decisions, re-read `task_plan.md` to refresh goals in attention window.

### 4. Update After Act
After completing any phase:
- Mark phase status: `in_progress` → `complete`
- Log any errors encountered
- Note files created/modified

### 5. Log ALL Errors
Every error goes in both:
- `task_plan.md` - Quick error table
- `progress.md` - Detailed error log with timestamps

### 6. Never Repeat Failures
```
if action_failed:
    next_action != same_action
```
Track attempts, mutate approach using 3-Strike Protocol.

---

## The 3-Strike Error Protocol

```
ATTEMPT 1: Diagnose & Fix
  → Read error carefully
  → Identify root cause
  → Apply targeted fix

ATTEMPT 2: Alternative Approach
  → Same error? Try different method
  → Different tool? Different library?
  → NEVER repeat exact same failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Consider updating the plan

AFTER 3 FAILURES: Escalate to User
  → Explain what you tried
  → Share the specific error
  → Ask for guidance
```

---

## BooksTrack Integration Examples

### Scenario 1: Sprint 3 Phase 3B (Multi-week project)

```bash
# Initialize
.claude/skills/planning-with-files/scripts/init-session.sh "sprint-3-phase-3b"

# task_plan.md
## Goal
Complete Sprint 3 Phase 3B: Frontend optimization features (multi-size covers, alarm resilience, D1 concurrency)

## Phases
### Phase 1: Multi-Size Cover URLs (#237)
- [ ] Add size parameter to cover URL schema
- [ ] Update API response format
- [ ] Test with iOS app
- **Status:** in_progress

### Phase 2: Alarm Resilience Tests (#246)
- [ ] Design test suite for DO alarms
- [ ] Implement tests
- [ ] Verify production behavior
- **Status:** pending

### Phase 3: D1 Concurrency Analysis (#247)
- [ ] Profile D1 read/write patterns
- [ ] Identify bottlenecks
- [ ] Optimize queries
- **Status:** pending
```

### Scenario 2: Debugging Session (D1 Read Performance)

```bash
# Initialize
.claude/skills/planning-with-files/scripts/init-session.sh "d1-read-perf"

# task_plan.md
## Goal
Investigate and resolve P95 latency spike in D1 reads (500ms → 2.5s)

## Phases
### Phase 1: Profiling
- [ ] Capture slow query logs
- [ ] Analyze query patterns
- [ ] Identify bottlenecks
- **Status:** in_progress

### Phase 2: Hypothesis Testing
- [ ] Test index optimization
- [ ] Test batch reads
- [ ] Compare KV vs D1 latency
- **Status:** pending

# findings.md - Updated during work
## Research Findings
- D1 P95 latency: 2.5s (wrangler tail analysis)
- Query pattern: Single ISBN lookups (no batching)
- Index status: Missing composite index on (isbn, updated_at)

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Add composite index (isbn, updated_at) | Covers 90% of queries |
| Implement read batching | Reduce round-trips |
| Monitor with D1_READ_PERCENTAGE | Gradual rollout 0→10→25→50→100 |

# progress.md - Session log
### Phase 1: Profiling
- **Status:** complete
- **Started:** 2026-01-09 11:00
- Actions taken:
  - Analyzed wrangler tail logs (500 requests)
  - Identified missing index
  - Created SQL migration for composite index
- Files created/modified:
  - migrations/0005_add_isbn_updated_at_index.sql
  - findings.md
  - task_plan.md (phase 1 → complete)

## Test Results
| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| D1 read (no index) | <500ms P95 | 2.5s P95 | ❌ |
| D1 read (with index) | <200ms P95 | 180ms P95 | ✅ |
```

---

## Upgrading from v1.x

See `.claude/plugins/planning-with-files/MIGRATION.md` for detailed upgrade guide.

**Key changes in v2.0.0:**
- Hooks integration (PreToolUse, Stop)
- Templates with detailed comments
- Helper scripts (init-session.sh, check-complete.sh)
- Enhanced documentation (2-Action Rule, 3-Strike Protocol, 5-Question Test)

---

## Resources

- **Plugin Repo:** https://github.com/OthmanAdi/planning-with-files
- **Manus Reference:** `.claude/skills/planning-with-files/reference.md`
- **Examples:** `.claude/skills/planning-with-files/examples.md`
- **BooksTrack Guidelines:** `.claude/CLAUDE.md`
- **Project TODO:** `TODO.md`

---

## Troubleshooting

### Files created in wrong location
**Problem:** Planning files created in `.claude/plugins/planning-with-files/` instead of project root
**Solution:** Always run `init-session.sh` from project root (`/Users/juju/dev_repos/bendv3`)

### Hooks not triggering
**Problem:** PreToolUse hook not reading `task_plan.md`
**Solution:** Hooks are defined in skill's `SKILL.md`, not `.claude/settings.json`. Ensure skill is installed in `.claude/skills/planning-with-files/`

### Check-complete.sh blocking exit
**Problem:** Stop hook prevents exit because phases aren't marked complete
**Solution:** Update `task_plan.md` phase statuses from `in_progress` → `complete`

---

**Last Updated:** January 9, 2026
**Maintained By:** @jukasdrj
**Plugin Version:** 2.0.0
