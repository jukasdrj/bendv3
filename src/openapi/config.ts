/**
 * OpenAPI Configuration
 *
 * Central configuration for the BooksTrack API OpenAPI document.
 * Used by @hono/zod-openapi to auto-generate API documentation.
 *
 * @see OPENAPI_MIGRATION_PLAN.md - Phase 1.5 Configuration (lines 353-377)
 */

export const openAPIConfig = {
  openapi: '3.1.0',
  info: {
    title: 'BooksTrack API',
    version: '3.3.0',
    description: 'Book search, enrichment, and AI-powered scanning API',
    contact: {
      email: 'api-support@oooefam.net',
    },
  },
  servers: [
    { url: 'https://api.oooefam.net', description: 'Production' },
    { url: 'http://localhost:8787', description: 'Local development' },
  ],
  tags: [
    { name: 'Search', description: 'Book and author search operations' },
    { name: 'Enrichment', description: 'Book metadata enrichment' },
    { name: 'Import', description: 'CSV import and batch processing' },
    { name: 'Scanning', description: 'Bookshelf photo scanning' },
    { name: 'Health', description: 'System health and monitoring' },
  ],
}

/**
 * OpenAPI document configuration type
 * Inferred from the config object for type safety
 */
export type OpenAPIConfig = typeof openAPIConfig
