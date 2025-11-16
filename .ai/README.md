# .ai Directory - AI-Assisted Development Configuration

This directory contains configuration and context files for AI-assisted development tools (GitHub Copilot, Cursor, Codeium, Tabnine, etc.).

---

## Purpose

The `.ai` directory provides:
1. **Project context** for AI coding assistants
2. **API contract reference** for code generation
3. **Coding standards** and patterns
4. **Common prompts** for frequent tasks
5. **Model preferences** for different operations

---

## File Structure

```
.ai/
├── README.md              # This file
├── context.md             # Project overview and architecture
├── api-contract-ref.md    # Quick reference to API_CONTRACT.md
├── coding-standards.md    # Code style and patterns
├── prompts/               # Reusable prompts for common tasks
│   ├── new-endpoint.md    # Template for creating API endpoints
│   ├── dto-changes.md     # Template for DTO modifications
│   └── wikidata-query.md  # Template for Wikidata enrichment queries
└── model-preferences.md   # AI model selection guidelines
```

---

## Quick Reference

### API Contract
**Source of Truth:** `../docs/API_CONTRACT.md`

All code generation must conform to this contract:
- Response envelope format
- DTO schemas (WorkDTO, EditionDTO, AuthorDTO)
- Error codes
- Rate limiting
- SLAs

### Coding Standards
See: `coding-standards.md` for:
- ES6+ patterns (async/await, destructuring)
- Error handling (try-catch required)
- Cloudflare Workers patterns (env bindings, KV cache)
- No semicolons (ASI), single quotes, 2-space indent

### Common Tasks
See: `prompts/` for templates:
- Creating new v1 endpoints
- Modifying DTOs
- Adding Wikidata enrichment
- Writing contract tests

---

## Usage

### With GitHub Copilot
Copilot automatically reads files in `.ai/` for context.

**Best practice:**
- Keep `context.md` under 2000 tokens
- Reference specific files in comments: `// See: .ai/prompts/new-endpoint.md`

### With Cursor
Cursor indexes `.ai/` files for @-mentions.

**Best practice:**
- Use `@api-contract-ref.md` when generating API code
- Use `@coding-standards.md` for style consistency

### With Codeium/Tabnine
These tools use `.ai/context.md` for project understanding.

**Best practice:**
- Keep context focused on architecture (not implementation details)
- Update context.md when major refactorings happen

---

## Maintenance

### When to Update
- ✅ API contract changes → Update `api-contract-ref.md`
- ✅ New coding pattern adopted → Update `coding-standards.md`
- ✅ Frequently repeated prompt → Add to `prompts/`
- ✅ Major architecture change → Update `context.md`

### Ownership
- **Backend team:** Maintains all `.ai/` files
- **AI agents:** `cf-code-reviewer` validates `.ai/` compliance

---

## Related Documentation

| File | Purpose |
|------|---------|
| `../docs/API_CONTRACT.md` | Authoritative API contract (source of truth) |
| `../.claude/CLAUDE.md` | Claude Code project guidelines |
| `../.claude/agents/README.md` | Autonomous agent documentation |
| `../docs/README.md` | Documentation navigation |

---

**Last Updated:** November 15, 2025
**Maintained By:** Backend Team
