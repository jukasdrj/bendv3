// src/utils/json-repair.ts
// JSON repair utilities for handling malformed Gemini API responses
// Issue #253: Addresses "Unterminated string in JSON" errors from token truncation

/**
 * Result of JSON parsing attempt with repair information
 */
export interface JSONParseResult<T = unknown> {
  /** Successfully parsed data (if successful) */
  data?: T
  /** Whether parsing succeeded */
  success: boolean
  /** Error message (if failed) */
  error?: string
  /** Whether repair was attempted */
  repairAttempted: boolean
  /** Original raw text (for debugging) */
  rawText?: string
}

/**
 * Parse JSON with automatic repair for common Gemini API truncation errors
 *
 * Handles:
 * - Unterminated strings from token limit cutoffs
 * - Missing closing braces/brackets
 * - Trailing commas
 *
 * @param text - Raw JSON text from Gemini API
 * @param options - Parsing options
 * @returns Parse result with data or error details
 */
export function parseJSONWithRepair<T = unknown>(
  text: string,
  options: {
    /** Include raw text in result for debugging */
    includeRawText?: boolean
    /** Max repair attempts before giving up */
    maxRepairAttempts?: number
  } = {},
): JSONParseResult<T> {
  const { includeRawText = false, maxRepairAttempts = 3 } = options

  // Attempt 1: Standard JSON.parse
  try {
    const data = JSON.parse(text) as T
    return {
      data,
      success: true,
      repairAttempted: false,
      ...(includeRawText && { rawText: text }),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Only attempt repair for known recoverable errors
    if (!isRecoverableJSONError(errorMessage)) {
      return {
        success: false,
        error: errorMessage,
        repairAttempted: false,
        ...(includeRawText && { rawText: text }),
      }
    }

    // Attempt repair
    let repairedText = text
    for (let attempt = 1; attempt <= maxRepairAttempts; attempt++) {
      repairedText = repairJSON(repairedText, errorMessage)

      try {
        const data = JSON.parse(repairedText) as T
        return {
          data,
          success: true,
          repairAttempted: true,
          ...(includeRawText && { rawText: text }),
        }
      } catch (_repairError) {
        // Continue to next repair attempt
        if (attempt === maxRepairAttempts) {
          return {
            success: false,
            error: `JSON repair failed after ${maxRepairAttempts} attempts: ${errorMessage}`,
            repairAttempted: true,
            ...(includeRawText && { rawText: text }),
          }
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      success: false,
      error: errorMessage,
      repairAttempted: true,
      ...(includeRawText && { rawText: text }),
    }
  }
}

/**
 * Check if a JSON parsing error is potentially recoverable
 */
function isRecoverableJSONError(errorMessage: string): boolean {
  const recoverablePatterns = [
    'Unterminated string',
    'Unexpected end of JSON',
    'Expected', // Catches "Expected '}'" etc
    'Unexpected token',
  ]

  return recoverablePatterns.some((pattern) => errorMessage.includes(pattern))
}

/**
 * Attempt to repair malformed JSON based on error type
 *
 * Strategies:
 * 1. Unterminated strings: Close the string and add necessary brackets
 * 2. Missing closing braces: Add appropriate closing brackets
 * 3. Trailing commas: Remove trailing commas before closing brackets
 */
function repairJSON(text: string, errorMessage: string): string {
  let repaired = text.trim()

  // Strategy 1: Handle unterminated strings (most common Gemini issue)
  if (errorMessage.includes('Unterminated string')) {
    // Find the last quote that might be unterminated
    const lastQuoteIndex = repaired.lastIndexOf('"')
    if (lastQuoteIndex !== -1) {
      // Check if this quote is actually unterminated by looking ahead
      const afterQuote = repaired.slice(lastQuoteIndex + 1)
      if (!afterQuote.includes('"') && !afterQuote.includes('}')) {
        // Close the string
        repaired = `${repaired.slice(0, lastQuoteIndex + 1)}"`
      }
    }
  }

  // Strategy 2: Balance brackets and braces
  repaired = balanceBrackets(repaired)

  // Strategy 3: Remove trailing commas before closing brackets
  repaired = removeTrailingCommas(repaired)

  return repaired
}

/**
 * Balance opening and closing brackets/braces in JSON text
 */
function balanceBrackets(text: string): string {
  const brackets: Record<string, string> = {
    '{': '}',
    '[': ']',
  }

  const stack: string[] = []
  let inString = false
  let escapeNext = false

  // Track which brackets need closing
  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (char === '{' || char === '[') {
      stack.push(char)
    } else if (char === '}' || char === ']') {
      stack.pop()
    }
  }

  // Add missing closing brackets
  let balanced = text
  while (stack.length > 0) {
    const open = stack.pop()!
    balanced += brackets[open]
  }

  return balanced
}

/**
 * Remove trailing commas before closing brackets (invalid JSON)
 */
function removeTrailingCommas(text: string): string {
  // Remove commas followed by optional whitespace and closing bracket
  return text
    .replace(/,(\s*})/g, '$1') // Remove trailing comma before }
    .replace(/,(\s*])/g, '$1') // Remove trailing comma before ]
}

/**
 * Validate that a value is a valid JSON array
 */
export function isValidJSONArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

/**
 * Validate that a value is a valid JSON object
 */
export function isValidJSONObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
