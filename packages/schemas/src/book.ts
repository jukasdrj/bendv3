/**
 * Book domain schemas for BooksTrack API
 *
 * Core book metadata schema used across all endpoints.
 */

import { z } from '@hono/zod-openapi'

/**
 * Data provider enumeration
 */
export const ProviderSchema = z.enum([
  'alexandria',
  'google_books',
  'open_library',
  'isbndb'
]).openapi('Provider')

export type Provider = z.infer<typeof ProviderSchema>

/**
 * Cover source enumeration - indicates where the cover image came from
 * @see alexandria-worker/types.ts BookResult.coverSource
 */
export const CoverSourceSchema = z.enum([
  'r2',                // Stored in Alexandria R2 bucket
  'external',          // Direct external URL (ISBNdb, Google Books)
  'external-fallback', // Fallback external URL
]).openapi('CoverSource')

export type CoverSource = z.infer<typeof CoverSourceSchema>

/**
 * Author reference with enriched metadata
 * @see alexandria-worker v2.2.3+ AuthorReference
 */
export const AuthorReferenceSchema = z.object({
  name: z.string().describe('Author name'),
  key: z.string().optional().describe('OpenLibrary author key (e.g., /authors/OL7234434A)'),
  openlibrary: z.string().url().optional().describe('OpenLibrary author URL'),
  bio: z.string().optional().describe('Author biography'),
  gender: z.string().optional().describe('Gender (male, female, Unknown)'),
  nationality: z.string().optional().describe('Nationality (e.g., United States, British)'),
  birth_year: z.number().int().optional().describe('Birth year'),
  death_year: z.number().int().optional().describe('Death year'),
  wikidata_id: z.string().optional().describe('Wikidata identifier (e.g., Q35064)'),
  image: z.string().url().optional().describe('Author photo URL')
}).openapi('AuthorReference')

export type AuthorReference = z.infer<typeof AuthorReferenceSchema>

/**
 * Cover URLs in multiple sizes (Alexandria v2.2.4+)
 */
export const CoverUrlsSchema = z.object({
  large: z.string().url().describe('Large cover image URL'),
  medium: z.string().url().describe('Medium cover image URL'),
  small: z.string().url().describe('Small cover image URL (thumbnail)')
}).openapi('CoverUrls')

export type CoverUrls = z.infer<typeof CoverUrlsSchema>

/**
 * Core book metadata schema
 * Matches the canonical book object from Alexandria/Google Books
 */
export const BookSchema = z.object({
  isbn: z.string().length(13).describe('13-digit ISBN (example: 9780439708180)'),
  isbn10: z.string().length(10).optional().describe('10-digit ISBN if available (example: 0439708184)'),
  title: z.string().min(1).describe('Book title'),
  subtitle: z.string().optional().describe('Book subtitle'),

  // Authors (backward compatible: string[] or AuthorReference[])
  authors: z.union([
    z.array(z.string()),
    z.array(AuthorReferenceSchema)
  ]).describe('List of authors (strings or enriched references)'),

  publisher: z.string().optional().describe('Publisher name'),
  publishedDate: z.string().optional().describe('Publication date (ISO 8601 or partial format)'),
  description: z.string().optional().describe('Book description/synopsis'),
  pageCount: z.number().int().positive().optional().describe('Number of pages'),
  categories: z.array(z.string()).optional().describe('Book categories/genres'),
  language: z.string().optional().describe('ISO 639-1 language code (e.g., "en")'),

  // Cover images (dual format for backward compatibility)
  coverUrl: z.string().url().optional().describe('Cover image URL (legacy single URL)'),
  coverUrls: CoverUrlsSchema.optional().describe('Cover images in multiple sizes (Alexandria v2.2.4+)'),
  coverSource: CoverSourceSchema.optional().describe('Source of the cover image (r2, external, external-fallback)'),
  thumbnailUrl: z.string().url().optional().describe('Thumbnail image URL (deprecated: use coverUrls.small)'),

  workKey: z.string().optional().describe('OpenLibrary work key (e.g., OL82563W)'),
  editionKey: z.string().optional().describe('OpenLibrary edition key (e.g., OL7353617M)'),
  provider: ProviderSchema.describe('Data source provider'),
  quality: z.number().min(0).max(100).describe('Data quality score 0-100')
}).openapi('Book')

export type Book = z.infer<typeof BookSchema>

/**
 * ISBN validation schema for path/query parameters
 * Supports both ISBN-10 and ISBN-13
 */
export const ISBNSchema = z.string()
  .regex(/^\d{10}(\d{3})?$/, 'Must be ISBN-10 or ISBN-13')
  .describe('10 or 13 digit ISBN')

export type ISBN = z.infer<typeof ISBNSchema>
