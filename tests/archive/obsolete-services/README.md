# Obsolete Services Tests

Tests in this directory reference services or handlers that have been removed from the codebase.

## Files

### kv-cache.test.js
- **Archived:** January 7, 2026
- **Reason:** References non-existent `src/services/kv-cache.js`
- **What it tested:** KV cache read/write operations
- **Modern Alternative:**
  - `tests/unit/unified-cache.test.js` - Unified cache service
  - `UnifiedCacheService` in `src/services/unified-cache.ts`
- **Why archived:** Functionality migrated to `UnifiedCacheService` which handles both KV and D1 seamlessly
- **To resurrect:**
  1. Restore file: `git mv tests/archive/obsolete-services/kv-cache.test.js tests/`
  2. Fix imports to use `UnifiedCacheService`
  3. Update test expectations based on new API

### warming-upload.test.js
- **Archived:** January 7, 2026
- **Reason:** References non-existent `src/handlers/warming-upload.js`
- **What it tested:** Cache warming upload handler
- **Modern Alternative:**
  - `tests/unit/cache-warming-integration.test.js` (if applicable)
  - Check `src/handlers/` for current warming handler implementation
- **Why archived:** Handler was either consolidated into another handler or its functionality is now tested elsewhere
- **To resurrect:**
  1. Restore file: `git mv tests/archive/obsolete-services/warming-upload.test.js tests/`
  2. Verify handler still exists in `src/handlers/`
  3. Update imports and verify test runs

## Strategy for Obsolete Services

When a service is removed:

1. **Move test to archive** - Don't delete, preserve for history
2. **Document in README** - Explain why archived and modern alternative
3. **Update main README** - Reference archive in test documentation
4. **Check for duplicates** - Verify functionality isn't tested elsewhere
5. **Plan migration** - If service is re-implemented, either restore or merge test

## Future Cleanup

These tests may be permanently deleted if:
- The service is not re-implemented within 6 months
- The functionality is fully covered by newer tests
- Migration to modern API is confirmed working
