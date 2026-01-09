# Claude Code Skills Reference

## Git/Commit Skills

These skills are built into Claude Code via the `commit-commands` plugin.

### Usage

**Full skill name (always works):**
```
/commit-commands:commit
```

**Shorthand alias (may not work):**
```
/commit
```

If the shorthand `/commit` shows "Unknown skill: commit", use the full name `/commit-commands:commit` instead.

### Available Commit Skills

1. **commit-commands:commit** - Create a git commit
   - Stages changes and creates a commit with AI-generated message
   - Includes attribution footer

2. **commit-commands:commit-push-pr** - Commit, push, and open a PR
   - Creates commit, pushes to remote, and opens pull request
   - One-shot workflow for feature branches

3. **commit-commands:clean_gone** - Clean up gone branches
   - Removes local branches deleted on remote
   - Cleans up associated worktrees

## Other Available Skills

- `planning-with-files:planning-with-files` - Manus-style file-based planning
- `frontend-design:frontend-design` - Create production-grade frontend interfaces
- `pr-review-toolkit:review-pr` - Comprehensive PR review
- `feature-dev:feature-dev` - Guided feature development

## Troubleshooting

If you see "Unknown skill: X", try:
1. Use the full skill name with namespace (e.g., `commit-commands:commit`)
2. Check available skills in the Skill tool documentation
3. Ensure the plugin is properly installed

---

**Last Updated:** January 9, 2026
