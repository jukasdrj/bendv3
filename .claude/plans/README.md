# BooksTrack Planning Files

This directory stores planning files for complex tasks using the Manus-style file-based planning pattern.

## Directory Structure

```
.claude/plans/
├── README.md              # This file
├── task_plan.md           # Current phase tracking (when active)
├── findings.md            # Research discoveries (when active)
└── progress.md            # Session logging (when active)
```

## Configuration

This directory is configured in `.claude/settings.json`:
```json
{
  "plansDirectory": ".claude/plans"
}
```

## When to Use

Use planning files for:
- Multi-step tasks (3+ steps)
- Research tasks
- Building/creating projects
- Tasks spanning many tool calls
- Anything requiring organization

Skip for:
- Simple questions
- Single-file edits
- Quick lookups

## Planning Files

### task_plan.md
Tracks phases, progress, and decisions. Update after each phase.

### findings.md
Stores research and discoveries. Update after ANY discovery.

### progress.md
Session log and test results. Update throughout session.

## Templates

Copy templates from the planning-with-files plugin:
- `~/.claude/plugins/planning-with-files/skills/planning-with-files/templates/`

## Related

- **Plugin:** planning-with-files (installed)
- **Skill:** `/planning-with-files`
- **Claude Code Feature:** Native plans directory (v2.1.9+)

## Best Practices

1. **Create plan first** - Never start complex tasks without `task_plan.md`
2. **Read before decide** - Refresh goals in attention window
3. **Update after act** - Mark phases complete, log errors
4. **2-Action Rule** - After 2 searches, save findings immediately
5. **Log ALL errors** - Build knowledge, prevent repetition

---

**Last Updated:** January 16, 2026
**Maintained By:** AI Team
