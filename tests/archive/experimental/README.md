# Experimental and Internal Feature Tests

Tests in this directory cover experimental features, internal implementation details, or features under development that don't have stable APIs yet.

## Characteristics

- **Internal APIs** - Tests for implementation details subject to change
- **Experimental features** - Features in development or with uncertain status
- **Performance testing** - Benchmarks and performance analysis
- **Implementation-specific** - Tightly coupled to current architecture

## Files

### ai-scanner-metadata.test.js
- **Archived:** January 7, 2026
- **What it tests:** AI scanner metadata tracking (e.g., model name in completion results)
- **Purpose:** Verify AI model information included in scan metadata
- **Implementation:** `src/services/ai-scanner.ts`
- **Status:** Experimental, internal detail testing
- **Production impact:** Low - metadata is internal to job results
- **When to restore:** During AI scanner metadata feature development
- **Note:** Tests internal implementation; consider if this level of detail needs testing

### author-search-performance.test.js
- **Archived:** January 7, 2026
- **What it tests:** Performance metrics for author search operations
- **Purpose:** Measure author search latency and throughput
- **Related code:** `src/handlers/author-search.ts`
- **Status:** Performance testing, not production requirement
- **When to restore:** During author search optimization sprints
- **Note:** Ad-hoc performance benchmark, not automated

### cache-key-factory.test.js
- **Archived:** January 7, 2026
- **What it tests:** Cache key generation patterns
- **Purpose:** Verify consistent cache key formatting
- **Related code:** `src/utils/cache/cache-key-factory.ts`
- **Status:** Implementation detail testing
- **Production impact:** Low - cache keys are internal
- **When to restore:** When refactoring cache key strategy
- **Note:** Tests internal utility, consider if worth maintaining

### popular-books-config.test.js
- **Archived:** January 7, 2026
- **What it tests:** Configuration for popular books feature
- **Purpose:** Verify popular books config loading and validation
- **Implementation:** Internal configuration
- **Status:** Feature-specific, may change with feature
- **When to restore:** During popular books feature modifications
- **Note:** Configuration testing often better handled as integration tests

### gemini-csv-provider.test.js
- **Archived:** January 7, 2026
- **What it tests:** CSV parsing using Gemini provider
- **Purpose:** Verify Gemini-based CSV parsing and data extraction
- **Related code:** `src/providers/gemini-csv-provider.ts`
- **Status:** Provider testing, coverage available in integration tests
- **Modern approach:** Test CSV parsing as part of import workflow integration tests
- **When to restore:** If provider testing becomes critical
- **Note:** Provider behavior better tested through integration workflows

### analytics-queries.test.js
- **Archived:** January 7, 2026
- **What it tests:** Analytics Engine query interface
- **Purpose:** Test analytics query functionality
- **Key finding:** Test documents that Analytics Engine is write-only in Workers
- **Status:** Demonstrates limitation, not a failure
- **Current approach:** Analytics Engine queries not available in Workers runtime
- **When to restore:** If switching to GraphQL API or KV-based tracking
- **Note:** Documents architectural constraint, consider keeping as reference

### metrics-aggregator.test.js
- **Archived:** January 7, 2026
- **What it tests:** Internal metrics aggregation logic
- **Purpose:** Verify metrics are correctly aggregated
- **Related code:** `src/services/metrics-aggregator.ts`
- **Status:** Implementation detail, covered in unit tests
- **Modern approach:** Test metrics through integration tests
- **When to restore:** If refactoring metrics aggregation
- **Note:** Low-level implementation detail

### parallel-enrichment.test.js
- **Archived:** January 7, 2026
- **What it tests:** Parallel book enrichment operations
- **Purpose:** Verify books enriched correctly in parallel
- **Related code:** `src/services/parallel-enrichment.ts`
- **Status:** Functionality rolled into main enrichment service
- **Modern approach:** `tests/unit/v3-batch-enrichment.test.ts` covers this
- **When to restore:** If parallel enrichment becomes separate feature again
- **Note:** Functionality merged into main enrichment

## Guidelines for Experimental Tests

### When to Archive
- Feature is in development and API is unstable
- Test is tightly coupled to internal implementation
- Test has low value relative to maintenance burden
- Same functionality tested at integration level
- Performance baseline is ad-hoc, not continuous

### When to Keep as Active
- Feature is stable and part of public API
- Test catches real user-facing issues
- Test provides unique coverage not duplicated elsewhere
- Architecture constraint worth documenting

### When to Resurrect
- Feature becomes stable and API finalized
- Need to optimize performance (restore performance test)
- Refactoring requires detailed unit-level testing
- Implementation detail becomes part of public contract

## Best Practices

1. **Integration-first** - Test features through their public API
2. **Avoid internal testing** - Don't test implementation details
3. **Document constraints** - If documenting an architectural limitation, note it
4. **Performance baselines** - Keep performance tests separate from unit tests
5. **Review regularly** - Quarterly assess if experiments should graduate or be removed

## Relationship to Main Test Suite

These tests are separated because:

1. **Instability** - Experimental features change frequently
2. **Maintenance burden** - Internal tests break with refactoring
3. **Low signal** - Performance tests aren't continuous
4. **Documentation** - Better as reference than active tests

## Archive Statistics

**Experimental Tests:** 8 files
- Internal implementation tests: 5 files
- Performance baselines: 2 files
- Architectural constraint docs: 1 file
