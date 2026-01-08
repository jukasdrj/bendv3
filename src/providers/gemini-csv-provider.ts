// src/providers/gemini-csv-provider.ts
// Issue #179: Retry logic with exponential backoff for Gemini API failures
// Issue #253: JSON repair for Gemini truncation errors
// A/B Testing: Support for multiple Gemini models (2.5-flash, 3-flash-preview, 2.5-flash-lite)

import type { GeminiCSVModel } from '../config/gemini-models'
import { getModelConfig, getModelEndpoint } from '../config/gemini-models'
import type { CSVParseABTestEvent } from '../types/analytics'
import type { CSVParsedBook } from '../types/gemini-schemas'
import { CSV_BOOK_SCHEMA } from '../types/gemini-schemas'
import { retryWithBackoff } from '../utils/concurrency/retry'
import { parseJSONWithRepair } from '../utils/json-repair'

/**
 * Result of parsing CSV with Gemini, including both valid books and validation errors
 */
export interface GeminiParseResult {
  books: CSVParsedBook[]
  errors: GeminiValidationError[]
  /** A/B test telemetry (optional) */
  telemetry?: CSVParseABTestEvent
}

/**
 * Validation error for a book that failed post-parse validation
 */
export interface GeminiValidationError {
  rowNumber: number // Approximate position in CSV (1-based, +1 for header)
  message: string
  code: 'whitespace_author' | 'missing_author' | 'missing_title' | 'database_error'
  field: 'author' | 'title' | 'isbn'
  value?: string
  title?: string // For context
}

/**
 * Gemini API request structure for generateContent endpoint
 */
interface GeminiContentRequest {
  system_instruction: {
    parts: Array<{ text: string }>
  }
  contents: Array<{
    parts: Array<{ text: string }>
  }>
  generationConfig: {
    temperature: number
    topP: number
    maxOutputTokens: number
    responseMimeType: string
    responseSchema: typeof CSV_BOOK_SCHEMA
    stopSequences: string[]
  }
}

/**
 * Gemini API response structure
 */
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * Sanitize CSV text to prevent prompt injection attacks
 *
 * Security measures:
 * - Escape special characters that could break out of context
 * - Remove control characters that could inject commands
 * - Truncate excessive input to prevent token exhaustion attacks
 *
 * @param csvText - Raw CSV content
 * @returns Sanitized CSV content safe for use in prompts
 */
