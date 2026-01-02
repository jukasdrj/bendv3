// src/prompts/csv-parser-prompt.ts

/**
 * Prompt version for tracking changes
 */
export const PROMPT_VERSION = 'v1'

/**
 * Build the CSV parser prompt for Gemini AI
 *
 * This prompt instructs the AI to parse CSV exports from Goodreads, LibraryThing,
 * or StoryGraph and return structured JSON with normalized book data.
 *
 * @returns Complete prompt string for CSV parsing
 */
export function buildCSVParserPrompt(): string {
  return `You are a book data parser. Parse this CSV file and return a JSON array of books.

INPUT FORMAT: The CSV may be from Goodreads, LibraryThing, or StoryGraph.
Common columns: Title, Author, ISBN, ISBN13, Publisher, Year Published, Date Read, My Rating, Bookshelves, etc.
Some CSVs might contain columns with external identifiers like 'Book Id' (Goodreads), or URLs containing OpenLibrary IDs.

Map common header variations:
- "Book Title" OR "Title" → "title"
- "Author Name" OR "Author" OR "Authors" OR "Writer" OR "Written By" OR "By" OR "Creator" → "author"
- "ISBN" OR "ISBN13" → "isbn"
- "My Rating" OR "Rating" → "userRating"
- "Exclusive Shelf" OR "Read Status" → "readingStatus"
- "Book Id" (Goodreads) -> "goodreadsId"

FEW-SHOT EXAMPLES:

Example 1 (Goodreads with ISBN):
CSV Row: Title,Author,ISBN13,My Rating,Exclusive Shelf,Date Read
         The Great Gatsby,F. Scott Fitzgerald,9780743273565,4,read,2024-03-15

JSON Output:
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "9780743273565",
  "userRating": 4,
  "readingStatus": "read",
  "dateRead": "2024-03-15",
  "authorGender": "male",
  "authorCulturalRegion": "northAmerica",
  "genre": "fiction",
  "languageCode": "en"
}

Example 2 (LibraryThing without ISBN, but has OpenLibrary ID in a URL):
CSV Row: Book Title,Author Name,Rating,Tags,Notes
         Beloved,Toni Morrison,5,american-literature;historical,"From OpenLibrary: https://openlibrary.org/works/OL45804W"

JSON Output:
{
  "title": "Beloved",
  "author": "Toni Morrison",
  "isbn": null,
  "openLibraryId": "OL45804W",
  "userRating": 5,
  "shelves": ["american-literature", "historical"],
  "authorGender": "female",
  "authorCulturalRegion": "northAmerica",
  "genre": "fiction",
  "languageCode": "en"
}

Example 3 (Goodreads without ISBN, but with Book Id):
CSV Row: Title,Author,Exclusive Shelf,Book Id
         Infinite Jest,David Foster Wallace,dnf,17163

JSON Output:
{
  "title": "Infinite Jest",
  "author": "David Foster Wallace",
  "readingStatus": "dnf",
  "isbn": null,
  "goodreadsId": "17163",
  "authorGender": "male",
  "authorCulturalRegion": "northAmerica",
  "genre": "fiction",
  "languageCode": "en"
}

Example 4 (Multiple authors):
CSV Row: Title,Authors,ISBN13,Rating
         Good Omens,"Neil Gaiman, Terry Pratchett",9780060853983,5

JSON Output:
{
  "title": "Good Omens",
  "author": "Neil Gaiman, Terry Pratchett",
  "isbn": "9780060853983",
  "userRating": 5,
  "authorGender": "male",
  "authorCulturalRegion": "europe",
  "genre": "fantasy",
  "languageCode": "en"
}

Example 5 (Author in "Writer" column, embedded in title):
CSV Row: Writer,Book,Year
         ,"1984 by George Orwell",1949

JSON Output:
{
  "title": "1984",
  "author": "George Orwell",
  "isbn": null,
  "publishedYear": 1949,
  "authorGender": "male",
  "authorCulturalRegion": "europe",
  "genre": "fiction",
  "languageCode": "en"
}

OUTPUT SCHEMA: Return ONLY a valid JSON array with this structure:
[
  {
    "title": string,
    "author": string,
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
    "shelves": string[] | null,
    "authorGender": "male" | "female" | "nonBinary" | "unknown",
    "authorCulturalRegion": "africa" | "asia" | "europe" | "northAmerica" | "southAmerica" | "oceania" | "middleEast" | "unknown",
    "genre": string | null,
    "languageCode": string | null
  }
]

RULES:
1.  PRIORITIZE ISBN: If ISBN13 exists, use it for the 'isbn' field. If not, use ISBN10.
1a. AUTHOR EXTRACTION IS CRITICAL: If the author column is empty but the title contains "by [Author Name]", extract the author from the title. Multiple authors should be preserved as a comma-separated string.
1b. ISBN VALIDATION IS CRITICAL:
    - Return ONLY valid ISBN-10 (exactly 10 characters) or ISBN-13 (exactly 13 digits starting with 978 or 979)
    - Remove all hyphens, spaces, and other separators before validation
    - ISBN-10 may end with 'X' (checksum digit) - convert to ISBN-13 by: prefix "978", drop the X, recalculate check digit
    - If ISBN has wrong digit count (e.g., 11 or 12 digits), return null instead
    - If ISBN contains non-numeric characters (except trailing X for ISBN-10), return null
    - NEVER return malformed ISBNs - prefer null over invalid data
2.  ALTERNATIVE IDs: If no ISBN is present, look for other identifiers:
    -   Look for Goodreads Book Ids in a "Book Id" column and map to "goodreadsId".
    -   Look for OpenLibrary work IDs (e.g., 'OL...W') in any column, often in URLs, and map to "openLibraryId".
    -   Look for Google Books Volume IDs (e.g., 'zyTCAlFPStIC') in any column and map to "googleBooksId".
3.  Set 'isbn' and other ID fields to null if not found.
4.  Normalize reading status to one of: "read", "reading", "to-read", "wishlist", "dnf"
5.  Extract numeric rating (0-5 scale)
6.  Parse date strings to ISO 8601 format (YYYY-MM-DD)
7.  Infer authorGender from name (male/female/nonBinary/unknown) - if uncertain, use "unknown"
8.  Infer authorCulturalRegion from author name/publisher context - if uncertain, use "unknown"
9.  Classify genre into one of: fiction, non-fiction, sci-fi, fantasy, mystery, romance, thriller, biography, history, self-help, poetry. If unsure, set to null.
10. Detect language from title/publisher (ISO 639-1 code)
11. If a field is missing or unclear, set to null
12. If a row is malformed or empty, skip it and continue processing
13. Do NOT include any text outside the JSON array

IMPORTANT: Cultural inference (authorGender, authorCulturalRegion) is AI-generated and may be inaccurate. When uncertain, prefer "unknown" over guessing.`
}
