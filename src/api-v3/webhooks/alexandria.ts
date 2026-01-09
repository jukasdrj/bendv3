/**
 * Alexandria Webhook Handlers
 *
 * Handles push notifications from Alexandria (Data Lake).
 *
 * Routes:
 * - POST /v3/webhooks/alexandria/enrichment-complete
 */

import { createProblemDetails } from '@bookstrack/schemas'
import { createRoute, type OpenAPIHono, z } from '@hono/zod-openapi'
import type { RequestContext } from '../../middleware/request-context'
import type { Env } from '../../types/env'

// Schema for the webhook payload (exported for contract testing)
export const EnrichmentCompleteSchema = z.object({
  isbn: z.string(),
  type: z.enum(['edition', 'work', 'author']),
  quality_improvement: z.number().optional(),
})

export function registerAlexandriaWebhookRoutes(
  app: OpenAPIHono<{ Bindings: Env; Variables: { ctx: RequestContext } }>,
) {
  const enrichmentCompleteRoute = createRoute({
    method: 'post',
    path: '/v3/webhooks/alexandria/enrichment-complete',
    tags: ['Webhooks'],
    summary: 'Handle enrichment completion event',
    description:
      'Receives notification from Alexandria when book enrichment is complete. Triggers a fresh fetch to update local D1 cache.',
    request: {
      headers: z.object({
        'x-alexandria-webhook-secret': z.string().openapi({
          description: 'Shared secret for authentication',
        }),
      }),
      body: {
        content: {
          'application/json': {
            schema: EnrichmentCompleteSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Webhook processed successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      401: {
        description: 'Invalid secret',
        content: { 'application/problem+json': { schema: z.any() } },
      },
      500: {
        description: 'Server error',
        content: { 'application/problem+json': { schema: z.any() } },
      },
    },
  })

  app.openapi(enrichmentCompleteRoute, async (c) => {
    const ctx = c.get('ctx')
    const { 'x-alexandria-webhook-secret': secret } = c.req.valid('header')
    const payload = c.req.valid('json')

    // Verify Secret
    if (secret !== c.env.ALEXANDRIA_WEBHOOK_SECRET) {
      console.warn(`[Webhook] Invalid secret attempt from ${c.req.header('cf-connecting-ip')}`)
      return c.json(
        createProblemDetails('UNAUTHORIZED', 'Invalid webhook secret', {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        401,
      )
    }

    try {
      console.log(`[Webhook] Received enrichment complete for ${payload.type} ${payload.isbn}`)

      if (payload.type === 'edition') {
        // Force refresh the book data from Alexandria asynchronously
        // Use waitUntil to return 200 OK immediately to Alex
        const promise = (async () => {
          try {
            // Import services dynamically to avoid circular deps
            const { enrichMultipleBooks } = await import('../../services/enrichment')
            const { BookRepository } = await import('../../repositories/book-repository')

            // Fetch fresh data from Alex
            const externalResult = await enrichMultipleBooks(
              { isbn: payload.isbn },
              c.env,
              { maxResults: 1 },
              c.executionCtx,
            )

            if (externalResult.works && externalResult.works.length > 0) {
              const { buildBookRecordFromEnrichment } = await import(
                '../../utils/book-record-builder'
              )

              const work = externalResult.works[0]!
              const edition = externalResult.editions?.[0]

              // Build BookRecord using shared builder
              const bookRecord = buildBookRecordFromEnrichment(
                payload.isbn,
                externalResult,
                // Use the cover URLs returned by Alexandria (which usually processes them)
                {
                  small: work.coverImageURL || edition?.coverImageURL || null,
                  medium: work.coverImageURL || edition?.coverImageURL || null,
                  large: work.coverImageURL || edition?.coverImageURL || null,
                },
              )

              const bookRepo = new BookRepository(c.env as Env)
              await bookRepo.save(bookRecord)
              console.log(`[Webhook] Successfully refreshed D1 for ${payload.isbn}`)
            } else {
              console.warn(`[Webhook] Enrichment returned no works for ${payload.isbn}`)
            }
          } catch (err) {
            console.error(`[Webhook] Async refresh failed for ${payload.isbn}:`, err)
          }
        })()

        c.executionCtx.waitUntil(promise)
      }

      return c.json({ success: true, message: 'Enrichment scheduled' }, 200)
    } catch (error: any) {
      console.error('[Webhook] Error processing enrichment:', error)

      // Enum-based error classification (more robust than string matching)
      // Permanent errors (client/logic): Return 200 to stop Alexandria retries
      // Transient errors (network/timeout): Return 500 to trigger retries
      const PERMANENT_ERROR_CODES = new Set([
        'INVALID_ISBN',
        'INVALID_QUERY',
        'VALIDATION_ERROR',
        'SCHEMA_ERROR',
      ])

      const errorCode = error?.code || error?.name
      const isPermanentError = errorCode && PERMANENT_ERROR_CODES.has(errorCode)

      if (isPermanentError) {
        // Log for monitoring and investigation
        console.warn(`[Webhook] Permanent error for ${payload.isbn}:`, {
          code: errorCode,
          message: error.message,
          requestId: ctx.requestId,
        })

        // Track in Analytics Engine for alerting
        try {
          c.env.PERFORMANCE_ANALYTICS?.writeDataPoint({
            blobs: ['webhook_permanent_error', payload.isbn, errorCode],
            doubles: [1],
            indexes: ['alexandria_webhook'],
          })
        } catch (_) {
          // Analytics failure shouldn't block webhook response
        }

        // Return 200 to stop retries (don't expose internal error details)
        return c.json(
          {
            success: false,
            message: 'Request cannot be processed',
          },
          200,
        )
      }

      // Default: Return 500 for transient/unknown errors to trigger retries
      return c.json(
        createProblemDetails('INTERNAL_ERROR', 'Temporary processing error', {
          requestId: ctx.requestId,
          instance: c.req.url,
        }),
        500,
      )
    }
  })
}
