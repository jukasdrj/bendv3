/**
 * V3 API Entry Point
 *
 * Mounts all v3 Chanfana routes on the existing Hono app
 * This allows "strangler fig" migration alongside v1/v2 routes
 *
 * Key features:
 * - Class-based endpoints with automatic validation
 * - Auto-generated OpenAPI documentation
 * - Separate Swagger UI at /v3/docs
 * - Type-safe request/response handling
 */

import { fromHono } from 'chanfana'
import type { Hono } from 'hono'

// Import endpoint classes
import { GetBookByISBN } from './endpoints/books/get-by-isbn'
import { SearchBooksByTitle } from './endpoints/books/search-title'
import { EnrichBook } from './endpoints/books/enrich'
import { AddBookToLibrary } from './endpoints/library/add-book'
import { ListUserLibrary } from './endpoints/library/list-library'
import { RemoveBookFromLibrary } from './endpoints/library/delete-book'

/**
 * Mount v3 API routes on existing Hono app
 *
 * This function is called from src/router.ts to add v3 routes
 * alongside existing v1/v2 routes without breaking them
 *
 * @param app - Existing Hono app with global middleware
 */
export function mountV3API(app: Hono<any>) {
  console.log('[V3] Mounting Chanfana API routes...')

  // Initialize Chanfana on top of Hono
  // This creates a new OpenAPI router that inherits all global middleware
  const openapi = fromHono(app, {
    docs_url: '/v3/docs', // Swagger UI location
    schema_url: '/v3/openapi.json', // OpenAPI schema location
    redoc_url: '/v3/redoc', // ReDoc UI location (alternative to Swagger)
  })

  // Register class-based endpoints
  // Each endpoint automatically:
  // - Validates request params/body against Zod schema
  // - Generates OpenAPI documentation
  // - Handles errors consistently
  // - Provides type-safe access to validated data

  // Books endpoints (using full paths since we removed 'base')
  console.log('[V3] Registering GET /v3/books/:isbn')
  openapi.get('/v3/books/:isbn', GetBookByISBN)
  console.log('[V3] Registering GET /v3/books/search')
  openapi.get('/v3/books/search', SearchBooksByTitle)
  console.log('[V3] Registering POST /v3/books/enrich')
  openapi.post('/v3/books/enrich', EnrichBook)

  // Library endpoints (Protected - require Cloudflare Access authentication)
  console.log('[V3] Registering POST /v3/library')
  openapi.post('/v3/library', AddBookToLibrary)
  console.log('[V3] Registering GET /v3/library')
  openapi.get('/v3/library', ListUserLibrary)
  console.log('[V3] Registering DELETE /v3/library/:isbn')
  openapi.delete('/v3/library/:isbn', RemoveBookFromLibrary)

  // Job/Import endpoints
  // TODO: Migrate import endpoints to v3
  // openapi.post('/imports', CreateImportJob)
  // openapi.get('/imports/:id/status', GetImportStatus)

  console.log('[V3] Chanfana API mounted successfully')
  console.log('[V3] Documentation available at:')
  console.log('[V3]   - Swagger UI: /v3/docs')
  console.log('[V3]   - OpenAPI JSON: /v3/openapi.json')
  console.log('[V3]   - ReDoc: /v3/redoc')

  return openapi
}
