---
name: pm-workflow
description: Solo-dev PM workflow - planning → decomposition → delegation → optional review → delivery (pragmatic, not bureaucratic)
user-invocable: true
model: sonnet
context: fork
allowed-tools:
  - Skill
  - mcp__pal__chat
  - mcp__pal__codereview
  - mcp__pal__debug
  - mcp__pal__planner
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
---

# PM Workflow Coordinator (Solo-Dev Edition)

**Context:** Family app, solo developer, pragmatic quality standards
**Philosophy:** Planning saves time, reviews prevent real bugs, perfection is the enemy of shipping

---

## Purpose

This skill automates the **planning → decomposition → delegation → review → delivery** workflow for complex multi-step tasks. Designed for **Justin's reality**:
- Limited time (maximize efficiency)
- Trusted users (focus on real risks, skip theatre)
- No SLAs (can hotfix, no need for paranoia)
- Cost-conscious (use free models when possible)

---

## When to Use This Skill

### ✅ Use /pm-workflow for:
- Multi-file features (3+ files or components)
- Complex integrations (Alexandria, Gemini, Workers AI, Queues)
- Refactoring with breakage risk (circuit breaker, enrichment logic)
- Database migrations or schema changes
- New V3 API endpoints (public surface, validation)
- Tasks you'll forget details about mid-work (>30min)

