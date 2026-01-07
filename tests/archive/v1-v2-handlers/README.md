# Archived V1/V2 Handler Tests

**Archived:** January 7, 2026
**Reason:** These tests reference removed V1/V2 handler files that were migrated to V3 API structure.

## Archived Tests

### CSV Import Handler Tests
- `csv-import.test.js` (handlers/) - Old handler pattern, now in `/v3/jobs/imports`
- `csv-import.test.js` (e2e/) - Old import flow, superseded by V3 workflow tests
- Root `csv-import.test.js` was updated to test V3 API and remains active

### Batch Enrichment Handler Tests
- `batch-enrichment.test.js` (handlers/) - Old handler pattern, now in `/v3/jobs/enrichment`

### Durable Object Tests
- `durable-object-alarm.test.js` - Tests for `progress-socket.js` DO (renamed to `websocket-connection.ts`)

### Utility Tests
- `r2-hibernation.test.js` - Tests for removed R2 hibernation feature
- `validators.test.js` import issue - Fixed to use correct path `src/utils/transform/normalization.ts`

## Migration Status

| Old File | New Location | Status |
|----------|-------------|--------|
| `src/handlers/csv-import.js` | `src/api-v3/jobs/imports.ts` | ✅ Migrated |
| `src/handlers/batch-enrichment.js` | `src/api-v3/jobs/enrichment.ts` | ✅ Migrated |
| `src/durable-objects/progress-socket.js` | `src/durable-objects/websocket-connection.ts` | ✅ Migrated |
| `src/utils/r2-hibernation.ts` | N/A (feature removed) | ❌ Removed |

## Active V3 Tests

These tests remain active and test the V3 API equivalents:
- `tests/csv-import.test.js` (root) - Tests `/v3/jobs/imports` endpoint
- `tests/api-v3/` - V3 API integration tests
- `tests/workers/durable-objects/websocket-connection-do.test.js` - Modern WebSocket DO tests

## Resurrection Guide

If you need to restore these tests for V3 API migration:
1. Update imports to V3 API structure (`src/api-v3/jobs/`)
2. Update handler patterns to Hono OpenAPI route handlers
3. Update DO references to modern naming (`websocket-connection` vs `progress-socket`)
4. Move to appropriate test directory (`tests/api-v3/` or `tests/integration/`)

