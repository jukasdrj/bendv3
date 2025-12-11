/**
 * @file Utility functions for managing and applying confidence thresholds.
 * This module centralizes logic for retrieving a configurable confidence threshold
 * and categorizing books based on their confidence scores.
 */

/**
 * Minimal environment interface required by confidence utilities.
 * Assumes `CONFIDENCE_THRESHOLD` is an optional string environment variable.
 */
interface Env {
  CONFIDENCE_THRESHOLD?: string;
}

/**
 * Represents a book object with a confidence score.
 * This interface is used to type-hint objects processed by `categorizeBooks`.
 */
interface BookWithConfidence {
  confidence: number;
  // Other properties can be added here if needed for broader context,
  // but `confidence` is the only one strictly required by these functions.
}

/**
 * Retrieves the confidence threshold from environment variables,
 * applying validation and a fallback default.
 *
 * It parses the `CONFIDENCE_THRESHOLD` environment variable as a float.
 * If the variable is not set, is empty, or cannot be parsed as a number,
 * or if the parsed number is outside the valid range [0.0, 1.0],
 * it defaults to 0.6. A warning is logged for invalid configurations.
 *
 * @param {Env} env - The environment object containing configuration.
 * @returns {number} The validated confidence threshold (0.0 to 1.0).
 */
export function getConfidenceThreshold(env: Env): number {
  const defaultThreshold = 0.6;
  const rawThreshold = env.CONFIDENCE_THRESHOLD;

  if (
    rawThreshold === undefined ||
    rawThreshold === null ||
    rawThreshold === ""
  ) {
    return defaultThreshold;
  }

  const parsedThreshold = parseFloat(rawThreshold);

  if (
    isNaN(parsedThreshold) ||
    parsedThreshold < 0.0 ||
    parsedThreshold > 1.0
  ) {
    // Log a warning for invalid configuration, but don't crash the application.
    // Fallback to default to ensure graceful degradation.
    console.warn(
      `[Confidence Utility] Invalid CONFIDENCE_THRESHOLD '${rawThreshold}' found in environment. ` +
        `Expected a number between 0.0 and 1.0. Falling back to default: ${defaultThreshold}.`,
    );
    return defaultThreshold;
  }

  return parsedThreshold;
}

/**
 * Categorizes a list of books into high, medium, and low confidence buckets.
 *
 * Thresholds:
 * - high: confidence >= 0.8
 * - medium: 0.5 <= confidence < 0.8
 * - low: confidence < 0.5
 *
 * @template T - A type extending `BookWithConfidence` to preserve original book object types.
 * @param {T[]} books - An array of book objects, each expected to have a 'confidence' property.
 * @returns {{ high: T[]; medium: T[]; low: T[] }} An object containing three arrays by confidence level.
 */
export function categorizeBooks<T extends BookWithConfidence>(
  books: T[],
): { high: T[]; medium: T[]; low: T[] } {
  const HIGH_THRESHOLD = 0.8;
  const MEDIUM_THRESHOLD = 0.5;

  const high: T[] = [];
  const medium: T[] = [];
  const low: T[] = [];

  for (const book of books) {
    const confidence = book.confidence ?? 0;
    if (confidence >= HIGH_THRESHOLD) {
      high.push(book);
    } else if (confidence >= MEDIUM_THRESHOLD) {
      medium.push(book);
    } else {
      low.push(book);
    }
  }

  return { high, medium, low };
}
