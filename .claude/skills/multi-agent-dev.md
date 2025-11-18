---
name: multi-agent-dev
description: Coordinates PM (Sonnet 4.5) → Dev (Haiku) → Review (Grok-4) workflow for structured development
---

# Multi-Agent Development Coordination

## Skill Purpose
This skill coordinates a three-agent development workflow where **Sonnet 4.5** (you) drives product management and orchestration, **Haiku** handles rapid implementation, and **Grok-4** performs comprehensive code review. Use this skill for structured feature development, bug fixes, and refactoring tasks that benefit from specialized agent roles.

## When to Use This Skill
Trigger this skill when the user:
- Explicitly mentions "subagent workflow" or "multi-agent"
- Requests feature implementation with "use Haiku to code"
- Asks for code review with "have Grok-4 review"
- Wants a structured PM → Dev → Review cycle
- Is working on substantial code changes requiring quality gates

## Agent Roles & Capabilities

### Sonnet 4.5 (Primary Orchestrator - YOU)
**Core Responsibilities:**
- Product management: requirement gathering, scope definition, acceptance criteria
- Architecture decisions: technology selection, design patterns, trade-off analysis
- Task decomposition: breaking complex requests into atomic, testable units
- Quality assurance: validating outputs against specifications before user delivery
- Context management: maintaining conversation state and ensuring complete agent context
- Integration oversight: coordinating handoffs, resolving conflicts, final assembly

**Strategic Approach:**
- Always clarify ambiguous requirements before delegating
- Provide complete context to subagents (files, constraints, success criteria)
- Validate subagent outputs against original requirements
- Make architectural decisions rather than delegating them
- Maintain the "big picture" while agents handle execution

### Haiku (Implementation Specialist)
**Core Responsibilities:**
- Rapid code generation from well-defined specifications
- Feature implementation following established patterns
- Bug fixes with clear reproduction steps
- Test coverage for new functionality
- Basic inline documentation and comments
- Performance-optimized implementations

**Delegation Best Practices:**
- Use `mcp__zen__chat` tool with `model="haiku"`
- Provide absolute file paths in `absolute_file_paths` parameter
- Include clear acceptance criteria in the prompt
- Specify coding standards and patterns to follow
- Set `temperature=0` for deterministic code generation
- Use `continuation_id` to maintain context across multiple tasks

**Example Invocation:**
```javascript
mcp__zen__chat({
  model: "haiku",
  prompt: "Implement a function to parse ISO date strings into Date objects. Requirements: handle timezone offsets, throw clear errors for invalid formats, include JSDoc. Follow the patterns in utils/dateHelpers.ts",
  absolute_file_paths: ["/path/to/utils/dateHelpers.ts"],
  working_directory_absolute_path: "/path/to/project",
  temperature: 0,
  thinking_mode: "medium"
})
```

### Grok-4 (Quality & Security Reviewer)
**Core Responsibilities:**
- Comprehensive code review across quality, security, performance, architecture
- Vulnerability identification and exploit analysis
- Code smell detection and refactoring recommendations
- Performance profiling and optimization opportunities
- Standards compliance validation
- Actionable feedback with severity levels (critical/high/medium/low)

**Delegation Best Practices:**
- Use `mcp__zen__codereview` tool with `model="grok-4"`
- Provide all relevant files in `relevant_files` parameter (absolute paths)
- Set `review_type` based on change scope:
  - `full`: comprehensive analysis (new features, major refactors)
  - `security`: focused security audit (auth, validation, crypto)
  - `performance`: optimization analysis (algorithms, bottlenecks)
  - `quick`: rapid review (small bug fixes, style changes)
- Set `review_validation_type="external"` for expert follow-up
- Use `severity_filter` to focus on critical issues first
- Always provide coding standards in `standards` parameter if available

**Example Invocation:**
```javascript
mcp__zen__codereview({
  model: "grok-4",
  step: "Review the date parsing implementation for security vulnerabilities, edge cases, and performance issues. Check for proper error handling and input validation.",
  findings: "",
  relevant_files: ["/path/to/utils/dateHelpers.ts", "/path/to/utils/dateHelpers.test.ts"],
  review_type: "full",
  review_validation_type: "external",
  step_number: 1,
  total_steps: 2,
  next_step_required: true,
  standards: "Follow Airbnb JavaScript style guide. Prefer functional patterns. Always handle errors explicitly."
})
```

## Standard Workflow Pattern

