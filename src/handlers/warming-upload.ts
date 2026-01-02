import { buildCSVParserPrompt } from '../prompts/csv-parser-prompt.ts'
import { parseCSVWithGemini } from '../providers/gemini-csv-provider.ts'
import type { Env } from '../types/env'

interface WarmingUploadBody {
  csv: string
  maxDepth?: number
  priority?: number
}

interface ParsedBook {
  author?: string
  title?: string
  isbn?: string
}

interface AuthorWarmingMessage {
  author: string
  source: string
  depth: number
  queuedAt: string
  jobId: string
}

interface WarmingJobMetadata {
  authorsQueued: number
  maxDepth: number
  startedAt: number
  status: string
}

/**
 * POST /api/warming/upload - Cache warming via CSV upload
 *
 * @param request - HTTP request with { csv, maxDepth, priority }
 * @param env - Worker environment bindings
 * @param _ctx - Execution context
 * @returns Job ID and estimates
 */
export async function handleWarmingUpload(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  try {
    const body = (await request.json()) as WarmingUploadBody

    // Validate required fields
    if (!body.csv) {
      return new Response(
        JSON.stringify({
          error: 'Missing required field: csv (base64-encoded CSV file)',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Validate maxDepth
    const maxDepth = body.maxDepth || 2
    if (maxDepth < 1 || maxDepth > 3) {
      return new Response(
        JSON.stringify({
          error: 'maxDepth must be 1-3',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Decode CSV
    const csvText = atob(body.csv)

    // Parse with Gemini
    const prompt = buildCSVParserPrompt()

    // Get API key from Secrets Store
    const apiKey = env.GEMINI_API_KEY?.get ? await env.GEMINI_API_KEY.get() : env.GEMINI_API_KEY

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'GEMINI_API_KEY not configured',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const books = (await parseCSVWithGemini(csvText, prompt, apiKey)) as ParsedBook[]

    // Extract unique authors
    const authorsSet = new Set<string>()
    for (const book of books) {
      if (book.author) {
        authorsSet.add(book.author.trim())
      }
    }

    const uniqueAuthors = Array.from(authorsSet)
    const jobId = crypto.randomUUID()

    // Queue each author
    for (const author of uniqueAuthors) {
      const message: AuthorWarmingMessage = {
        author: author,
        source: 'csv',
        depth: 0,
        queuedAt: new Date().toISOString(),
        jobId: jobId,
      }
      await env.AUTHOR_WARMING_QUEUE.send(message)
    }

    // Store job metadata in KV
    const metadata: WarmingJobMetadata = {
      authorsQueued: uniqueAuthors.length,
      maxDepth: maxDepth,
      startedAt: Date.now(),
      status: 'queued',
    }

    await env.CACHE.put(`warming:job:${jobId}`, JSON.stringify(metadata), {
      expirationTtl: 7 * 24 * 60 * 60, // 7 days
    })

    return new Response(
      JSON.stringify({
        jobId,
        authorsQueued: uniqueAuthors.length,
        estimatedWorks: uniqueAuthors.length * 15,
        estimatedDuration: '2-4 hours',
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to process upload',
        message: (error as Error).message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}
