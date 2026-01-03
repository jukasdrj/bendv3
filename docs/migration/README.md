# API Migration Guides

This directory contains migration guides for transitioning between BooksTrack API versions.

## Available Guides

- **[V2 → V3 Migration](v2-to-v3.md)** - Complete migration guide from V2 to V3
  - Breaking changes overview
  - Code examples (TypeScript, Swift)
  - Testing strategies
  - Common issues and solutions
  - Timeline: V2 sunset March 1, 2026

## General Migration Process

1. **Review the migration guide** for your current version
2. **Update dependencies** (install `@bookstrack/schemas@latest`)
3. **Update code** following the guide's examples
4. **Test thoroughly** in staging environment
5. **Deploy gradually** using feature flags
6. **Monitor errors** after deployment

## Versioning Policy

See [docs/API_VERSIONING.md](../API_VERSIONING.md) for:
- API versioning philosophy
- Deprecation timelines
- Breaking vs non-breaking changes
- How to introduce new versions

## Archived Migrations

Older migration guides for sunset API versions:
- V1 → V2: See `archive/v1-api/` (V1 sunset December 2025)

## Need Help?

- **Interactive Docs:** https://api.oooefam.net/v3/docs
- **OpenAPI Spec:** https://api.oooefam.net/v3/openapi.json
- **GitHub Issues:** Report migration issues
- **Changelog:** See [CHANGELOG.md](../../CHANGELOG.md) for version history

---

**Last Updated:** January 3, 2026
