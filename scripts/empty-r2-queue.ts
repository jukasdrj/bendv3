/**
 * Queue-based R2 Bucket Emptier
 *
 * Uses Queues to batch delete R2 objects without hitting rate limits
 */

export interface Env {
  COVERS_PROCESSED: R2Bucket
  CLOUDFLARE_MANAGED: R2Bucket
  DELETE_QUEUE: Queue
}

interface DeleteMessage {
  bucket: 'covers-processed' | 'cloudflare-managed'
  keys: string[]
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/start-empty-covers-processed') {
      return await queueDeletion(env, env.COVERS_PROCESSED, 'covers-processed')
    }

    if (url.pathname === '/start-empty-cloudflare-managed') {
      return await queueDeletion(env, env.CLOUDFLARE_MANAGED, 'cloudflare-managed')
    }

    if (url.pathname === '/status') {
      return new Response(JSON.stringify({
        message: 'Deletion queued. Check logs for progress.',
        endpoints: [
          'POST /start-empty-covers-processed',
          'POST /start-empty-cloudflare-managed',
          'GET /status'
        ]
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response('Queue-based R2 deletion service\n\nPOST /start-empty-covers-processed\nPOST /start-empty-cloudflare-managed\nGET /status', {
      headers: { 'Content-Type': 'text/plain' }
    })
  },

  async queue(batch: MessageBatch<DeleteMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { bucket, keys } = message.body

      const r2Bucket = bucket === 'covers-processed'
        ? env.COVERS_PROCESSED
        : env.CLOUDFLARE_MANAGED

      try {
        // Delete in smaller batches to avoid rate limits
        for (let i = 0; i < keys.length; i += 50) {
          const batch = keys.slice(i, i + 50)
          await Promise.all(batch.map(key => r2Bucket.delete(key)))
          console.log(`Deleted batch ${Math.floor(i / 50) + 1}: ${batch.length} objects from ${bucket}`)
        }

        message.ack()
      } catch (error) {
        console.error(`Error deleting batch from ${bucket}:`, error)
        message.retry()
      }
    }
  }
}

async function queueDeletion(env: Env, bucket: R2Bucket, bucketName: string): Promise<Response> {
  let cursor: string | undefined = undefined
  let totalQueued = 0
  let batchCount = 0

  try {
    do {
      const listed = await bucket.list({ cursor, limit: 1000 })

      if (listed.objects.length === 0) {
        break
      }

      const keys = listed.objects.map(obj => obj.key)

      // Send to queue for deletion
      await env.DELETE_QUEUE.send({
        bucket: bucketName as 'covers-processed' | 'cloudflare-managed',
        keys
      })

      totalQueued += keys.length
      batchCount++
      console.log(`Queued batch ${batchCount}: ${keys.length} objects from ${bucketName}`)

      cursor = listed.truncated ? listed.cursor : undefined
    } while (cursor)

    return new Response(JSON.stringify({
      bucket: bucketName,
      totalQueued,
      batchCount,
      status: 'Deletion queued successfully. Objects will be deleted by queue consumer.'
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(`Error queuing deletion: ${error}`, { status: 500 })
  }
}
