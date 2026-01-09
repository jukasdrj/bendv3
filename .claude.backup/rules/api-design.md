# API Design Rules

## V3 API (Current)
- All new endpoints go in `/v3/*` namespace
- Use @hono/zod-openapi for route definitions
- Schemas auto-generate OpenAPI spec at `/v3/openapi.json`

## Response Envelope
```typescript
{
  success: true | false,
  data?: T,
  metadata?: {
    source: string,
    cached: boolean,
    timestamp: string
  },
  error?: {
    code: string,
    message: string,
    statusCode: number
  }
}
```

## Provider Chain
1. Alexandria RPC (primary, internal data)
2. Google Books (fallback)
3. OpenLibrary (fallback)

## Circuit Breaker
- 5 failures opens circuit
- 60s cooldown before half-open
- 2 successes closes circuit
- Per-provider protection
