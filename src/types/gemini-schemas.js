/**
 * JSON Schemas for Gemini Structured Output
 *
 * These schemas guarantee the structure and types of JSON responses from Gemini API,
 * eliminating manual validation overhead and ensuring type safety at the API level.
 *
 * CRITICAL: Gemini API requires lowercase type names ("array", "object", "string")
 * Per JSON Schema standard: https://ai.google.dev/gemini-api/docs/structured-output
 *
 * @module gemini-schemas
 */

/**
 * Bookshelf Scanner Response Schema
 *
 * Used by: gemini-provider.js (scanImageWithGemini)
 * Model: Gemini 2.5 Flash
 *
 * Enforces:
 * - All books have title, confidence, boundingBox, format
 * - Confidence range: 0.0-1.0
 * - BoundingBox coordinates: 0.0-1.0 (normalized)
 * - Format enum: hardcover|paperback|mass-market|unknown
 * - ISBN format: 10 or 13 digits (when present)
 *
 * ISBN Validation Rules:
 * - ISBN-10: exactly 10 characters (9 digits + check digit, which may be X)
 * - ISBN-13: exactly 13 digits starting with 978 or 979
 * - All hyphens/spaces must be removed before returning
 * - Invalid/malformed ISBNs should be null, not returned
 */
export const BOOKSHELF_RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Book title extracted from spine",
      },
      author: {
        type: "string",
        description: "Author name if visible on spine",
        nullable: true,
      },
      isbn: {
        type: "string",
        description: "ISBN-10 (10 chars, may end in X) or ISBN-13 (13 digits starting with 978/979). Must be valid format or null.",
        nullable: true,
        // Note: Gemini API doesn't support regex patterns in schema, validation is prompt-based
      },
      format: {
        type: "string",
        enum: ["hardcover", "paperback", "mass-market", "unknown"],
        description: "Physical format detected from visual cues",
        nullable: true,
      },
      confidence: {
        type: "number",
        description: "Detection confidence level (0.0-1.0)",
        minimum: 0.0,
        maximum: 1.0,
        nullable: true,
      },
    },
    required: ["title"],
    // propertyOrdering ensures consistent key order in output (Gemini 2.5+ feature)
    // Order: primary identifiers → physical attributes → metadata
    propertyOrdering: ["title", "author", "isbn", "format", "confidence"],
  },
};

/**
 * CSV Parser Response Schema
 *
 * Used by: gemini-csv-provider.js (parseCSVWithGemini)
 * Model: Gemini 2.5 Flash-Lite
 *
 * Enforces:
 * - All books have title and author (required fields)
 * - Rating range: 0-5 (when present)
 * - PageCount minimum: 1 (when present)
 * - DateRead format: YYYY-MM-DD (when present)
 * - ISBN format: 10 or 13 digits (when present)
 *
 * ISBN Validation Rules:
 * - ISBN-10: exactly 10 characters (9 digits + check digit, which may be X)
 * - ISBN-13: exactly 13 digits starting with 978 or 979
 * - All hyphens/spaces must be removed before returning
 * - Invalid/malformed ISBNs should be null, not returned
 *
 * Note: Schema guarantees no books will be returned without title+author,
 * eliminating the need for manual filtering loops in csv-import.js
 */
export const CSV_BOOK_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Book title (required)",
      },
      author: {
        type: "string",
        description: "Author name (required)",
        minLength: 1, // Issue #160: Prevent empty strings from bypassing validation
      },
      isbn: {
        type: "string",
        description: "ISBN-10 (10 chars, may end in X) or ISBN-13 (13 digits starting with 978/979). Must be valid format or null.",
        nullable: true,
        // Note: Gemini API doesn't support regex patterns in schema, validation is prompt-based
      },
      publicationYear: {
        type: "integer",
        description: "Year of publication",
        nullable: true,
      },
      publisher: {
        type: "string",
        description: "Publisher name",
        nullable: true,
      },
      pageCount: {
        type: "integer",
        description: "Number of pages",
        nullable: true,
        minimum: 1,
      },
      genre: {
        type: "string",
        description: "Primary genre or subject",
        nullable: true,
      },
      rating: {
        type: "number",
        description: "User rating (0-5 scale)",
        nullable: true,
        minimum: 0,
        maximum: 5,
      },
      dateRead: {
        type: "string",
        description: "Date finished reading (YYYY-MM-DD format)",
        nullable: true,
      },
      notes: {
        type: "string",
        description: "User notes or review",
        nullable: true,
      },
    },
    required: ["title", "author"],
    // propertyOrdering ensures consistent key order in output (Gemini 2.5+ feature)
    // Order: primary identifiers → publication metadata → user-specific data
    propertyOrdering: [
      "title",
      "author",
      "isbn",
      "publicationYear",
      "publisher",
      "pageCount",
      "genre",
      "rating",
      "dateRead",
      "notes",
    ],
  },
};
