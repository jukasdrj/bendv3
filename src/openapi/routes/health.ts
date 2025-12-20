/**
 * OpenAPI Route Definitions: GET /health endpoint
 *
 * Sprint 1, Day 5 - OpenAPI Fast Track Migration
 * Endpoint: GET /health - Health check
 */

import { createRoute } from '@hono/zod-openapi'
import { HealthQuerySchema, HealthSuccessResponseSchema } from '../../schemas/health'

/**
 * GET /health - Health Check
 *
 * Simple health check endpoint that returns the worker status.
 * Used for monitoring and uptime checks.
 *
 * **Response:**
 * Returns basic worker information including status, version, and router type.
 * Always returns HTTP 200 when the worker is responding.
 *
 * **Use Cases:**
 * - Cloudflare monitoring dashboards
 * - Load balancer health checks
 * - Client uptime verification
 * - CI/CD pipeline health gates
 *
 * **No Authentication Required:**
 * This endpoint is publicly accessible for monitoring purposes.
 */
export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Health check endpoint',
  description: `
Simple health check that returns worker status.

Returns basic worker information for monitoring purposes:
- **status**: Health status indicator (always "ok" when responding)
- **worker**: Worker service name
- **version**: API version
- **router**: Router framework type

**Example:** \`GET /health\`

This endpoint is publicly accessible and requires no authentication.
Use it for:
- Monitoring and uptime checks
- Load balancer health gates
- CI/CD pipeline verification
  `,
  request: {
    query: HealthQuerySchema,
  },
  responses: {
    200: {
      description: 'Health check successful',
      content: {
        'application/json': {
          schema: HealthSuccessResponseSchema,
          example: {
            data: {
              status: 'ok',
              worker: 'api-worker',
              version: '2.1.0',
              router: 'hono',
            },
            metadata: {
              timestamp: '2025-11-28T12:00:00.000Z',
            },
          },
        },
      },
    },
  },
})
