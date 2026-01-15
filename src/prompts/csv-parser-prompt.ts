// src/prompts/csv-parser-prompt.ts

/**
 * Prompt version for tracking changes
 * v2: Removed cultural inference, simplified genre, reduced token count
 */
export const PROMPT_VERSION = 'v2'

/**
 * Build the CSV parser prompt for Gemini AI
 *
 * This prompt instructs the AI to parse CSV exports from Goodreads, LibraryThing,
 * or StoryGraph and return structured JSON with normalized book data.
 *
 * @returns Complete prompt string for CSV parsing
 */
export function buildCSVParserPrompt(): string {
  return `Parse this CSV file from Goodreads/LibraryThing/StoryGraph and return a JSON array of books.

COLUMN MAPPING:
- Title/Book Title → "title"
- Author/Authors/Author Name → "author"
- ISBN/ISBN13 → "isbn"
- My Rating/Rating → "userRating" (0-5)
- Exclusive Shelf/Read Status → "readingStatus"
- Book Id → "goodreadsId"

EXAMPLES:

Example 1 (Goodreads with ISBN):
CSV Row: Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read
         The Great Gatsby,F. Scott Fitzgerald,9780743273565,4,read,2024-03-15

Output:
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "9780743273565",
  "userRating": 4,
  "readingStatus": "read",
  "dateRead": "2024-03-15"
}

Example 2 (OpenLibrary ID in URL):
CSV Row: Book Title,Author Name,Rating,Notes
         Beloved,Toni Morrison,5,"OpenLibrary: https://openlibrary.org/works/OL45804W"

Output:
{
  "title": "Beloved",
  "author": "Toni Morrison",
  "isbn": null,
  "openLibraryId": "OL45804W",
  "userRating": 5
}

Example 3 (Author embedded in title):
CSV Row: Book,Year
         "1984 by George Orwell",1949

Output:
{
  "title": "1984",
  "author": "George Orwell",
  "isbn": null,
  "publishedYear": 1949
}

SCHEMA - Return a JSON array:
[
  {
    "title": string (required),
    "author": string (required),
    "isbn": string | null,
    "openLibraryId": string | null,
    "googleBooksId": string | null,
    "goodreadsId": string | null,
    "publishedYear": number | null,
    "publisher": string | null,
    "pageCount": number | null,
    "userRating": number (0-5) | null,
    "readingStatus": "read" | "reading" | "to-read" | "wishlist" | "dnf" | null,
    "dateRead": string (YYYY-MM-DD) | null,
    "shelves": string[] | null
  }
]

RULES:
1. ISBN VALIDATION (CRITICAL):
   - Prefer ISBN13, fallback to ISBN10
   - Remove hyphens/spaces before validation
   - Valid: ISBN-10 (10 chars, may end in X) or ISBN-13 (13 digits, starts with 978/979)
   - Invalid ISBNs → return null (never malformed data)

2. AUTHOR EXTRACTION:
   - If author column empty but title contains "by [Name]", extract author from title
   - Preserve multiple authors as comma-separated string

3. EXTERNAL IDs:
   - Extract Goodreads "Book Id" → goodreadsId
   - Extract OpenLibrary work IDs (OL...W) from URLs → openLibraryId
   - Extract Google Books volume IDs → googleBooksId

4. NORMALIZATION:
   - Reading status → "read" | "reading" | "to-read" | "wishlist" | "dnf"
   - Ratings → 0-5 numeric scale
   - Dates → YYYY-MM-DD format

5. Missing data → set to null
6. Malformed/empty rows → skip and continue
7. Return ONLY the JSON array, no explanatory text`
}
