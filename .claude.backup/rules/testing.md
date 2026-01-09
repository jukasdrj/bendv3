# Testing Rules

## Resource-Aware Testing
- Use `npm run test:smoke` for quick validation (5s)
- Use `npm run test:safe` for full suite with resource limits (60s, 512MB)
- Reserve `npm test` for CI/CD or 16GB+ RAM machines

## Test Organization
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- Smoke tests: `tests/smoke/`
- Coverage target: 75%+

## Before Commits
- Run `npm run validate` (smoke tests + lint)
- Check for uncommitted secrets
- Verify wrangler.jsonc is valid

## External APIs
- Mock all external API calls in tests
- Never make real network requests in unit tests
- Use Vitest's forks pool with max 2 forks