### Phase 1: Discovery & Decomposition (Sonnet)
1. **Clarify Requirements**
   - Identify ambiguities in user request
   - Ask targeted questions before delegating
   - Define explicit success criteria
   - Determine which agents are needed

2. **Scope Analysis**
   - Assess complexity and effort
   - Identify dependencies and constraints
   - Break down into atomic, testable units
   - Prioritize tasks by risk and dependencies

3. **Context Gathering**
   - Identify relevant files using filesystem tools
   - Read existing code to understand patterns
   - Document current state and desired state
   - Note any technical debt or constraints

### Phase 2: Implementation (Haiku)
1. **Delegate with Complete Context**
   - Provide clear, specific instructions
   - Include all relevant file paths
   - Specify patterns and standards to follow
   - Set explicit acceptance criteria

2. **Iterative Development**
   - Use `continuation_id` to maintain context
   - Review Haiku's output for completeness
   - Request refinements if needed
   - Ensure test coverage is included

3. **Pre-Review Validation**
   - Verify output matches specifications
   - Check for obvious issues before review
   - Ensure all files are included
   - Confirm tests pass locally if possible

### Phase 3: Quality Review (Grok-4)
1. **Comprehensive Analysis**
   - Submit all changed files for review
   - Include relevant context files
   - Set appropriate review_type
   - Specify focus areas if needed

2. **Issue Triage**
   - Categorize findings by severity
   - Prioritize critical and high issues
   - Assess medium/low issues for quick wins
   - Document technical debt for future work

3. **Remediation**
   - Address critical/high severity issues immediately
   - Delegate fixes back to Haiku if substantial
   - Make minor fixes directly if simple
   - Re-review after major changes

### Phase 4: Integration & Delivery (Sonnet)
1. **Final Validation**
   - Verify all requirements met
   - Confirm all review issues addressed
   - Check documentation is updated
   - Ensure tests cover new functionality

2. **User Communication**
   - Summarize what was implemented
   - Highlight key decisions made
   - Note any trade-offs or limitations
   - Provide next steps or recommendations

3. **Cleanup**
   - Move files to outputs directory if needed
   - Ensure working directory is clean
   - Document any pending work
   - Archive conversation context if complex

## Decision Matrix: When to Use Which Agent

### Use Haiku When:
- Requirements are crystal clear and unambiguous
- Task is implementation-focused with known patterns
- Speed matters more than deep architectural thinking
- You need code generation, not strategic decisions
- Tests can be written following existing patterns

### Use Grok-4 When:
- Security is a concern (auth, validation, crypto, etc.)
- Performance is critical (algorithms, optimization)
- Code is complex or has subtle edge cases
- Multiple architectural approaches are possible
- You need expert validation of decisions

### Use Sonnet (You) When:
- Requirements are ambiguous or incomplete
- Architectural decisions need to be made
- Trade-offs require product judgment
- Integration across multiple components is needed
- User communication requires nuance

## Anti-Patterns to Avoid

❌ **Don't Delegate Ambiguity**
- Never send vague requirements to Haiku
- Always clarify with user first, then delegate

❌ **Don't Skip Context**
- Always provide relevant file paths
- Include coding standards and patterns
- Specify success criteria explicitly

❌ **Don't Review Before Implementation**
- Grok-4 reviews code, not specifications
- Complete implementation first, then review

❌ **Don't Delegate Architecture**
- You make architectural decisions
- Haiku implements your decisions
- Grok-4 validates your decisions

❌ **Don't Ignore Review Findings**
- Address critical/high issues before delivery
- Document why medium/low issues are deferred
- Re-review after significant changes

❌ **Don't Forget Continuation IDs**
- Reuse continuation_id for related tasks
- Maintains context and conversation history
- Prevents redundant explanations

## Quality Gates & Exit Criteria

### Before Delegating to Haiku:
✓ Requirements are specific and unambiguous
✓ Success criteria are explicitly defined
✓ Relevant files are identified
✓ Coding patterns are specified
✓ You know what "done" looks like

### Before Delegating to Grok-4:
✓ Implementation is complete
✓ All files are saved and accessible
✓ Basic validation has passed
✓ You've done a quick sanity check
✓ Review scope is clearly defined

### Before Delivering to User:
✓ All requirements have been met
✓ Critical/high review issues addressed
✓ Tests are passing
✓ Documentation is updated
✓ Code follows project standards

## Example Workflow: Feature Implementation

**User Request:** "Add pagination to the user list endpoint"