function sanitizeCSVForPrompt(csvText: string): string {
  // Approximates Gemini 2.0 Flash 2M token context (assuming ~4 bytes per token)
  // Issue #181: Aligned with MAX_FILE_SIZE in csv-import.ts for consistency
  const MAX_CSV_SIZE = 8 * 1024 * 1024 // 8MB

  if (csvText.length > MAX_CSV_SIZE) {
    throw new Error(
      `CSV too large for processing (max ${MAX_CSV_SIZE / 1024 / 1024}MB to fit 2M token limit)`,
    )
  }

  // Remove control characters that could inject instructions
  // Keep only printable ASCII, tabs, newlines, and common Unicode characters
  let sanitized = csvText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  // Escape special characters that could break prompt context
  sanitized = sanitized
    .replace(/\\/g, '\\\\') // Escape backslashes first
    .replace(/`/g, '\\`') // Escape backticks (code blocks)
    .replace(/\${/g, '\\${') // Escape template literals

  // Remove suspicious instruction patterns (case-insensitive)
  const suspiciousPatterns: RegExp[] = [
    /ignore\s+(previous|all|prior)\s+instructions?/gi,
    /new\s+instructions?:/gi,
    /system\s*:/gi,
    /override\s+(instructions?|system)/gi,
    /disregard\s+(previous|prior|all)/gi,
  ]

  for (const pattern of suspiciousPatterns) {
    sanitized = sanitized.replace(pattern, '[REMOVED_SUSPICIOUS_CONTENT]')
  }

  return sanitized
}

/**
 * Parse CSV file using Gemini API with A/B testing support
 *
 * Features:
 * - System instructions for role definition (Gemini best practice)
 * - Low temperature (0.1) for maximum determinism
 * - responseMimeType for guaranteed JSON output (no markdown stripping needed)
 * - responseSchema for type safety (Gemini enforces title+author requirement)
 * - Supports large CSVs (up to 8K tokens output)
 * - SECURITY: Input sanitization to prevent prompt injection attacks
 * - A/B TESTING: Supports multiple model variants with telemetry
 *
 * @param csvText - Raw CSV content
 * @param prompt - Gemini prompt with few-shot examples
 * @param apiKey - Gemini API key from env.GEMINI_API_KEY
 * @param options - Optional configuration for A/B testing
 * @returns GeminiParseResult with valid books and validation errors
 * @throws Error if API call fails or response is invalid
 */
export async function parseCSVWithGemini(
  csvText: string,
  prompt: string,
  apiKey: string,
  options?: {
    model?: GeminiCSVModel
    jobId?: string
    userId?: string
    enableTelemetry?: boolean
  },
): Promise<GeminiParseResult> {
  // Default to gemini-3-flash-preview for reliability (Issue #253)
  // Can be overridden via options.model if A/B testing is re-enabled
  const selectedModel = options?.model || 'gemini-3-flash-preview'
  const modelConfig = getModelConfig(selectedModel)
  const endpoint = getModelEndpoint(selectedModel)
  const timeout = modelConfig.recommendedTimeout

  // Telemetry tracking
  const startTime = Date.now()
  const enableTelemetry = options?.enableTelemetry ?? false

  // SECURITY FIX (#177): Sanitize CSV content to prevent prompt injection
  const sanitizedCSV = sanitizeCSVForPrompt(csvText)
  const fullPrompt = `${prompt}\n\nCSV Data:\n${sanitizedCSV}`

  // Issue #179: Wrap fetch with retry logic (exponential backoff on transient failures)
  const response = await retryWithBackoff(async () => {
    const requestBody: GeminiContentRequest = {
      // System instruction: Define the CSV parser's role
      system_instruction: {
        parts: [
          {
            text: `You are an expert book data parser specialized in extracting structured book information from CSV exports.

Your primary task is to intelligently map CSV columns to a standardized book data schema, handling various CSV formats from Goodreads, LibraryThing, StoryGraph, and custom exports.

Core capabilities:
- Auto-detect column headers regardless of format variations
- Infer missing metadata (author gender, cultural region, genre) when possible
- Normalize data types and formats (dates, ratings, ISBN formats)
- Handle malformed or incomplete rows gracefully

Always return ONLY a valid JSON array. Do not include explanatory text.`,
          },
        ],
      },
      contents: [
        {
          parts: [
            {
              text: fullPrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1, // Maximum determinism for structured parsing with Flash-Lite
        topP: 0.95, // Nucleus sampling for quality
        maxOutputTokens: 8192,
        responseMimeType: 'application/json', // Force JSON output (eliminates markdown code blocks)
        responseSchema: CSV_BOOK_SCHEMA, // Schema-enforced validation (guarantees title+author)
        stopSequences: ['\n\n\n'], // Stop on triple newline (prevents unnecessary continuation)
      },
    }

    // Dynamic timeout based on model configuration (A/B testing)
    // Default: 90s for 2.5-flash, 60s for flash-lite, 90s for 3-flash-preview
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    const apiStartTime = Date.now()

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const error = await res.text()
        throw new Error(`Gemini API error: ${res.status} - ${error}`)
      }

      const apiLatencyMs = Date.now() - apiStartTime
      return { res, apiLatencyMs }
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Gemini API request timed out after ${timeout / 1000} seconds`)
      }
      throw error
    }
  })

  const data = (await response.res.json()) as GeminiResponse
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text
  const apiLatencyMs = response.apiLatencyMs

  // Extract token usage metrics (Gemini API best practice: cost tracking)
  const tokenUsage = data.usageMetadata || {}
  const promptTokens = tokenUsage.promptTokenCount || 0
  const outputTokens = tokenUsage.candidatesTokenCount || 0
  const totalTokens = tokenUsage.totalTokenCount || 0

  console.log(
    `[GeminiCSVProvider] Model: ${selectedModel}, Token usage - Prompt: ${promptTokens}, Output: ${outputTokens}, Total: ${totalTokens}, Latency: ${apiLatencyMs}ms`,
  )

  if (!textResponse) {
    throw new Error('Gemini returned empty response')
  }

  // Issue #253: Parse with automatic JSON repair for truncation errors
  // Gemini API has known issues with "Unterminated string in JSON" when hitting token limits
  const parseResult = parseJSONWithRepair<CSVParsedBook[]>(textResponse, {
    includeRawText: true, // Include for debugging
    maxRepairAttempts: 3,
  })

  if (!parseResult.success) {
    throw new Error(
      `Invalid JSON from Gemini: ${parseResult.error}${parseResult.repairAttempted ? ' (repair attempted)' : ''}`,
    )
  }

  const parsed = parseResult.data!

  // Lightweight defensive check: Catches API bugs, not schema violations
  // (Schema guarantees array of books with title+author, but we verify to catch unexpected API changes)
  if (!Array.isArray(parsed)) {
    throw new Error(`Schema violation: Expected array, got ${typeof parsed}`)
  }

  // Log if JSON repair was used (indicates potential token limit issues)
  if (parseResult.repairAttempted) {
    console.warn(
      `[GeminiCSVProvider] JSON repair was applied for model ${selectedModel}. Consider increasing maxOutputTokens or simplifying schema.`,
    )
  }

  try {
    // Issue #160: Post-parse validation for empty/whitespace-only authors
    // Schema minLength prevents empty strings, but whitespace-only may slip through
    // Track validation errors alongside valid books
    const validBooks: CSVParsedBook[] = []
    const errors: GeminiValidationError[] = []

    parsed.forEach((book: CSVParsedBook, index: number) => {
      const hasValidAuthor = book.author && book.author.trim().length > 0

      if (!hasValidAuthor) {
        errors.push({
          rowNumber: index + 2, // +2 for 1-based indexing + CSV header
          message: `Book "${book.title || '(untitled)'}" has missing or whitespace-only author`,
          code: book.author ? 'whitespace_author' : 'missing_author',
          field: 'author',
          value: book.author || '(empty)',
          title: book.title,
        })
      } else {
        validBooks.push(book)
      }
    })

    console.log(
      `[GeminiCSVProvider] parseCSVWithGemini parsed ${validBooks.length} valid books, ${errors.length} validation errors, token usage:`,
      JSON.stringify(tokenUsage, null, 2),
    )

    const totalDurationMs = Date.now() - startTime
    const totalRows = validBooks.length + errors.length
    const errorRate = totalRows > 0 ? errors.length / totalRows : 0

    // Build telemetry event for A/B testing
    let telemetry: CSVParseABTestEvent | undefined
    if (enableTelemetry && options?.jobId && options?.userId) {
      telemetry = {
        type: 'CSV_AB_TEST',
        jobId: options.jobId,
        userId: options.userId,
        model: selectedModel,
        csvMetadata: {
          sizeBytes: csvText.length,
          estimatedRows: totalRows,
        },
        performance: {
          durationMs: totalDurationMs,
          apiLatencyMs,
          cacheHit: false, // Set by caller if cache hit
        },
        results: {
          validBooks: validBooks.length,
          validationErrors: errors.length,
          errorRate,
        },
        tokenUsage: {
          promptTokens,
          outputTokens,
          totalTokens,
        },
        success: true,
        timestamp: new Date().toISOString(),
      }
    }

    return {
      books: validBooks,
      errors,
      telemetry,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Log error telemetry for A/B testing
    if (enableTelemetry && options?.jobId && options?.userId) {
      const totalDurationMs = Date.now() - startTime
      const telemetry: CSVParseABTestEvent = {
        type: 'CSV_AB_TEST',
        jobId: options.jobId,
        userId: options.userId,
        model: selectedModel,
        csvMetadata: {
          sizeBytes: csvText.length,
          estimatedRows: 0,
        },
        performance: {
          durationMs: totalDurationMs,
          apiLatencyMs: apiLatencyMs || 0,
          cacheHit: false,
        },
        results: {
          validBooks: 0,
          validationErrors: 0,
          errorRate: 1.0,
        },
        tokenUsage: {
          promptTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        success: false,
        errorMessage,
        timestamp: new Date().toISOString(),
      }

      console.error('[GeminiCSVProvider] A/B Test Failure:', JSON.stringify(telemetry, null, 2))
    }

    throw new Error(`Invalid JSON from Gemini: ${errorMessage}`)
  }
}
