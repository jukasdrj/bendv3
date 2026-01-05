# Implementation Plan: Alexandria Type-Safe Client

**Date**: January 3, 2026
**Status**: Planning
**Related Issue**: Alexandria #90

## Goal

Set up type-safe Alexandria client using Hono RPC (`hc`) and implement contract testing to ensure API compatibility between bendv3 and Alexandria.

## Context

- bendv3 is a Cloudflare Worker (API gateway for bookstrack application)
- Built with `@hono/zod-openapi`, TypeScript
- Already has `"alexandria-worker": "^2.1.0"` in dependencies
- Has `openapi-diff` in devDependencies for spec comparison
- Structure: `src/api-v3/`, `src/handlers/`, `src/routes/`, `src/providers/`

## Analysis Summary

The current `alexandria-worker` v2.1.0 does not correctly export `AlexandriaAppType`. However, Alexandria v2.2.0+ will have the correct exports and the required endpoints (`batch-direct`, `enrich-bibliography`).

## Critical Endpoints to Test

- `GET /api/search` - ISBN, title, author search
- `POST /api/enrich/batch-direct` - Bulk metadata enrichment
- `GET /covers/:isbn/:size` - Cover image serving
- `POST /api/authors/enrich-bibliography` - Author bibliography expansion

## Implementation Steps

### 1. Dependency Upgrade

**Prerequisites**: Alexandria must publish v2.2.1 with correct type exports.

**Action**:
```bash
cd ~/dev_repos/bendv3
npm install alexandria-worker@2.2.1
```

**Alternative** (for development):
```bash
# Link local Alexandria package
cd ~/dev_repos/alex/worker
npm link

cd ~/dev_repos/bendv3
npm link alexandria-worker
```

### 2. Type Definitions

Create `src/types/alexandria-types.ts` to import and re-export Alexandria types.

**File**: `src/types/alexandria-types.ts`
```typescript
/**
 * Alexandria API client types
 * Re-exports from alexandria-worker package for centralized type management
 */
export type { AlexandriaAppType } from 'alexandria-worker';

// Additional Alexandria-specific types
export interface AlexandriaConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

export interface AlexandriaClientOptions {
  config: AlexandriaConfig;
  env: Env;
}
```

### 3. Provider Implementation

Create `src/providers/alexandria-provider.ts` to encapsulate Hono RPC client logic, replacing the legacy fetch-based approach.