### Step 1: Discovery (Sonnet)
```
1. Read current endpoint implementation
2. Check for existing pagination patterns in codebase
3. Identify database query layer
4. Define requirements:
   - Query params: page, limit
   - Response format: { data: [], total: number, page: number }
   - Default limit: 20, max limit: 100
```

### Step 2: Implementation (Haiku)
```javascript
mcp__zen__chat({
  model: "haiku",
  prompt: "Add pagination to GET /api/users endpoint. Requirements:
  - Accept query params: page (default 1), limit (default 20, max 100)
  - Return: { data: User[], total: number, page: number, limit: number }
  - Use existing UserRepository.findMany() method
  - Add input validation with Zod
  - Follow patterns in PostController.ts
  - Include JSDoc
  - Write tests following existing controller test patterns",
  absolute_file_paths: [
    "/project/src/controllers/UserController.ts",
    "/project/src/controllers/PostController.ts",
    "/project/src/repositories/UserRepository.ts"
  ],
  working_directory_absolute_path: "/project",
  temperature: 0
})
```

### Step 3: Review (Grok-4)
```javascript
mcp__zen__codereview({
  model: "grok-4",
  step: "Review pagination implementation for security (SQL injection, DOS via large limits), performance (query optimization), and correctness (off-by-one errors, edge cases).",
  findings: "",
  relevant_files: [
    "/project/src/controllers/UserController.ts",
    "/project/src/repositories/UserRepository.ts",
    "/project/tests/controllers/UserController.test.ts"
  ],
  review_type: "full",
  step_number: 1,
  total_steps: 2,
  next_step_required: true
})
```

### Step 4: Integration (Sonnet)
```
1. Review Grok-4 findings
2. Address critical issues (e.g., missing max limit enforcement)
3. Validate against original requirements
4. Confirm tests cover edge cases
5. Update API documentation
6. Deliver to user with summary
```

## Common Scenarios

### Scenario: Bug Fix
1. **Sonnet**: Reproduce bug, identify root cause, define fix
2. **Haiku**: Implement fix with regression test
3. **Grok-4**: Quick review focusing on edge cases
4. **Sonnet**: Validate fix, deploy

### Scenario: New Feature
1. **Sonnet**: Requirements gathering, architecture design, task breakdown
2. **Haiku**: Implement feature incrementally
3. **Grok-4**: Full review with security/performance focus
4. **Sonnet**: Integration, documentation, delivery

### Scenario: Refactoring
1. **Sonnet**: Identify code smells, define refactoring goals
2. **Grok-4**: Analyze current code for issues (use `mcp__zen__refactor`)
3. **Haiku**: Implement refactoring following expert recommendations
4. **Grok-4**: Review refactored code
5. **Sonnet**: Validate behavior unchanged, update docs

### Scenario: Security Audit
1. **Sonnet**: Define audit scope, identify critical paths
2. **Grok-4**: Security-focused review (use `mcp__zen__secaudit`)
3. **Haiku**: Implement fixes for vulnerabilities
4. **Grok-4**: Re-audit after fixes
5. **Sonnet**: Document findings, create remediation plan

## Troubleshooting

**Issue**: Haiku produces code that doesn't match requirements
- **Solution**: Clarify requirements more explicitly, provide better examples, use continuation_id to iterate

**Issue**: Grok-4 review is too surface-level
- **Solution**: Use more specific review prompts, increase total_steps, provide better context in findings

**Issue**: Workflow feels slow or over-engineered
- **Solution**: Use this skill for complex tasks only, handle simple changes directly

**Issue**: Context is lost between agent calls
- **Solution**: Always use continuation_id, include relevant_files, summarize state in prompts

**Issue**: Agents give conflicting recommendations
- **Solution**: You (Sonnet) make the final call, document trade-offs, communicate decision clearly

## Success Metrics

You're using this skill effectively when:
- Implementations match requirements on first try
- Review findings are addressed before user delivery
- You're making architectural decisions, not delegating them
- Workflow feels smooth without excessive back-and-forth
- User receives high-quality, reviewed code consistently

## Adaptation Guidelines

This skill should evolve based on your experience:
- Add new patterns as you discover them
- Document common pitfalls and solutions
- Refine prompts based on agent responses
- Adjust quality gates based on project needs
- Share learnings back to improve this skill

---

**Version**: 1.0
**Last Updated**: 2025-11-18
**Maintained By**: Justin (user)
**Project**: BooksTrack Backend (Cloudflare Workers)
