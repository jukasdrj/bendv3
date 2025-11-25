/**
 * JSON Validation Utilities
 *
 * Provides application-level JSON validation as a backup to database CHECK constraints.
 * Used before INSERT/UPDATE operations to ensure data integrity.
 */

export interface ValidationResult {
  valid: boolean
  error?: string
  field?: string
}

/**
 * Validate that a value is valid JSON
 */
export function isValidJSON(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true // NULL is allowed
  }

  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return true
    } catch {
      return false
    }
  }

  if (typeof value === 'object') {
    try {
      JSON.stringify(value)
      return true
    } catch {
      return false
    }
  }

  return false
}

/**
 * Validate book metadata fields before database operations
 */
export function validateBookMetadata(
  canonicalMetadata: unknown,
  providerMetadata?: unknown
): ValidationResult {
  // canonical_metadata is required and must be valid JSON
  if (!canonicalMetadata) {
    return {
      valid: false,
      error: 'canonical_metadata is required',
      field: 'canonical_metadata',
    }
  }

  if (!isValidJSON(canonicalMetadata)) {
    return {
      valid: false,
      error: 'canonical_metadata is not valid JSON',
      field: 'canonical_metadata',
    }
  }

  // provider_metadata is optional but must be valid JSON if provided
  if (providerMetadata !== null && providerMetadata !== undefined) {
    if (!isValidJSON(providerMetadata)) {
      return {
        valid: false,
        error: 'provider_metadata is not valid JSON',
        field: 'provider_metadata',
      }
    }
  }

  return { valid: true }
}

/**
 * Safe JSON stringify with error handling
 */
export function safeStringify(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch (error) {
    console.error('JSON stringify failed:', error)
    return null
  }
}

/**
 * Safe JSON parse with error handling
 */
export function safeParse<T = unknown>(value: string | null | undefined): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.error('JSON parse failed:', error)
    return null
  }
}
