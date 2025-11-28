# Laptop-Safe Testing & Development

**Problem:** Node.js processes can overwhelm laptop CPU and memory during parallel testing, causing system lockups.

**Solution:** Resource-constrained test modes and optimized scripts.

---

## Quick Reference

### Safe Testing Commands

```bash
# SAFEST - Sequential tests with 512MB memory limit
npm run test:safe

# FAST - Smoke tests only (core functionality)
npm run test:smoke

# FOCUSED - Unit tests only (skip slow integration tests)
npm run test:unit

# QUICK VALIDATION - Smoke tests + lint
npm run validate
```

### When to Use Each Mode

| Command | Use Case | Speed | Resource Usage |
|---------|----------|-------|----------------|
| `npm run test:safe` | Full test suite on low-resource laptop | Slow (60s+) | **Low** - 512MB max, 1 fork |
| `npm run test:smoke` | Quick sanity check before commit | Fast (5s) | **Very Low** - minimal |
| `npm run test:unit` | Focus on business logic, skip integration | Medium (20s) | **Low** - 512MB, 2 forks |
| `npm run validate` | Pre-commit quick validation | Fast (10s) | **Very Low** |
| `npm test` | CI/CD or powerful machines only | Medium (30s) | **Medium** - 2 forks |

---

## Resource Limits Explained

### Memory Constraints

```bash
# Default (may cause crashes on 8GB laptops)
npm test  # No limit - can use 2GB+ per fork

# Safe mode (recommended for laptops)
npm run test:safe  # 512MB max via NODE_OPTIONS
```

**Why 512MB?**
- Vitest unit tests rarely need >256MB per process
- 512MB provides comfortable headroom
- Prevents system-wide memory exhaustion

### CPU Constraints

```bash
# Default (4 parallel forks - high CPU usage)
npm test  # maxForks: 2 (reduced from 4)

# Safe mode (sequential - lowest CPU)
npm run test:safe  # singleFork: true (1 process)
```

**Fork Configuration:**
- **Default:** 2 forks (reduced from 4 in vitest.config.js:57)
- **Safe mode:** 1 fork (sequential execution)
- **Smoke tests:** 1 fork (fast, minimal tests)

---

## Development Server Best Practices

### Wrangler Dev Server

```bash
# Start local dev server (single process, low overhead)
npm run dev

# Access at http://localhost:8787
```

**Resource Usage:**
- Single Node.js process (~100MB memory)
- Auto-reloads on file changes
- Safe for laptops - won't fork multiple processes

### Avoid Multiple Dev Servers

```bash
# ❌ BAD - Running multiple servers simultaneously
Terminal 1: npm run dev         # Backend on :8787
Terminal 2: cd frontend && npm start  # Frontend on :3000
Terminal 3: npm run test:watch  # Vitest UI on :5173

# Result: 3+ Node processes = potential lockup
```

**Solution:**
```bash
# ✅ GOOD - Run one at a time, or use test:safe instead of watch
Terminal 1: npm run dev         # Backend only
Terminal 2: npm run test:smoke  # Quick tests, then exit

# For frontend testing, stop backend first
Terminal 1: Ctrl+C (stop wrangler)
Terminal 2: cd frontend && npm start
```

---

## Monitoring Resource Usage

### macOS Activity Monitor

1. Open Activity Monitor (Cmd+Space → "Activity Monitor")
2. Sort by **CPU** or **Memory** tab
3. Watch for `node` processes exceeding:
   - **CPU:** >200% (indicates 2+ cores saturated)
   - **Memory:** >2GB total across all node processes

### Terminal Commands

```bash
# Check Node.js process count
ps aux | grep -i node | wc -l

# Monitor memory usage (macOS)
top -o MEM | grep node

# Kill runaway processes (EMERGENCY ONLY)
pkill -f node
```

---

## Troubleshooting

### Symptom: Laptop Fans Spinning at 100%

**Cause:** Too many parallel test forks or concurrent dev servers

**Fix:**
```bash
# Kill all Node processes
pkill -f node

# Restart with safe mode
npm run test:safe
```

### Symptom: System Freezing During Tests

**Cause:** Memory exhaustion from unlimited test forks

