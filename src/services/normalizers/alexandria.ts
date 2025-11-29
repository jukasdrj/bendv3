/**
 * Alexandria (Local OpenLibrary PostgreSQL) → Canonical DTO Normalizers
 * 
 * Alexandria provides access to 54M+ books from a local OpenLibrary database dump.
 * This normalizer converts Alexandria API responses to bendv3's canonical DTOs.
 * 
 * Alexandria API: https://alexandria.ooheynerds.com
 * Database: PostgreSQL with 250GB of OpenLibrary data
 * 
 * @see TODO-ALEXANDRIA-INTEGRATION.md for integration plan
 */

import type { WorkDTO, EditionDTO, AuthorDTO } from "../../types/canonical.js";
import { getPlaceholderCover } from "../../utils/book-metadata.js";
import { extractYear } from "../../utils/date-utils.js";

/**
 * Alexandria ISBN lookup result structure
 */
export interface AlexandriaResult {
  title?: string;
  author?: string;
  isbn: string;
  publish_date?: string;
  publishers?: string[];
  pages?: string;
  work_title?: string;
  openlibrary_edition?: string; // e.g., "https://openlibrary.org/books/OL..."
  openlibrary_work?: string;    // e.g., "https://openlibrary.org/works/OL..."
}

/**
 * Normalize Alexandria result to WorkDTO
 */
export function normalizeAlexandriaToWork(result: AlexandriaResult): WorkDTO {
  const workOLID = extractOLID(result.openlibrary_work);
  const editionOLID = extractOLID(result.openlibrary_edition);
  
  return {
    // Required fields
    title: result.work_title || result.title || "Unknown",
    subjectTags: [], // Alexandria doesn't return subjects yet - enrichment needed
    
    // Optional metadata
    firstPublicationYear: extractYear(result.publish_date),
    coverImageURL: editionOLID 
      ? `https://covers.openlibrary.org/b/olid/${editionOLID}-L.jpg`
      : getPlaceholderCover(),
    
    // Provenance
    synthetic: false,
    primaryProvider: "alexandria" as any, // TODO: Add to DataProvider enum
    contributors: ["alexandria"] as any[],
    
    // External IDs
    openLibraryWorkID: workOLID,
    goodreadsWorkIDs: [],
    amazonASINs: [],
    librarythingIDs: [],
    googleBooksVolumeIDs: [],
    
    // Quality metrics
    isbndbQuality: 0,
    reviewStatus: "verified" as const,
  };
}

/**
 * Normalize Alexandria result to EditionDTO
 */
export function normalizeAlexandriaToEdition(result: AlexandriaResult): EditionDTO {
  const editionOLID = extractOLID(result.openlibrary_edition);
  
  return {
    // Identifiers
    isbn: result.isbn,
    isbns: [result.isbn].filter(Boolean),
    
    // Core metadata
    title: result.title,
    publisher: result.publishers?.[0],
    publicationDate: result.publish_date,
    pageCount: result.pages ? parseInt(result.pages, 10) : undefined,
    format: "Paperback" as const, // Default - Alexandria doesn't provide format
    coverImageURL: editionOLID
      ? `https://covers.openlibrary.org/b/olid/${editionOLID}-L.jpg`
      : getPlaceholderCover(),
    
    // Provenance
    primaryProvider: "alexandria" as any,
    contributors: ["alexandria"] as any[],
    
    // External IDs
    openLibraryEditionID: editionOLID,
    amazonASINs: [],
    googleBooksVolumeIDs: [],
    librarythingIDs: [],
    
    // Quality metrics
    isbndbQuality: 0,
  };
}

/**
 * Normalize author name to AuthorDTO
 * 
 * Note: Alexandria only provides author names.
 * Additional enrichment (gender, nationality, etc.) comes from Wikidata.
 */
export function normalizeAlexandriaToAuthor(authorName: string): AuthorDTO {
  return {
    name: authorName,
    gender: "Unknown" as const, // Enriched via Wikidata in enrichment service
  };
}

/**
 * Extract OpenLibrary ID from full URL
 * 
 * @example
 * extractOLID("https://openlibrary.org/books/OL7353617M") → "OL7353617M"
 * extractOLID("https://openlibrary.org/works/OL45804W") → "OL45804W"
 * extractOLID(undefined) → undefined
 */
function extractOLID(url?: string): string | undefined {
  if (!url) return undefined;
  
  // Match OL followed by alphanumeric characters
  const match = url.match(/\/(OL\w+)/);
  return match ? match[1] : undefined;
}
