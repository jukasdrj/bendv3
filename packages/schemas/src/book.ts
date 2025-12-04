/**
 * Book domain schemas for BooksTrack API
 *
 * Core book metadata schema used across all endpoints.
 */

import { z } from 'zod'

/**
 * Data provider enumeration
 */
export const ProviderSchema = z.enum([
  'alexandria',
  'google_books',
  'open_library',
  'isbndb'
])

export type Provider = z.infer<typeof ProviderSchema>

/**
 * Core book metadata schema
 * Matches the canonical book object from Alexandria/Google Books
 */
export const BookSchema = z.object({
  isbn: z.string().length(13).describe('13-digit ISBN (example: 9780439708180)'),
  isbn10: z.string().length(10).optional().describe('10-digit ISBN if available (example: 0439708184)'),
  title: z.string().min(1).describe('Book title'),
  subtitle: z.string().optional().describe('Book subtitle'),
  authors: z.array(z.string()).describe('List of author names'),
  publisher: z.string().optional().describe('Publisher name'),
  publishedDate: z.string().optional().describe('Publication date (ISO 8601 or partial format)'),
  description: z.string().optional().describe('Book description/synopsis'),
  pageCount: z.number().int().positive().optional().describe('Number of pages'),
  categories: z.array(z.string()).optional().describe('Book categories/genres'),
  language: z.string().optional().describe('ISO 639-1 language code (e.g., "en")'),
  coverUrl: z.string().url().optional().describe('Cover image URL'),
  thumbnailUrl: z.string().url().optional().describe('Thumbnail image URL'),
  workKey: z.string().optional().describe('OpenLibrary work key (e.g., OL82563W)'),
  editionKey: z.string().optional().describe('OpenLibrary edition key (e.g., OL7353617M)'),
  provider: ProviderSchema.describe('Data source provider'),
  quality: z.number().min(0).max(100).describe('Data quality score 0-100')
})

export type Book = z.infer<typeof BookSchema>

/**
 * ISBN validation schema for path/query parameters
 * Supports both ISBN-10 and ISBN-13
 */
export const ISBNSchema = z.string()
  .regex(/^\d{10}(\d{3})?$/, 'Must be ISBN-10 or ISBN-13')
  .describe('10 or 13 digit ISBN')

export type ISBN = z.infer<typeof ISBNSchema>
