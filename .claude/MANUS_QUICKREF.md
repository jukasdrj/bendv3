# Manus Quick Reference Card

**Plugin:** planning-with-files v2.0.0 | **Docs:** `.claude/MANUS_SETUP.md`

---

## 🚀 Start New Task

```bash
# Create planning files
.claude/skills/planning-with-files/scripts/init-session.sh "task-name"

# Or use slash command
/planning-with-files
```

Creates in project root:
- `task_plan.md` - Phases, decisions, errors
- `findings.md` - Research, discoveries
- `progress.md` - Session log, tests

---

## 📋 The 3-File Pattern

```
Context Window = RAM (volatile, limited)
Filesystem = Disk (persistent, unlimited)

→ Anything important gets written to disk
```

| File | Purpose | Update |
|------|---------|--------|
| `task_plan.md` | Roadmap: phases, goals | After each phase |
| `findings.md` | Knowledge: research, decisions | After ANY discovery |
| `progress.md` | Log: actions, tests, errors | Throughout session |

---

## ⚡ Critical Rules

### 1. Plan First
Create `task_plan.md` BEFORE starting work. Non-negotiable.

### 2. 2-Action Rule
**After every 2 view/browser/search operations → Update `findings.md`**

Prevents visual/multimodal loss.

### 3. Read Before Decide
Re-read `task_plan.md` before major decisions (refreshes attention).

### 4. Update After Act
Phase complete? Mark status: `in_progress` → `complete`

### 5. Log ALL Errors
Every error goes in:
- `task_plan.md` - Error table
- `progress.md` - Detailed log with timestamp

### 6. Never Repeat
```
if action_failed:
    next_action != same_action
```

---

## 🔄 3-Strike Error Protocol

```
ATTEMPT 1: Diagnose & Fix
  → Read error, identify cause, apply fix

ATTEMPT 2: Alternative Approach
  → Same error? Different method/tool/library
  → NEVER repeat exact failing action

ATTEMPT 3: Broader Rethink
  → Question assumptions
  → Search for solutions
  → Update plan

AFTER 3: Escalate to User
  → Explain attempts
  → Share error
  → Ask guidance
```

---

## 🧪 5-Question Reboot Test

Can you answer these? If yes, context is solid:

| # | Question | Answer Source |
|---|----------|---------------|
| 1 | Where am I? | Current phase in `task_plan.md` |
| 2 | Where am I going? | Remaining phases |
| 3 | What's the goal? | Goal statement in `task_plan.md` |
| 4 | What have I learned? | `findings.md` |
| 5 | What have I done? | `progress.md` |

---

## 🎯 When to Use

**Use for:**
- Multi-step tasks (3+ steps)
- Research projects
- Sprint planning
- Complex debugging
- Refactoring sessions
- Feature implementation (>5 tool calls)

**Skip for:**
- Simple questions
- Single-file edits
- Quick fixes
- Linting

---

## 🔧 BooksTrack Examples

### Sprint Planning
```bash
.claude/skills/planning-with-files/scripts/init-session.sh "sprint-3-phase-3c"
```

### Issue #256 (Webhook HMAC)
```bash
.claude/skills/planning-with-files/scripts/init-session.sh "webhook-hmac-256"
```

### Debugging D1 Reads
```bash
.claude/skills/planning-with-files/scripts/init-session.sh "d1-read-perf"
```

---

## 📂 File Locations

| Path | What |
|------|------|
| `.claude/plugins/planning-with-files/` | Plugin installation |
| `.claude/skills/planning-with-files/` | Skill (slash command) |
| `.claude/skills/planning-with-files/scripts/` | Helper scripts |
| `.claude/skills/planning-with-files/templates/` | File templates |
| `.claude/MANUS_SETUP.md` | Full setup guide |
| `.claude/MANUS_QUICKREF.md` | This file |

---

## 🔗 Resources

- **Plugin Repo:** https://github.com/OthmanAdi/planning-with-files
- **Manus Principles:** `.claude/skills/planning-with-files/reference.md`
- **Examples:** `.claude/skills/planning-with-files/examples.md`
- **BooksTrack Guide:** `.claude/CLAUDE.md`

---

## 🐛 Troubleshooting

**Files in wrong location?**
→ Run script from project root

**Hooks not working?**
→ Check skill installed: `ls .claude/skills/planning-with-files/`

**Exit blocked?**
→ Mark all phases `complete` in `task_plan.md`

---

**Last Updated:** January 9, 2026
