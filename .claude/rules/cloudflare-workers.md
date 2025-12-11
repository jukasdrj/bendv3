# Cloudflare Workers Rules

## Environment Bindings
- Always access secrets via `env` parameter, never hardcode
- Use KV cache-first pattern for external API calls
- Set appropriate TTL on KV writes (24h for books, 7d for covers)

## Async Patterns
- Never block the event loop with synchronous waits
- Use `Promise.all()` for parallel external API calls
- Always set timeouts on external `fetch()` calls (10s default)

## Response Format
- Use canonical `ResponseEnvelope` format for all `/v3/*` endpoints
- Include `success` discriminator in all responses
- Add `metadata.cached`, `metadata.provider`, `metadata.timestamp`

## Error Handling
- Wrap all async operations in try-catch
- Never expose secrets or stack traces in error responses
- Use structured error codes from `ErrorCodes` enum

## Performance
- CPU time limit: 5 minutes (HTTP), 15 minutes (Cron/Queue)
- Use Durable Object alarms for long-running operations
- Stream large responses with `TransformStream`
