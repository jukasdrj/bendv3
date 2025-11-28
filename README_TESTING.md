# Testing Guide - Preventing System Lockups

**TL;DR:** Use `npm run test:smoke` for quick validation (5s), `npm run test:safe` for full tests on laptops (60s).

---

## Problem Solved

Your laptop was crashing from Node.js processes overwhelming CPU and memory during testing. This has been fixed with:

1. **Reduced parallel execution** - Down from 4 to 2 forks (vitest.config.js:57)
2. **Memory-limited modes** - 512MB cap for safe mode
3. **Sequential fallback** - Single-process mode for low-resource testing
4. **Fast smoke tests** - 8 lightweight tests in <5 seconds

---

## Quick Commands

```bash
# ✅ RECOMMENDED - Fast sanity check (use this most often)
npm run test:smoke      # 8 tests, ~5 seconds, minimal resources

# ✅ SAFE - Full test suite with constraints
npm run test:safe       # All tests, sequential, 512MB limit

# ✅ FOCUSED - Unit tests only (skip integration)
npm run test:unit       # Skip slow integration tests

# ✅ PRE-COMMIT - Quick validation
npm run validate        # Smoke tests + lint

# ⚠️ USE CAREFULLY - May cause high resource usage on 8GB laptops
npm test                # Default mode, 2 forks, no memory limit
npm run test:coverage   # Coverage analysis (memory-intensive)
```

---

## Test Modes Comparison

| Command | Tests Run | Duration | Memory | CPU | Use Case |
|---------|-----------|----------|--------|-----|----------|
| `test:smoke` | 8 | ~5s | <100MB | Low | Quick sanity check |
| `test:unit` | ~500 | ~20s | 512MB | Medium | Focus on business logic |
| `test:safe` | ~900+ | ~60s | 512MB | Low | Full suite, laptop-safe |
| `test` | ~900+ | ~30s | 2GB+ | High | CI/CD or powerful machines |

---

## What Changed

### 1. vitest.config.js
- **Before:** `threads: true, maxThreads: 4` (high parallelism)
- **After:** `pool: 'forks', maxForks: 2` (lower parallelism, better isolation)
- **Safe mode:** Sequential execution via `TEST_SAFE_MODE=true`

### 2. package.json Scripts
```json
{
  "test:safe": "TEST_SAFE_MODE=true NODE_OPTIONS='--max-old-space-size=512' vitest run --pool=forks --poolOptions.forks.singleFork=true",
  "test:smoke": "vitest run tests/smoke",
  "test:unit": "vitest run --exclude='tests/integration/**' --exclude='tests/e2e/**'",
  "validate": "npm run test:smoke && npm run lint:check"
}
```

### 3. New Smoke Tests
- **Location:** `tests/smoke/`
- **Coverage:** Core imports, ISBN validation, utilities
- **Speed:** <5 seconds (vs. 30+ for full suite)
- **Tests:** 8 passing

---

## Development Workflow

### Daily Development
```bash
# Start dev server
npm run dev

# Make code changes...

# Quick validation (before commit)
npm run test:smoke

# Or use full safe mode
npm run test:safe
```

### Before Committing
```bash
# Quick validation
npm run validate

# Or full test suite (if you have time)
npm run test:safe
```

### CI/CD (GitHub Actions)
```bash
# CI uses default mode (more resources available)
npm test
```

---

## Emergency Recovery

### If System Freezes
1. Force quit Terminal: `Cmd + Option + Esc`
2. Select Terminal, click "Force Quit"
3. Reopen Terminal
4. Kill orphaned processes: `pkill -f node`
5. Restart with safe mode: `npm run test:safe`

### Monitor Resource Usage
```bash
# macOS Activity Monitor
Cmd + Space → "Activity Monitor"

# Sort by CPU or Memory
# Watch for node processes >200% CPU or >2GB RAM
```

---

## Best Practices

### ✅ DO
- Use `npm run test:smoke` for quick validation
- Run `npm run test:safe` on laptops for full coverage
- Close resource-intensive apps before testing
- Monitor Activity Monitor if system feels slow
- Run one dev server at a time

### ❌ DON'T
- Run `npm test` on 8GB laptops (use `test:safe` instead)
- Run multiple dev servers simultaneously
- Leave `test:watch` running for hours
- Run coverage analysis frequently (it's memory-intensive)

---

## Documentation

- **Full Guide:** `docs/LAPTOP_TESTING.md`
- **Cheat Sheet:** `.laptop-testing-cheatsheet.txt`
- **Vitest Config:** `vitest.config.js`

---

## Hardware Recommendations

### Your Current Setup (Needs Safe Mode)
- **RAM:** 8GB
- **Commands:** `npm run test:safe`, `npm run test:smoke` only
- **Avoid:** `npm test`, `npm run test:coverage`

### Recommended for Full Test Suite
- **RAM:** 16GB+
- **CPU:** Quad-core+
- **Commands:** All modes safe, including `npm test`

---

**Created:** November 28, 2025
**Last Updated:** November 28, 2025