**Fix:**
1. Force quit Terminal (Cmd+Option+Esc)
2. Reopen Terminal
3. Use `npm run test:smoke` instead of `npm test`

### Symptom: Tests Running Forever

**Cause:** Orphaned processes or deadlocks

**Fix:**
```bash
# Check for orphaned Vitest processes
ps aux | grep vitest

# Kill specific process by PID
kill -9 <PID>

# Or kill all Vitest processes
pkill -f vitest
```

---

## Configuration Details

### vitest.config.js Changes

```javascript
// OLD (resource-intensive)
threads: true,
maxThreads: 4,
minThreads: 1

// NEW (laptop-friendly)
pool: 'forks',  // Better process isolation
poolOptions: {
  forks: {
    singleFork: false,
    maxForks: 2,  // Reduced from 4
    minForks: 1
  }
},
fileParallelism: process.env.TEST_SAFE_MODE === 'true' ? false : true
```

### package.json Script Breakdown

```json
{
  "test:safe": "TEST_SAFE_MODE=true NODE_OPTIONS='--max-old-space-size=512' vitest run --pool=forks --poolOptions.forks.singleFork=true",
  "test:smoke": "vitest run tests/smoke",
  "test:unit": "vitest run --exclude='tests/integration/**' --exclude='tests/e2e/**'"
}
```

**Flags explained:**
- `TEST_SAFE_MODE=true` → Disables file parallelism (sequential execution)
- `NODE_OPTIONS='--max-old-space-size=512'` → 512MB memory limit per process
- `--pool=forks` → Use process forks instead of threads
- `--poolOptions.forks.singleFork=true` → Force single process (no parallelism)

---

## Smoke Tests

Smoke tests are **fast, lightweight validation tests** that check core functionality without heavy integration:

**Location:** `tests/smoke/`

**Coverage:**
- ✅ Module imports (verify no syntax errors)
- ✅ Critical utilities (validation, formatting)
- ✅ Response format helpers
- ❌ External API calls (skip these)
- ❌ Database operations (skip these)
- ❌ Durable Objects (skip these)

**Run time:** <5 seconds (vs. 30+ seconds for full test suite)

**When to use:**
- Before every commit
- After dependency updates
- Quick sanity checks during development

---

## CI/CD vs Local Development

### GitHub Actions (CI/CD)
```yaml
# Uses default npm test (2 forks, no memory limit)
# Runs on 4-core machines with 16GB RAM
- run: npm test
```

### Local Laptop Development
```bash
# Use resource-constrained modes
npm run test:safe   # Full suite, low resources
npm run test:smoke  # Quick validation
```

**Why different?**
- CI/CD servers have dedicated resources
- Laptops share resources with OS, browser, IDE
- CI/CD runs once per push; local runs frequently

---

## Best Practices Summary

1. **Use `npm run test:smoke`** for quick validation (default workflow)
2. **Use `npm run test:safe`** for full test suite on laptops
3. **Use `npm test`** only on powerful machines or CI/CD
4. **Close resource-intensive apps** before running tests (browsers, IDEs)
5. **Run one dev server at a time** (backend OR frontend, not both)
6. **Monitor Activity Monitor** if system feels sluggish
7. **Kill orphaned processes** with `pkill -f node` if needed

---

## Hardware Recommendations

### Minimum Specs (Safe Mode Required)
- **RAM:** 8GB
- **CPU:** Dual-core
- **Commands:** `npm run test:safe`, `npm run test:smoke` only

### Recommended Specs (Full Test Suite)
- **RAM:** 16GB+
- **CPU:** Quad-core+
- **Commands:** All commands safe, including `npm test`

### Optimal Specs (No Constraints)
- **RAM:** 32GB+
- **CPU:** 8-core+
- **Commands:** Parallel test execution with `maxForks: 4` or higher

---

## Related Documentation

- **Vitest Config:** `/vitest.config.js` (pool and fork settings)
- **Package Scripts:** `/package.json` (npm run commands)
- **CI/CD Config:** `/.github/workflows/test.yml` (GitHub Actions)

---

**Last Updated:** November 28, 2025
**Maintained By:** BooksTrack Team
