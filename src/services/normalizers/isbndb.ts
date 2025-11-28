/**
 * ISBNdb API → Canonical DTO Normalizers
 */

import type { WorkDTO, EditionDTO, AuthorDTO } from "../../types/canonical.js";
import type { EditionFormat } from "../../types/enums.js";
import { GenreNormalizer } from "../genre-normalizer.js";
import { getPlaceholderCover } from "../../utils/book-metadata.js";
import { ISBNDB_QUALITY_WEIGHTS as W } from "../../utils/quality-scoring.js";
import { extractYear } from "../../utils/date-utils.js";

// Create genre normalizer instance (reused across all normalizations)
const genreNormalizer = new GenreNormalizer();

/**
 * Normalize ISBNdb binding to EditionFormat
 * ISBNdb provides: "Hardcover", "Paperback", "Mass Market Paperback", "eBook", "Library Binding", etc.
 */
function normalizeBinding(binding?: string): EditionFormat {
  if (!binding) return "Paperback";

  const bindingLower = binding.toLowerCase();

  if (bindingLower.includes("hardcover") || bindingLower.includes("hardback")) {
    return "Hardcover";
  }
  if (
    bindingLower.includes("paperback") ||
    bindingLower.includes("trade paper")
  ) {
    return "Paperback";
  }
  if (
    bindingLower.includes("ebook") ||
    bindingLower.includes("kindle") ||
    bindingLower.includes("digital")
  ) {
    return "E-book";
  }
  if (bindingLower.includes("audio")) {
    return "Audiobook";
  }

  // Default to Paperback
  return "Paperback";
}

/**
 * Normalize ISBNdb book to WorkDTO
 */
export function normalizeISBNdbToWork(book: any): WorkDTO {
  return {
    title: book.title || "Unknown",
    subjectTags: genreNormalizer.normalize(book.subjects || [], "isbndb"),
    originalLanguage: book.language || undefined,
    firstPublicationYear: extractYear(book.date_published),
    description: book.synopsis || undefined,
    synthetic: false,
    primaryProvider: "isbndb",
    contributors: ["isbndb"],
    isbndbID: book.isbn13 || book.isbn || undefined, // Fallback to ISBN-10 if ISBN-13 missing
    goodreadsWorkIDs: [],
    amazonASINs: [],
    librarythingIDs: [],
    googleBooksVolumeIDs: [],
    isbndbQuality: calculateISBNdbQuality(book),
    reviewStatus: "verified",
  };
}

/**
 * Normalize ISBNdb book to EditionDTO
 */
export function normalizeISBNdbToEdition(book: any): EditionDTO {
  const isbn13 = book.isbn13;
  const isbn10 = book.isbn;
  const isbns = [isbn13, isbn10].filter(Boolean) as string[];

  return {
    isbn: isbn13 || isbn10,
    isbns,
    title: book.title,
    publisher: book.publisher,
    publicationDate: book.date_published,
    pageCount: book.pages,
    format: normalizeBinding(book.binding),
    coverImageURL: book.image || getPlaceholderCover(),
    editionTitle: book.title_long !== book.title ? book.title_long : undefined,
    editionDescription: book.synopsis,
    language: book.language,
    primaryProvider: "isbndb",
    contributors: ["isbndb"],
    isbndbID: book.isbn13 || book.isbn || undefined, // Fallback to ISBN-10 if ISBN-13 missing
    amazonASINs: [],
    googleBooksVolumeIDs: [],
    librarythingIDs: [],
    isbndbQuality: calculateISBNdbQuality(book),
  };
}

/**
 * Normalize ISBNdb author name to AuthorDTO
 *
 * Note: Returns base AuthorDTO with Unknown gender.
 * Cultural diversity enrichment (Wikidata) happens later in enrichment pipeline.
 */
export function normalizeISBNdbToAuthor(authorName: string): AuthorDTO {
  return {
    name: authorName,
    gender: "Unknown", // Enriched via Wikidata in enrichment service
  };
}

/**
 * Calculate quality score for ISBNdb data (0-100)
 * Based on completeness and publisher reputation
 */
function calculateISBNdbQuality(book: any): number {
  let score = W.BASE; // Base score

  // Add points for data completeness
  if (book.image) score += W.IMAGE;
  if (book.synopsis && book.synopsis.length > 50) score += W.SYNOPSIS;
  if (book.pages && book.pages > 0) score += W.PAGES;
  if (book.publisher) score += W.PUBLISHER;
  if (book.subjects && book.subjects.length > 0) score += W.SUBJECTS;
  if (book.authors && book.authors.length > 0) score += W.AUTHORS;

  // Ensure score is always a valid number between 0-100
  const finalScore = Math.min(Math.max(score, 0), 100);
  return isNaN(finalScore) ? W.BASE : finalScore; // Default to base score if NaN
}