### ❌ Skip for:
- Single-file bug fixes (just fix it)
- Documentation updates (just write it)
- Linting/formatting (just run `npm run lint:fix`)
- Quick experiments (don't plan experiments)
- Debugging sessions (use `findings.md` standalone)

---

## Workflow Steps

### Phase 1: Initialization (Automatic)

When you invoke `/pm-workflow "<task>"`, this skill:

1. **Creates Planning Files** in project root:
   ```bash
   # Uses planning-with-files skill
   /planning-with-files
   ```
   Creates:
   - `task_plan.md` - Phases, decisions, error tracking
   - `findings.md` - Research, discoveries, patterns
   - `progress.md` - Session log, test results

2. **Gathers Context** (automated):
   - Uses `Glob` to find relevant files
   - Reads existing patterns (handlers, services, tests)
   - Identifies dependencies (what touches what)
   - Notes constraints (Cloudflare limits, API quotas)

3. **Creates Task Plan** in `task_plan.md`:
   ```markdown
   ## Goal
   <Clear one-sentence goal>

   ## Success Criteria
   - [ ] <Testable criterion 1>
   - [ ] <Testable criterion 2>

   ## Phases
   | Phase | Status | Owner | Notes |
   |-------|--------|-------|-------|
   | 1. Discovery | pending | Sonnet | <what to research> |
   | 2. Implementation | pending | Haiku | <what to build> |
   | 3. Review | pending | PAL/Skip | <what to check> |
   | 4. Integration | pending | Sonnet | <what to test> |

   ## Risks
   - <Real risk 1 - data loss, quota leak, etc.>
   - <Real risk 2>

   ## Decisions
   <Log architectural decisions here>
   ```

---

### Phase 2: Decomposition (You Drive This)

**Your Role:** Make decisions, don't delegate architecture

1. **Clarify Requirements** (if needed):
   ```javascript
   AskUserQuestion({
     questions: [{
       question: "Should rate limiting be per-user or global?",
       header: "Rate Limit",
       options: [
         { label: "Per-user", description: "Fairer but more complex" },
         { label: "Global", description: "Simpler, good enough for family" }
       ],
       multiSelect: false
     }]
   })
   ```

2. **Research Patterns** (find existing code):
   ```javascript
   // Example: How do other endpoints handle auth?
   Grep({
     pattern: "validateJWT|checkAuth",
     output_mode: "files_with_matches",
     glob: "src/handlers/**/*.ts"
   })
   ```

3. **Define Phases** (2-4 phases, not 10):
   - **Phase 1:** Core logic (the hard part)
   - **Phase 2:** Error handling + validation
   - **Phase 3:** Tests
   - **Phase 4:** Documentation + deployment

4. **Identify Review Needs** (see PAL MCP Policy below)

---

### Phase 3: Execution (Delegate Strategically)

**Option A: Delegate to Haiku** (most implementation)

```javascript
mcp__pal__chat({
  model: "haiku",
  prompt: `Implement ${FEATURE_NAME}.

Requirements:
- ${REQ_1}
- ${REQ_2}
- Follow patterns in ${REFERENCE_FILE}

Acceptance Criteria:
- ${CRITERION_1}
- ${CRITERION_2}

Include:
- JSDoc for public functions
- Error handling with try-catch
- Input validation with Zod (if API endpoint)
- Unit tests following existing patterns`,

  absolute_file_paths: [
    "/absolute/path/to/reference.ts",
    "/absolute/path/to/existing-pattern.ts"
  ],

  working_directory_absolute_path: "/Users/juju/dev_repos/bendv3",

  temperature: 0, // Deterministic for code
  thinking_mode: "medium" // Balance speed and quality
})
```

**Option B: You Implement** (risky/architectural code)

For:
- Authentication logic (too critical to delegate)
- Complex queries (need performance reasoning)
- Circuit breaker changes (subtle state machine logic)
- New architecture patterns (learning opportunity)

**Option C: Use PAL MCP Debug** (investigation)

```javascript
mcp__pal__debug({
  model: "gemini-3-flash-preview", // FREE
  step: "Investigate why D1 reads are timing out at 50% rollout",
  findings: "",
  relevant_files: [
    "/Users/juju/dev_repos/bendv3/src/repositories/book-repository.ts"
  ],
  step_number: 1,
  total_steps: 3,
  next_step_required: true,
  confidence: "exploring"
})
```

---

### Phase 4: Review (Optional, Risk-Based)

**PAL MCP Review Policy** (cost-aware, pragmatic)

#### ✅ REVIEW for (Real Risks):
- **Auth/Authorization:** JWT validation, session handling, token expiry
- **Quota/Rate Limits:** Prevent runaway API costs (ISBNdb, Gemini)
- **Database Writes:** Data loss risks (D1 mutations, KV deletes)
- **New V3 Endpoints:** Public surface, input validation, error handling
- **Alexandria Integration:** Complex multi-provider orchestration
- **Payment Logic:** If ever added (critical)

#### ❌ SKIP REVIEW for (Low Risk):
- Internal refactoring (no external impact)
- Test additions (tests don't need reviews)
- Documentation/comments
- Logging/analytics
- UI/formatting
- Bug fixes Haiku makes (you already reviewed the fix)

#### Review Levels

**Lightweight Review** (most cases):
```javascript
mcp__pal__codereview({
  model: "gemini-3-flash-preview", // FREE, fast, good enough

  step: "Quick review for: auth bugs, quota leaks, data integrity issues, input validation gaps",

  findings: "",

  relevant_files: [
    "/Users/juju/dev_repos/bendv3/src/handlers/new-feature.ts",
    "/Users/juju/dev_repos/bendv3/src/services/new-service.ts"
  ],

  review_type: "quick", // Not "full" - focus on real issues

  review_validation_type: "internal", // Skip external follow-up

  severity_filter: "medium", // Ignore low-priority style issues

  step_number: 1,
  total_steps: 1,
  next_step_required: false, // One-shot review

  confidence: "high" // You've already done basic validation
})
```

**Deep Review** (high-risk changes only):
```javascript
mcp__pal__codereview({
  model: "grok-code-fast-1", // PAID, but worth it for critical code

  step: "Deep security and correctness review for webhook HMAC verification. Check for: timing attacks, replay attacks, signature validation bypasses, error handling that leaks info.",

  findings: "",

  relevant_files: [
    "/Users/juju/dev_repos/bendv3/src/api-v3/webhooks/alexandria.ts",
    "/Users/juju/dev_repos/bendv3/src/middleware/hmac-verify.ts"
  ],

  review_type: "security", // Focus on vulnerabilities

  review_validation_type: "external", // Get expert follow-up

  severity_filter: "low", // Flag everything, we'll triage

  step_number: 1,
  total_steps: 2,
  next_step_required: true, // Multi-step deep analysis

  confidence: "medium", // HMAC is subtle, need expert validation

  standards: "OWASP Top 10, Cloudflare Workers security best practices"
})
```

#### Review Triage (What to Fix)

**P0 - Fix Before Merging:**
- Auth bypass (anyone can access family data)
- Data loss bugs (delete/corrupt books)
- Quota leaks (runaway costs)
- SQL injection / XSS (input validation missing)

**P1 - Fix This Week:**
- Error exposure (stack traces leaking secrets)
- Cache bugs (wrong user's data)
- Performance issues (slow queries blocking users)

**P2 - Fix When Convenient:**
- Code smells (technical debt)
- Missing tests (coverage gaps)
- Suboptimal algorithms (works but slow)

**P3 - Document and Ignore:**
- Style inconsistencies (linter doesn't catch)
- Theoretical vulnerabilities (no real attack vector)
- Over-engineering suggestions (YAGNI)

---

### Phase 5: Integration (You Validate)

1. **Quick Sanity Check:**
   ```bash
   npm run test:smoke  # 5 seconds
   npm run lint        # Check style
   ```

2. **Update Planning Files:**
   - Mark phases complete in `task_plan.md`
   - Log key findings in `findings.md`
   - Record test results in `progress.md`

3. **Verify Success Criteria:**
   - [ ] All acceptance criteria met?
   - [ ] P0/P1 review findings addressed?
   - [ ] Tests passing?
   - [ ] Documentation updated (if needed)?

4. **Deploy or Defer:**
   - If clean: `/commit-push-pr` or `/deploy`
   - If issues: Document blockers, fix later

---

### Phase 6: Delivery (Communicate Clearly)

**To User (Justin):**
```
✅ Completed: <Feature Name>

What Changed:
- <Change 1>
- <Change 2>

Key Decisions:
- <Why we chose X over Y>

Review Findings:
- P0/P1: All addressed
- P2: <Deferred items logged in TODO.md>

Tests:
- <New tests added>
- All passing (npm run test:safe)

Next Steps:
- <Deploy when ready>
- <Monitor for X>
- <Consider Y for future iteration>
```

---

## Cost Management (PAL MCP)

### FREE Models (Use Liberally)
| Model | Best For | Limits |
|-------|----------|--------|
| `gemini-3-flash-preview` | Quick reviews, debugging | 2M context, thinking mode |
| `gemini-2.5-flash` | General code review | 1M context |
| `gemini-2.5-flash-lite` | Ultra-fast checks | 1M context |

### PAID Models (Use Sparingly)
| Model | Best For | Cost |
|-------|----------|------|
| `grok-code-fast-1` | Security reviews, critical logic | Pay-per-use |
| `gemini-3-pro-preview` | Complex refactoring | Pay-per-use |

### Cost Strategy
```
┌─────────────────────┬─────────────────────┐
│ Task Type           │ Model Choice        │
├─────────────────────┼─────────────────────┤
│ Quick review        │ gemini-3-flash (FREE)│
│ Security review     │ grok-code-fast (PAID)│
│ Debugging           │ gemini-3-flash (FREE)│
│ Refactoring review  │ gemini-2.5-flash (FREE)│
│ Critical auth logic │ grok-code-fast (PAID)│
└─────────────────────┴─────────────────────┘
```

---

## Success Metrics

### ✅ Good Signs
- Tasks complete faster (subagents save time)
- Context not lost mid-task (planning files help)
- Real bugs caught (auth, quotas, data integrity)
- Workflow feels lightweight (not process-heavy)
- You ship more features per week

### ❌ Warning Signs
- Simple tasks take longer than direct implementation
- Reviews flag theoretical issues (no real impact)
- Planning overhead > task complexity
- You skip the workflow (signal: too heavy)
- Cost is high (too many paid reviews)

---

## Integration with Existing Skills

| Skill | When to Use |
|-------|-------------|
| `/planning-with-files` | Just planning, no delegation |
| `/multi-agent-dev` | Enterprise workflow (heavier) |
| `/work-review` | Discover backlog before starting |
| `/commit-push-pr` | Ship when done |
| `/deploy` | Production deployment with monitoring |
| `/review` | CF-specific code review (lighter than PAL) |

---

## Examples

### Example 1: New API Endpoint (Full Workflow)

**Task:** "Add GET /v3/books/:isbn/similar endpoint using embeddings"

**Phase 1: Initialization**
```
/pm-workflow "Add GET /v3/books/:isbn/similar endpoint using embeddings"
```
Creates planning files, gathers context about existing search endpoints.

**Phase 2: Decomposition**
```markdown
## Goal
Add semantic similarity search endpoint to V3 API

## Success Criteria
- [ ] Endpoint returns similar books based on embeddings
- [ ] Respects rate limits
- [ ] Includes OpenAPI schema
- [ ] Tests cover happy path + edge cases

## Phases
| Phase | Status | Owner | Notes |
|-------|--------|-------|-------|
| 1. Research | pending | Sonnet | Check existing Vectorize usage |
| 2. Implementation | pending | Haiku | Handler + service layer |
| 3. Review | pending | PAL | Security/performance check |
| 4. Integration | pending | Sonnet | Tests + docs |

## Risks
- Vectorize query performance (P95 latency?)
- Rate limit bypass (need per-user limiting)
```

**Phase 3: Execution (Haiku)**
```javascript
mcp__pal__chat({
  model: "haiku",
  prompt: "Implement GET /v3/books/:isbn/similar endpoint...",
  absolute_file_paths: [
    "/Users/juju/dev_repos/bendv3/src/api-v3/index.ts",
    "/Users/juju/dev_repos/bendv3/src/services/embedding-service.ts"
  ],
  temperature: 0
})
```

**Phase 4: Review (Lightweight)**
```javascript
mcp__pal__codereview({
  model: "gemini-3-flash-preview", // FREE
  step: "Quick review for rate limit bypass, Vectorize query optimization",
  relevant_files: ["<new endpoint files>"],
  review_type: "quick",
  review_validation_type: "internal"
})
```

**Phase 5: Integration**
```bash
npm run test:safe   # Verify
npm run lint        # Style check
# Update task_plan.md phases to "complete"
```

**Phase 6: Delivery**
```
✅ Added /v3/books/:isbn/similar endpoint
- Uses Vectorize for semantic similarity
- Returns top 10 similar books
- Rate limited (same as search)
- Tests cover ISBN not found, no embedding, empty results
```

---

### Example 2: Bug Fix (Skip Workflow)

**Task:** "Fix typo in error message"

**Decision:** ❌ Don't use workflow (overkill)

**Action:**
```javascript
Edit({
  file_path: "/Users/juju/dev_repos/bendv3/src/handlers/book-handler.ts",
  old_string: "error: 'Bokk not found'",
  new_string: "error: 'Book not found'"
})
```
Done in 30 seconds. No planning needed.

---

### Example 3: Risky Refactoring (Full Workflow + Deep Review)

**Task:** "Refactor circuit breaker to support per-provider state isolation"

**Phase 1: Initialization**
```
/pm-workflow "Refactor circuit breaker for per-provider state isolation"
```

**Phase 2: Decomposition**
```markdown
## Risks
- Breaking existing provider chain (Alexandria, Google Books, OpenLibrary)
- State corruption (KV race conditions)
- Performance regression (more KV reads)

## Review Strategy
- Deep review with Grok (PAID) - state machine correctness is critical
```

**Phase 3: Execution (You implement - too risky to delegate)**
```typescript
// You write the refactored circuit breaker
// Complex state machine logic requires your reasoning
```

**Phase 4: Deep Review**
```javascript
mcp__pal__codereview({
  model: "grok-code-fast-1", // PAID - worth it for critical logic
  step: "Deep review of circuit breaker state machine...",
  review_type: "full",
  review_validation_type: "external", // Need expert validation
  standards: "Stateful system correctness, KV race condition handling"
})
```

**Phase 5: Integration + Extra Testing**
```bash
npm run test:safe
# Manual testing with wrangler tail
# Gradual rollout (monitor metrics)
```

---

## Troubleshooting

### Issue: Planning feels too heavy
**Solution:** Raise complexity threshold in user-prompt-submit.sh (line 20-35)

### Issue: Reviews flag too many non-issues
**Solution:** Use `severity_filter: "medium"` or `review_type: "quick"`

### Issue: Haiku produces wrong code
**Solution:** Provide clearer specs, reference files, acceptance criteria

### Issue: PAL MCP costs too high
**Solution:** Use gemini-3-flash-preview (FREE) for most reviews, grok only for critical

### Issue: Workflow skipped too often
**Solution:** Lower complexity threshold OR simplify workflow steps

---

## Adaptation

**This skill evolves based on your usage patterns:**

- Track which tasks benefit from planning (update "When to Use")
- Adjust review triggers based on bugs that slip through
- Refine Haiku delegation prompts based on output quality
- Update cost strategy based on actual PAL MCP spend

**Feedback Loop:**
```
Task → Use Workflow → Ship → Did it help?
                                    ↓
                              YES: Keep pattern
                              NO:  Adjust or skip next time
```

---

**Version:** 1.0-solo-dev
**Created:** 2026-01-14
**Maintained By:** Claude Code (Sonnet 4.5)
**Project:** BooksTrack Backend (Cloudflare Workers)
**Context:** Solo dev, family app, pragmatic quality standards
