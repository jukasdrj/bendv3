/**
 * ISBNdb API Service
 *
 * Fetches book metadata and cover URLs from ISBNdb API.
 * Used by scheduled harvest cron to pre-populate cover cache.
 *
 * API Documentation: https://isbndb.com/apidocs
 * Rate Limit: 1000 req/day (paid tier)
 */

export class ISBNdbAPI {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("ISBNDB_API_KEY not configured");
    }
    this.apiKey = apiKey;
    this.baseUrl = "https://api2.isbndb.com";
  }

  /**
   * Fetch book data by ISBN
   * @param {string} isbn - ISBN-10 or ISBN-13
   * @returns {Promise<{image: string, title: string, authors: string[]}|null>}
   */
  async fetchBook(isbn) {
    try {
      const response = await fetch(`${this.baseUrl}/book/${isbn}`, {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json",
        },
      });

      if (response.status === 404) {
        console.log(`ISBNdb: Book not found - ${isbn}`);
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ISBNdb API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data.book) {
        console.warn(`ISBNdb: Unexpected response format for ${isbn}`, data);
        return null;
      }

      // Extract cover URL (required)
      if (!data.book.image) {
        console.log(`ISBNdb: No cover image for ${isbn}`);
        return null;
      }

      return {
        image: data.book.image,
        title: data.book.title || "Unknown",
        authors: data.book.authors || [],
        publisher: data.book.publisher || null,
        publishedDate: data.book.date_published || null,
      };
    } catch (error) {
      console.error(`ISBNdb API error for ${isbn}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch multiple books in a single batch request
   * Premium/Pro/Enterprise plans only: up to 1000 books per request
   *
   * @param {string[]} isbns - Array of ISBNs to fetch (max 1000)
   * @returns {Promise<Array<{isbn: string, image: string, title: string, authors: string[], publisher: string, publishedDate: string}>>}
   */
  async fetchBatch(isbns) {
    if (!isbns || isbns.length === 0) {
      return []
    }

    // Limit to 1000 ISBNs per batch (ISBNdb Premium limit)
    const batchSize = Math.min(isbns.length, 1000)
    const batchISBNs = isbns.slice(0, batchSize)

    try {
      // ISBNdb batch endpoint: GET /books/{isbns}
      // Format: comma-separated ISBNs
      const isbnList = batchISBNs.join(',')
      const response = await fetch(`${this.baseUrl}/books/${isbnList}`, {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ISBNdb batch API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Response format: { books: [...] }
      if (!data.books || !Array.isArray(data.books)) {
        console.warn('ISBNdb batch: Unexpected response format', data);
        return []
      }

      // Map to canonical format
      const books = data.books
        .filter(book => book && book.image) // Only keep books with covers
        .map(book => ({
          isbn: book.isbn13 || book.isbn || null,
          image: book.image,
          title: book.title || "Unknown",
          authors: book.authors || [],
          publisher: book.publisher || null,
          publishedDate: book.date_published || null,
        }))
        .filter(book => book.isbn) // Remove books without ISBNs

      console.log(`ISBNdb batch: Fetched ${books.length}/${batchISBNs.length} books with covers`)

      return books
    } catch (error) {
      console.error(`ISBNdb batch API error for ${batchISBNs.length} ISBNs:`, error.message);

      // Fallback: If batch fails, try individual requests for first 10 ISBNs
      console.log('Falling back to individual requests for first 10 ISBNs...')
      const fallbackResults = []

      for (const isbn of batchISBNs.slice(0, 10)) {
        try {
          const book = await this.fetchBook(isbn)
          if (book) {
            fallbackResults.push({ isbn, ...book })
          }
        } catch (err) {
          console.warn(`Fallback fetch failed for ${isbn}:`, err.message)
        }

        // Rate limiting: 1 req/sec for fallback
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      return fallbackResults
    }
  }

  /**
   * Search books by author name with pagination
   * Returns up to 1000 results per request (Premium plan)
   *
   * @param {string} authorName - Author name to search
   * @param {number} page - Page number (default: 1)
   * @param {number} pageSize - Results per page (max 1000, default: 100)
   * @returns {Promise<{total: number, books: Array}>}
   */
  async searchByAuthor(authorName, page = 1, pageSize = 100) {
    try {
      const url = new URL(`${this.baseUrl}/author/${encodeURIComponent(authorName)}`)
      url.searchParams.set('page', page.toString())
      url.searchParams.set('pageSize', Math.min(pageSize, 1000).toString())

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json",
        },
      });

      if (response.status === 404) {
        console.log(`ISBNdb: Author not found - ${authorName}`)
        return { total: 0, books: [] }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ISBNdb author search error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Response format: { total: number, books: [...] }
      return {
        total: data.total || 0,
        books: (data.books || []).map(book => ({
          isbn: book.isbn13 || book.isbn || null,
          image: book.image,
          title: book.title || "Unknown",
          authors: book.authors || [],
          publisher: book.publisher || null,
          publishedDate: book.date_published || null,
        })).filter(book => book.isbn)
      }
    } catch (error) {
      console.error(`ISBNdb author search error for ${authorName}:`, error.message);
      return { total: 0, books: [] }
    }
  }

  /**
   * Health check - verify API key is valid
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      // Use a known good ISBN for testing (verified working: 1984 by George Orwell)
      const testISBN = "9780451524935"; // 1984 by George Orwell
      const response = await fetch(`${this.baseUrl}/book/${testISBN}`, {
        method: "GET",
        headers: {
          Authorization: this.apiKey,
          Accept: "application/json",
        },
      });

      return response.ok || response.status === 404; // 404 is OK (means auth passed)
    } catch (error) {
      console.error("ISBNdb health check failed:", error);
      return false;
    }
  }
}
