/**
 * Empty R2 Bucket Script
 *
 * Lists and deletes all objects in specified R2 buckets.
 * Usage: npx wrangler dev --local scripts/empty-r2-bucket.ts --r2 BUCKET_NAME=bucket-name
 */

export interface Env {
  COVERS_PROCESSED: R2Bucket
  CLOUDFLARE_MANAGED: R2Bucket
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/empty-covers-processed') {
      return await emptyBucket(env.COVERS_PROCESSED, 'bookstrack-covers-processed')
    }

    if (url.pathname === '/list-covers-processed') {
      return await listObjects(env.COVERS_PROCESSED, 'bookstrack-covers-processed')
    }

    if (url.pathname === '/empty-cloudflare-managed') {
      return await emptyBucket(env.CLOUDFLARE_MANAGED, 'cloudflare-managed-ea345b39')
    }

    if (url.pathname === '/list-cloudflare-managed') {
      return await listObjects(env.CLOUDFLARE_MANAGED, 'cloudflare-managed-ea345b39')
    }

    return new Response('Available endpoints:\n- GET /list-covers-processed\n- POST /empty-covers-processed\n- GET /list-cloudflare-managed\n- POST /empty-cloudflare-managed', {
      headers: { 'Content-Type': 'text/plain' }
    })
  }
}

async function listObjects(bucket: R2Bucket, bucketName: string): Promise<Response> {
  const objects: string[] = []
  let cursor: string | undefined = undefined
  let totalSize = 0
  let batchCount = 0
  const maxBatches = 10 // Limit to prevent timeout

  try {
    do {
      const listed = await bucket.list({ cursor, limit: 1000 })
      batchCount++

      console.log(`Batch ${batchCount}: ${listed.objects.length} objects`)

      for (const obj of listed.objects) {
        objects.push(obj.key)
        totalSize += obj.size
      }

      cursor = listed.truncated ? listed.cursor : undefined

      // Prevent timeout by limiting batches
      if (batchCount >= maxBatches && cursor) {
        console.log(`Reached max batches (${maxBatches}), stopping pagination`)
        break
      }
    } while (cursor)

    const summary = {
      bucket: bucketName,
      totalObjects: objects.length,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      batchesProcessed: batchCount,
      objects: objects.slice(0, 20), // First 20 for preview
      truncated: objects.length > 20 || (cursor !== undefined),
      note: cursor ? 'More objects exist but not all were fetched to prevent timeout' : 'All objects fetched'
    }

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(`Error listing objects: ${error}`, { status: 500 })
  }
}

async function emptyBucket(bucket: R2Bucket, bucketName: string): Promise<Response> {
  const deletedKeys: string[] = []
  let cursor: string | undefined = undefined
  let batchCount = 0
  const maxObjectsPerInvocation = 500 // Lower limit to avoid rate limits

  try {
    do {
      const listed = await bucket.list({ cursor, limit: 100 }) // Smaller list batches

      if (listed.objects.length === 0) {
        break
      }

      // Delete one at a time to avoid rate limits
      const keys = listed.objects.map(obj => obj.key)
      for (const key of keys) {
        try {
          await bucket.delete(key)
          deletedKeys.push(key)

          // Log every 25 deletions
          if (deletedKeys.length % 25 === 0) {
            console.log(`Deleted ${deletedKeys.length} objects so far...`)
          }
        } catch (error) {
          console.error(`Failed to delete ${key}:`, error)
        }
      }

      batchCount++

      cursor = listed.truncated ? listed.cursor : undefined

      // Limit total objects per invocation to avoid timeouts
      if (deletedKeys.length >= maxObjectsPerInvocation) {
        console.log(`Reached limit of ${maxObjectsPerInvocation} objects, stopping`)
        break
      }
    } while (cursor)

    const summary = {
      bucket: bucketName,
      deletedCount: deletedKeys.length,
      batchCount,
      status: deletedKeys.length === 0 ? 'already empty' : cursor ? 'partially emptied (call again to continue)' : 'emptied successfully',
      hasMore: cursor !== undefined
    }

    return new Response(JSON.stringify(summary, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(`Error emptying bucket: ${error}\nDeleted ${deletedKeys.length} objects before error`, { status: 500 })
  }
}
