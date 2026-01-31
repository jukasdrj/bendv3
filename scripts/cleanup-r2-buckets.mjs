#!/usr/bin/env node
/**
 * R2 Bucket Cleanup Script
 *
 * This script empties and deletes R2 buckets using the Cloudflare API.
 * It handles large buckets by listing and deleting objects in batches.
 */

import { execSync } from 'node:child_process'

const ACCOUNT_ID = 'd03bed0be6d976acd8a1707b55052f79'
const BUCKETS_TO_DELETE = [
  'bookstrack-covers-processed',
  'cloudflare-managed-ea345b39'
]

async function getAccessToken() {
  console.log('🔑 Getting access token from wrangler...')
  try {
    const output = execSync('npx wrangler whoami', { encoding: 'utf-8' })
    // Token is stored in wrangler config, we'll use wrangler CLI for API calls
    return 'using-wrangler-auth'
  } catch (error) {
    throw new Error('Failed to authenticate with wrangler')
  }
}

async function listBucketObjects(bucketName, cursor = null) {
  console.log(`📋 Listing objects in ${bucketName}${cursor ? ` (cursor: ${cursor.substring(0, 20)}...)` : ''}`)

  const params = new URLSearchParams({
    per_page: '1000'
  })
  if (cursor) {
    params.set('cursor', cursor)
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${bucketName}/objects?${params}`

  try {
    // Use fetch since we're in Node 18+
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN || ''}`,
      }
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.result
  } catch (error) {
    console.error(`❌ Failed to list objects: ${error.message}`)
    return { objects: [], cursor: null }
  }
}

async function deleteObject(bucketName, objectKey) {
  // Use wrangler CLI to delete individual objects
  try {
    execSync(`npx wrangler r2 object delete ${bucketName}/${objectKey}`, {
      stdio: 'pipe',
      encoding: 'utf-8'
    })
    return true
  } catch (error) {
    console.error(`❌ Failed to delete ${objectKey}: ${error.message}`)
    return false
  }
}

async function emptyBucket(bucketName) {
  console.log(`\n🗑️  Emptying bucket: ${bucketName}`)

  let totalDeleted = 0
  let cursor = null
  let page = 1

  do {
    const result = await listBucketObjects(bucketName, cursor)
    const objects = result.objects || []

    if (objects.length === 0) {
      console.log(`✅ Bucket ${bucketName} is empty`)
      break
    }

    console.log(`📦 Page ${page}: Found ${objects.length} objects to delete`)

    // Delete objects in batches of 10 to avoid rate limits
    const batchSize = 10
    for (let i = 0; i < objects.length; i += batchSize) {
      const batch = objects.slice(i, i + batchSize)
      console.log(`   Deleting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(objects.length / batchSize)} (${batch.length} objects)...`)

      const results = await Promise.allSettled(
        batch.map(obj => deleteObject(bucketName, obj.key))
      )

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length
      totalDeleted += successCount

      // Add small delay between batches
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    cursor = result.cursor
    page++

    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn('⚠️  Reached page limit (100), stopping')
      break
    }

  } while (cursor)

  console.log(`✅ Deleted ${totalDeleted} objects from ${bucketName}`)
  return totalDeleted
}

async function deleteBucket(bucketName) {
  console.log(`\n🗑️  Deleting bucket: ${bucketName}`)

  try {
    execSync(`npx wrangler r2 bucket delete ${bucketName}`, {
      stdio: 'inherit'
    })
    console.log(`✅ Bucket ${bucketName} deleted`)
    return true
  } catch (error) {
    console.error(`❌ Failed to delete bucket ${bucketName}: ${error.message}`)
    return false
  }
}

async function main() {
  console.log('🚀 Starting R2 bucket cleanup...\n')

  // Check for API token
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.error('❌ CLOUDFLARE_API_TOKEN environment variable is required')
    console.error('   Get your token from: https://dash.cloudflare.com/profile/api-tokens')
    console.error('   Run: export CLOUDFLARE_API_TOKEN=your_token_here')
    process.exit(1)
  }

  await getAccessToken()

  for (const bucketName of BUCKETS_TO_DELETE) {
    try {
      // Empty the bucket first
      await emptyBucket(bucketName)

      // Then delete the bucket
      await deleteBucket(bucketName)

    } catch (error) {
      console.error(`❌ Error processing bucket ${bucketName}: ${error.message}`)
    }
  }

  console.log('\n✅ Cleanup complete!')
  console.log('\n📊 Remaining resources:')
  console.log('   - BOOKS_CACHE KV namespace (talaria)')
  console.log('   - bookshelf-images R2 bucket (talaria)')
  console.log('   - bookstrack-library D1 database')
}

main().catch(error => {
  console.error('💥 Fatal error:', error)
  process.exit(1)
})
