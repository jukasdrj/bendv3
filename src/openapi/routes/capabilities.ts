/**
 * OpenAPI Route Definition: /api/v2/capabilities
 * Phase 1.4 - POC Migration
 */

import { createRoute } from '@hono/zod-openapi'
import { ErrorResponseSchema } from '../../api-v3/schemas/book.js'
import { CapabilitiesResponseSchema } from '../../schemas/capabilities.js'

export const capabilitiesRoute = createRoute({
  method: 'get',
  path: '/api/v2/capabilities',
  tags: ['Discovery'],
  summary: 'Get API capabilities and feature availability',
  description: `
Returns comprehensive feature availability and configuration.
Clients should call this on app startup to discover available features.

**Use Cases:**
- Feature discovery (check which endpoints are available)
- Version compatibility (check API version)
- Rate limit awareness (know limits before hitting them)
- Deprecation notices (prepare for sunset endpoints)
  `,
  responses: {
    200: {
      description: 'API capabilities retrieved successfully',
      content: {
        'application/json': {
          schema: CapabilitiesResponseSchema,
        },
      },
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
})
