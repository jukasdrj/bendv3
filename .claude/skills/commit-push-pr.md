---
name: commit-push-pr
description: Commit, push, and open a PR in one workflow
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

Streamlined workflow to commit changes, push to remote, and create a pull request:

**Workflow:**
1. **Run validation** - `npm run validate` to ensure tests pass
2. **Stage changes** - Review and stage modified files
3. **Create commit** - Generate commit message following repo conventions
4. **Push to remote** - Push branch with `-u` flag if needed
5. **Create PR** - Use `gh pr create` with detailed description

**Commit Message Format:**
```
<type>(<scope>): <subject>

<body>

🤖 Generated with [Claude Code](https://claude.ai/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**PR Description Format:**
```markdown
## Summary
- Bullet points of changes

## Test plan
- [ ] Tests pass locally
- [ ] Manual testing completed
- [ ] No regressions

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
```

**Use this when:**
- Completing a feature or bug fix
- Ready to submit changes for review
- Want a streamlined commit → push → PR flow

**Safety checks:**
- Validates tests pass before commit
- Reviews staged files
- Generates descriptive commit messages
- Creates comprehensive PR descriptions
