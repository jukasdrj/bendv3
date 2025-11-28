/**
 * Normalizes book title for cache key generation and search matching
 * - Unicode NFC normalization (prevents duplicates for é vs e+́)
 * - Lowercase for case-insensitive matching
 * - Trim whitespace
 * - Remove leading articles (the, a, an) for better deduplication
 * - Remove punctuation for fuzzy matching
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFC') // Unicode canonical composition
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/, "") // "The Hobbit" → "hobbit"
    .replace(/[^a-z0-9\s]/g, ""); // Remove punctuation
}

/**
 * Normalizes ISBN for cache key generation
 * - Remove only hyphens and spaces (common in valid ISBNs)
 * - Preserve other characters for validation to catch
 * - Normalize 'x' to 'X' for ISBN-10 check digit
 */
export function normalizeISBN(isbn: string): string {
  return isbn
    .trim()
    .replace(/[-\s]/g, "") // Remove only hyphens and spaces
    .toUpperCase(); // Normalize 'x' to 'X' for ISBN-10 check digit
}

/**
 * Normalizes author name for cache matching
 * - Unicode NFC normalization (prevents duplicates for é vs e+́)
 * - Lowercase
 * - Trim whitespace
 */
export function normalizeAuthor(author: string): string {
  return author.normalize('NFC').toLowerCase().trim();
}

/**
 * Normalizes image URL for cache key generation
 * - Remove query parameters (tracking, sizing hints)
 * - Normalize protocol (http → https)
 * - Trim whitespace
 */
export function normalizeImageURL(url: string): string {
  try {
    const parsed = new URL(url.trim());
    // Remove query params (e.g., ?zoom=1, ?source=gbs_api)
    parsed.search = "";
    // Force HTTPS
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    // Invalid URL, return as-is
    return url.trim();
  }
}
