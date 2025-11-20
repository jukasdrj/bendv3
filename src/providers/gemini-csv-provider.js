// src/providers/gemini-csv-provider.js
// Issue #179: Retry logic with exponential backoff for Gemini API failures

import { CSV_BOOK_SCHEMA } from "../types/gemini-schemas.js";
import { retryWithBackoff } from "../utils/retry.js";

const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

/**
 * Sanitize CSV text to prevent prompt injection attacks
 *
 * Security measures:
 * - Escape special characters that could break out of context
 * - Remove control characters that could inject commands
 * - Truncate excessive input to prevent token exhaustion attacks
 *
 * @param {string} csvText - Raw CSV content
 * @returns {string} Sanitized CSV content safe for use in prompts
 */
function sanitizeCSVForPrompt(csvText) {
  // Approximates Gemini 2.0 Flash 2M token context (assuming ~4 bytes per token)
  // Issue #181: Aligned with MAX_FILE_SIZE in csv-import.ts for consistency
  const MAX_CSV_SIZE = 8 * 1024 * 1024; // 8MB

  if (csvText.length > MAX_CSV_SIZE) {
    throw new Error(
      `CSV too large for processing (max ${MAX_CSV_SIZE / 1024 / 1024}MB to fit 2M token limit)`,
    );
  }

  // Remove control characters that could inject instructions
  // Keep only printable ASCII, tabs, newlines, and common Unicode characters
  let sanitized = csvText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Escape special characters that could break prompt context
  sanitized = sanitized
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/`/g, "\\`") // Escape backticks (code blocks)
    .replace(/\${/g, "\\${"); // Escape template literals

  // Remove suspicious instruction patterns (case-insensitive)
  const suspiciousPatterns = [
    /ignore\s+(previous|all|prior)\s+instructions?/gi,
    /new\s+instructions?:/gi,
    /system\s*:/gi,
    /override\s+(instructions?|system)/gi,
    /disregard\s+(previous|prior|all)/gi,
  ];

  for (const pattern of suspiciousPatterns) {
    sanitized = sanitized.replace(pattern, "[REMOVED_SUSPICIOUS_CONTENT]");
  }

  return sanitized;
}

/**
 * Parse CSV file using Gemini 2.5 Flash-Lite API
 *
 * Features:
 * - System instructions for role definition (Gemini best practice)
 * - Low temperature (0.1) for maximum determinism with Flash-Lite
 * - responseMimeType for guaranteed JSON output (no markdown stripping needed)
 * - responseSchema for type safety (Gemini enforces title+author requirement)
 * - Supports large CSVs (up to 8K tokens output)
 * - SECURITY: Input sanitization to prevent prompt injection attacks
 *
 * @param {string} csvText - Raw CSV content
 * @param {string} prompt - Gemini prompt with few-shot examples
 * @param {string} apiKey - Gemini API key from env.GEMINI_API_KEY
 * @returns {Promise<Array<Object>>} Parsed book data (guaranteed to have title+author)
 * @throws {Error} If API call fails or response is invalid
 */
export async function parseCSVWithGemini(csvText, prompt, apiKey) {
  // SECURITY FIX (#177): Sanitize CSV content to prevent prompt injection
  const sanitizedCSV = sanitizeCSVForPrompt(csvText);
  const fullPrompt = `${prompt}\n\nCSV Data:\n${sanitizedCSV}`;

  // Issue #179: Wrap fetch with retry logic (exponential backoff on transient failures)
  const response = await retryWithBackoff(async () => {
    const res = await fetch(GEMINI_API_ENDPOINT, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
        responseMimeType: "application/json", // Force JSON output (eliminates markdown code blocks)
        responseSchema: CSV_BOOK_SCHEMA, // Schema-enforced validation (guarantees title+author)
        stopSequences: ["\n\n\n"], // Stop on triple newline (prevents unnecessary continuation)
      },
    }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Gemini API error: ${res.status} - ${error}`);
    }

    return res;
  });

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

  // Extract token usage metrics (Gemini API best practice: cost tracking)
  const tokenUsage = data.usageMetadata || {};
  const promptTokens = tokenUsage.promptTokenCount || 0;
  const outputTokens = tokenUsage.candidatesTokenCount || 0;
  const totalTokens = tokenUsage.totalTokenCount || 0;

  console.log(
    `[GeminiCSVProvider] Token usage - Prompt: ${promptTokens}, Output: ${outputTokens}, Total: ${totalTokens}`,
  );

  if (!textResponse) {
    throw new Error("Gemini returned empty response");
  }

  // With structured output, response is guaranteed to be valid JSON matching schema
  try {
    const parsed = JSON.parse(textResponse);

    // Lightweight defensive check: Catches API bugs, not schema violations
    // (Schema guarantees array of books with title+author, but we verify to catch unexpected API changes)
    if (!Array.isArray(parsed)) {
      throw new Error("Schema violation: Expected array, got " + typeof parsed);
    }

    // Schema guarantees all books have title+author, no manual filtering needed
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON from Gemini: ${error.message}`);
  }
}
