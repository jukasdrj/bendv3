# Prompt: Create New v1 API Endpoint

Use this template when creating a new `/v1/*` endpoint.

---

## Task

Create a new v1 API endpoint: `{METHOD} /v1/{path}`

**Example:** `GET /v1/search/author`

---

## Requirements Checklist

### 1. Handler Implementation
- [ ] Create handler file: `src/handlers/v1/{name}.ts`
- [ ] Import required dependencies:
  - `createSuccessResponse`, `createErrorResponse` from `../../utils/response-builder.js`
  - Relevant services from `../../services/`
  - DTO types from `../../types/canonical.js`
- [ ] Implement error handling (try-catch required)
- [ ] Return `ResponseEnvelope<T>` format

### 2. Route Registration
- [ ] Add route to `src/index.js`
- [ ] Import handler function
- [ ] Add route pattern matching
- [ ] Extract query/path parameters
- [ ] Call handler with `env` and `request`

### 3. Response Format
- [ ] Success: `createSuccessResponse(data, metadata, 200, request)`
- [ ] Error: `createErrorResponse(message, statusCode, errorCode, details, request)`
- [ ] Include `processingTime` in metadata
- [ ] Include `provider` if data from external API
- [ ] Include `cached: boolean` in metadata

### 4. Input Validation
- [ ] Validate required query/path parameters
- [ ] Return 400 with `INVALID_REQUEST` code for missing params
- [ ] Sanitize user inputs before external API calls

### 5. Caching (if applicable)
- [ ] Check KV cache first
- [ ] Cache successful responses with appropriate TTL
- [ ] Set `cached: true` in metadata for cached responses

### 6. Documentation
- [ ] Add endpoint to `docs/API_CONTRACT.md`
- [ ] Include request/response examples
- [ ] Document query parameters
- [ ] Document error scenarios

---

## Code Template

```typescript
/**
 * {METHOD} /v1/{path}
 *
 * {Description of what this endpoint does}
 */

import type { {ResponseType} } from '../../types/responses.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../../utils/response-builder.js';
import { {serviceName} } from '../../services/{service}.js';

export async function handle{Name}(
  {params}: {types},
  env: any,
  request: Request | null = null
): Promise<Response> {
  const startTime = Date.now();

  // Validation
  if (!{param}) {
    return createErrorResponse(
      '{Param} is required',
      400,
      ErrorCodes.INVALID_REQUEST,
      { {param} },
      request
    );
  }

  try {
    // Business logic
    const result = await {serviceName}({param}, env);

    if (!result) {
      return createSuccessResponse(
        { /* empty result structure */ },
        {
          processingTime: Date.now() - startTime,
          provider: 'none',
          cached: false
        },
        200,
        request
      );
    }

    return createSuccessResponse(
      result,
      {
        processingTime: Date.now() - startTime,
        provider: result.provider,
        cached: false
      },
      200,
      request
    );
  } catch (error: any) {
    console.error('Error in /v1/{path}:', error);
    return createErrorResponse(
      error.message || 'Internal server error',
      500,
      ErrorCodes.INTERNAL_ERROR,
      { error: error.toString() },
      request
    );
  }
}
```

---

## Route Registration Template

```javascript
// src/index.js

import { handle{Name} } from "./handlers/v1/{name}.js";

// In fetch() handler:
if (url.pathname === "/v1/{path}" && request.method === "{METHOD}") {
  const {param} = url.searchParams.get("{param}");
  return await handle{Name}({param}, env, request);
}
```

---

## Testing Checklist

- [ ] Test with valid input (200 OK)
- [ ] Test with missing parameters (400 INVALID_REQUEST)
- [ ] Test with not found scenario (200 with empty data)
- [ ] Test caching (if applicable)
- [ ] Test rate limiting (429 after burst)
- [ ] Verify response matches `API_CONTRACT.md` format

---

## Contract Compliance

**Before merging:**
- [ ] Endpoint documented in `docs/API_CONTRACT.md`
- [ ] Response format matches `ResponseEnvelope<T>`
- [ ] Error codes from approved list (`ErrorCodes`)
- [ ] cf-code-reviewer approved changes
- [ ] Contract tests pass (if available)

---

**Related Issues:** #138 (OpenAPI), #140 (Contract Testing)