**File**: `src/providers/alexandria-provider.ts`
```typescript
import { hc } from 'hono/client';
import type { AlexandriaAppType, AlexandriaClientOptions } from '../types/alexandria-types.js';

/**
 * Type-safe Alexandria API client using Hono RPC
 *
 * Benefits:
 * - Compile-time type safety
 * - Full autocomplete for endpoints
 * - Automatic validation of requests/responses
 */
export class AlexandriaProvider {
  private client: ReturnType<typeof hc<AlexandriaAppType>>;
  private config: AlexandriaConfig;

  constructor(options: AlexandriaClientOptions) {
    this.config = options.config;
    this.client = hc<AlexandriaAppType>(this.config.baseUrl);
  }

  /**
   * Search for books by ISBN, title, or author
   */
  async search(params: { isbn?: string; title?: string; author?: string; limit?: number; offset?: number }) {
    const response = await this.client.api.search.$get({ query: params });

    if (!response.ok) {
      throw new Error(`Alexandria search failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Batch enrich ISBNs (up to 1000 per call)
   */
  async batchEnrich(isbns: string[], source: string = 'bendv3') {
    const response = await this.client.api.enrich['batch-direct'].$post({
      json: { isbns, source }
    });

    if (!response.ok) {
      throw new Error(`Alexandria batch enrichment failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get cover image URL for ISBN
   */
  getCoverUrl(isbn: string, size: 'large' | 'medium' | 'small' = 'medium'): string {
    return `${this.config.baseUrl}/covers/${isbn}/${size}`;
  }

  /**
   * Enrich author bibliography from ISBNdb
   */
  async enrichAuthorBibliography(authorName: string, options?: { maxPages?: number; pageSize?: number }) {
    const response = await this.client.api.authors['enrich-bibliography'].$post({
      json: {
        author_name: authorName,
        max_pages: options?.maxPages,
        page_size: options?.pageSize
      }
    });

    if (!response.ok) {
      throw new Error(`Alexandria author enrichment failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Health check
   */
  async healthCheck() {
    const response = await this.client.health.$get();
    return response.ok;
  }
}

/**
 * Factory function for creating Alexandria provider
 */
export function createAlexandriaProvider(baseUrl: string, env: Env): AlexandriaProvider {
  return new AlexandriaProvider({
    config: {
      baseUrl,
      timeout: 30000,
      retries: 3
    },
    env
  });
}
```

**Migration from legacy `alexandria-api.ts`**:
- Replace fetch-based calls with provider methods
- Update imports across codebase
- Remove old `alexandria-api.ts` file

### 4. Contract Testing

Create `tests/integration/alexandria-contract.test.ts` to verify the RPC client against the actual worker.

**File**: `tests/integration/alexandria-contract.test.ts`
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createAlexandriaProvider } from '../../src/providers/alexandria-provider.js';
import type { Env } from '../../src/types/env.js';

describe('Alexandria Contract Tests', () => {
  let provider: AlexandriaProvider;
  const mockEnv = {} as Env; // Mock environment for testing

  beforeAll(() => {
    const baseUrl = process.env.ALEXANDRIA_URL || 'http://localhost:8787';
    provider = createAlexandriaProvider(baseUrl, mockEnv);
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const isHealthy = await provider.healthCheck();
      expect(isHealthy).toBe(true);
    });
  });

  describe('Search Endpoint', () => {
    it('should search by ISBN', async () => {
      const result = await provider.search({ isbn: '9780439064873' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.total).toBeGreaterThan(0);
    });

    it('should search by title', async () => {
      const result = await provider.search({ title: 'Harry Potter', limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeGreaterThan(0);
    });

    it('should search by author', async () => {
      const result = await provider.search({ author: 'Rowling', limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Enrichment', () => {
    it('should enrich multiple ISBNs', async () => {
      const isbns = ['9780439064873', '9781492666868'];
      const result = await provider.batchEnrich(isbns, 'test');

      expect(result.success).toBe(true);
      expect(result.data.processed).toBeGreaterThan(0);
    });

    it('should handle empty ISBN list', async () => {
      const result = await provider.batchEnrich([], 'test');

      expect(result.success).toBe(true);
      expect(result.data.processed).toBe(0);
    });
  });

  describe('Cover Images', () => {
    it('should generate valid cover URLs', () => {
      const url = provider.getCoverUrl('9780439064873', 'large');

      expect(url).toContain('/covers/9780439064873/large');
    });
  });

  describe('Author Bibliography', () => {
    it('should enrich author bibliography', async () => {
      const result = await provider.enrichAuthorBibliography('Brandon Sanderson', {
        maxPages: 1,
        pageSize: 20
      });

      expect(result.success).toBe(true);
      expect(result.data.author).toBe('Brandon Sanderson');
      expect(result.data.books_found).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid ISBN gracefully', async () => {
      await expect(
        provider.search({ isbn: 'invalid' })
      ).rejects.toThrow();
    });
  });

  describe('Schema Validation', () => {
    it('should match expected response schema', async () => {
      const result = await provider.search({ isbn: '9780439064873' });

      // Validate response structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(typeof result.success).toBe('boolean');
    });
  });
});
```

**Run tests**:
```bash
npm test tests/integration/alexandria-contract.test.ts
```

### 5. Integration into bendv3

Update existing handlers to use the new provider.

**Example** (`src/handlers/book-handler.ts`):
```typescript
import { createAlexandriaProvider } from '../providers/alexandria-provider.js';

export async function handleBookSearch(c: Context) {
  const alexandria = createAlexandriaProvider(
    'https://alexandria.ooheynerds.com',
    c.env
  );

  const { isbn } = c.req.query();

  try {
    const result = await alexandria.search({ isbn });
    return c.json(result);
  } catch (error) {
    // Graceful degradation
    return c.json({ success: false, error: 'Alexandria unavailable' }, 503);
  }
}
```

### 6. CI/CD Integration

Add contract tests to CI pipeline.

**File**: `.github/workflows/contract-tests.yml`
```yaml
name: Alexandria Contract Tests

on:
  pull_request:
    paths:
      - 'src/providers/alexandria-provider.ts'
      - 'tests/integration/alexandria-contract.test.ts'
  schedule:
    - cron: '0 */6 * * *' # Every 6 hours

jobs:
  contract-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run contract tests
        run: npm test tests/integration/alexandria-contract.test.ts
        env:
          ALEXANDRIA_URL: https://alexandria.ooheynerds.com
```

### 7. OpenAPI Spec Monitoring

Use `openapi-diff` to catch breaking changes.

**Script** (`scripts/check-alexandria-contract.sh`):
```bash
#!/bin/bash

# Download current Alexandria OpenAPI spec
curl -s https://alexandria.ooheynerds.com/openapi.json > /tmp/alexandria-current.json

# Compare with saved baseline
npx openapi-diff \
  ./baselines/alexandria-openapi.json \
  /tmp/alexandria-current.json \
  --fail-on-breaking

# Update baseline if intentional
if [ "$1" == "--update-baseline" ]; then
  cp /tmp/alexandria-current.json ./baselines/alexandria-openapi.json
  echo "✅ Baseline updated"
fi
```

## Constraints

- Must work with existing bendv3 patterns
- Should not duplicate Alexandria logic
- Need graceful handling of Alexandria downtime
- Must maintain backward compatibility during migration

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Module resolution issues with `exports` field | High | Use `"moduleResolution": "bundler"` in `tsconfig.json` |
| Alexandria API downtime | Medium | Implement circuit breaker, fallback to cached data |
| Breaking changes in Alexandria | High | Run contract tests in CI, use OpenAPI diff |
| Performance regression | Medium | Add performance benchmarks to contract tests |

## Testing Checklist

- [ ] Contract tests pass locally
- [ ] Contract tests pass in CI
- [ ] OpenAPI spec diff shows no breaking changes
- [ ] Provider methods have proper error handling
- [ ] Migration from old `alexandria-api.ts` complete
- [ ] Documentation updated

## Success Criteria

1. ✅ Type-safe Alexandria client working in bendv3
2. ✅ All contract tests passing
3. ✅ CI/CD pipeline validates contracts
4. ✅ OpenAPI diff detects breaking changes
5. ✅ Graceful degradation on Alexandria downtime
6. ✅ Documentation clear for team

## Timeline Estimate

- **Day 1**: Dependency upgrade, type definitions (1-2 hours)
- **Day 2**: Provider implementation, contract tests (2-3 hours)
- **Day 3**: Integration, CI/CD setup (1-2 hours)
- **Total**: 4-7 hours

## Related Files

- `src/providers/alexandria-provider.ts` - New provider
- `src/types/alexandria-types.ts` - Type definitions
- `tests/integration/alexandria-contract.test.ts` - Contract tests
- `.github/workflows/contract-tests.yml` - CI pipeline
- `scripts/check-alexandria-contract.sh` - OpenAPI diff script
- `baselines/alexandria-openapi.json` - Baseline spec
