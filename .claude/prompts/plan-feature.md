# Backend Feature Planning Prompt

Use this prompt with Zen MCP for comprehensive feature planning:

```bash
/mcp zen planner
```

## Feature Planning Template

### 1. Define Requirements
- **User story:** As a [user], I want [goal] so that [reason]
- **Success criteria:** What does "done" look like?
- **Constraints:** Performance, cost, compatibility

### 2. Architecture Design
- **API endpoints:** New routes needed
- **Data flow:** Request → Handler → Service → Provider → Response
- **External dependencies:** Third-party APIs, new libraries
- **Caching strategy:** What to cache, TTL, invalidation

### 3. Implementation Plan
- **Phase 1:** Core functionality (MVP)
- **Phase 2:** Error handling and validation
- **Phase 3:** Performance optimization
- **Phase 4:** Testing and documentation

### 4. Risk Assessment
- **Technical risks:** Complexity, unknowns
- **Operational risks:** Cost, quota limits
- **Timeline risks:** Dependencies, blockers

## Example: Planning a New Search Provider

```bash
mcp zen planner --feature "Add Goodreads search provider"
```

**Requirements:**
- Add Goodreads API as third search provider (after Google Books, OpenLibrary)
- Fallback chain: Google Books → OpenLibrary → Goodreads
- Cache responses for 24 hours
- Response time < 500ms (P95)

**Architecture:**
```
src/
├── providers/
│   └── goodreads.js         # New provider
├── services/
│   └── search-service.js    # Update fallback chain
└── handlers/
    └── search-handler.js    # Add Goodreads-specific endpoint
```

**Implementation Steps:**
1. Create `src/providers/goodreads.js` with API client
2. Add Goodreads API key to `wrangler.toml` and secrets
3. Update `search-service.js` to include Goodreads in fallback chain
4. Add caching for Goodreads responses (24h TTL)
5. Create tests for Goodreads provider
6. Update `docs/API_README.md` with new provider info
7. Add monitoring for Goodreads API quota

**Risks:**
- Goodreads API rate limits (1000 req/day)
- Response format differences require new mapper
- Potential cost increase if caching not effective

## Example: Planning a Background Job System

```bash
mcp zen planner --feature "Add scheduled cover harvest job"
```

**Requirements:**
- Daily cron job to harvest ISBNdb covers (5000/day limit)
- Resume from last position if interrupted
- Progress tracking with WebSocket
- Cost optimization: spread across 24 hours

**Architecture:**
```
src/
├── services/
│   └── harvest-service.js    # New service
├── durable-objects/
│   └── harvest-state.js      # State persistence
└── cron/
    └── cover-harvest.js      # Cron trigger
```

**Implementation Steps:**
1. Create Durable Object for harvest state persistence
2. Implement harvest service with rate limiting (5000/day)
3. Add cron trigger in `wrangler.toml` (daily at 2 AM UTC)
4. Implement resume logic (store last processed ISBN)
5. Add WebSocket progress updates
6. Create admin dashboard endpoint to monitor progress
7. Add tests for harvest logic and state persistence
8. Document in `docs/COVER_HARVEST_SYSTEM.md`

**Cost Analysis:**
- Durable Object: ~$0.02/day (1 object, low requests)
- KV writes: ~$0.50/day (5000 writes)
- ISBNdb API: Included in Premium plan
- **Total:** ~$15-20/month

## Models to Use

- **Simple features (< 3 files):** Haiku (fast, cheap)
- **Complex features (3-10 files):** Sonnet 4.5 (best balance)
- **Major refactors via Zen MCP:** Grok 4 (cheapest external model, excellent for planning)
- **Alternative external model:** Gemini 2.5 Pro (more expensive, better for large context)
- **Architecture decisions:** Consensus with 2 models (use sparingly - expensive!)

## Planning Workflow

### Step 1: Initial Brainstorm
```bash
# Use Claude Code for quick brainstorm
"I want to add a new feature: [description]. Help me plan this."
```

### Step 2: Detailed Planning
```bash
# Use Zen MCP Planner for comprehensive plan
# Start with Grok (cheapest), escalate to Gemini only if needed
mcp zen planner \
  --feature "Feature name" \
  --thinking-mode medium \
  --model "grok-4"

# Use Gemini for large context or multi-modal needs:
# mcp zen planner \
#   --feature "Feature name" \
#   --thinking-mode medium \
#   --model "gemini-2.5-pro"
```

### Step 3: Architecture Review
```bash
# Get consensus on best approach (use sparingly - expensive!)
# Try single model first (Grok is cheapest):
mcp zen planner \
  --model "grok-4" \
  --prompt "Evaluate architecture options for [feature]..."

# Only use consensus for critical architectural decisions:
# mcp zen consensus \
#   --models "grok-4,gemini-2.5-pro" \
#   --prompt "Which architecture is better for [feature]? Option A: [desc] Option B: [desc]"
```

### Step 4: Create Issues
```bash
# Break plan into GitHub issues
gh issue create --title "Phase 1: [feature] - Core functionality" \
  --body "Implementation steps from plan..." \
  --label "type: feature,phase: X,effort: M"
```

## Feature Checklist

Before starting implementation:

- [ ] Requirements clearly defined
- [ ] API endpoints designed (routes, params, responses)
- [ ] Data flow documented
- [ ] External dependencies identified
- [ ] Caching strategy planned
- [ ] Error handling considered
- [ ] Testing approach defined
- [ ] Documentation plan created
- [ ] Cost analysis completed (if applicable)
- [ ] Timeline estimated (effort label)
- [ ] Risks identified and mitigated

## Integration with Existing System

### Check compatibility:
1. **Search providers:** Does this fit fallback chain?
2. **Caching:** Can we reuse existing KV cache?
3. **Rate limiting:** Does this need new limits?
4. **WebSocket:** Does this need progress tracking?
5. **CI/CD:** Do tests need updating?

### Avoid breaking changes:
- Keep existing API endpoints working
- Add new endpoints with version (e.g., `/v2/search`)
- Use feature flags for gradual rollout
- Plan data migration if schema changes

## Post-Planning

After planning, use:
- **Claude Code:** For implementation
- **Jules:** For PR review
- **Zen MCP:** For security/performance validation
