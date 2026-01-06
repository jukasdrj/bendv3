/**
 * Image Routes
 *
 * Image proxy endpoint for CORS-safe image loading.
 *
 * Routes:
 * - GET /images/proxy - Proxy external images through API
 */

import { OpenAPIHono } from '@hono/zod-openapi'
import { handleImageProxy } from '../handlers/image-proxy'
import type { Env } from '../types/env.js'

export function createImageRoutes() {
  const router = new OpenAPIHono<{ Bindings: Env }>()

  // GET /proxy - Proxy external images through API (CORS, caching)
  // Note: handleImageProxy extracts the 'url' query param from the request internally
  router.get('/proxy', async (c) => {
    return await handleImageProxy(c.req.raw, c.env)
  })

  return router
}
