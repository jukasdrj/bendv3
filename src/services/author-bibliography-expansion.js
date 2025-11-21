/**
 * Author Bibliography Expansion Service
 *
 * Discovers complete author bibliographies and expands each work into multiple editions.
 * This enables comprehensive coverage of an author's catalog for cover harvesting.
 *
 * Flow:
 * 1. Author Name → OpenLibrary: Get all Works
 * 2. For each Work → Google Books: Discover 2-3 best editions
 * 3. Return: Complete ISBN list for harvest
 */

import { getTopEditions } from "./edition-discovery.js";
import { RateLimiter } from "../utils/rate-limiter.js";

/**
 * Expand author bibliography into ISBNs
 * @param {string} authorName - Author name to expand
 * @param {Object} env - Worker environment bindings
 * @param {Object} options - Expansion options
 * @param {number} options.maxWorks - Max works to process (default: 20)
 * @param {number} options.editionsPerWork - Editions per work (default: 3)
 * @param {number} options.minPublicationYear - Filter by year (default: 2000)
 * @returns {Promise<{success: boolean, author: string, stats: Object, isbns: string[]}>}
 */
export async function expandAuthorBibliography(authorName, env, options = {}) {
  const {
    maxWorks = 20,
    editionsPerWork = 3,
    minPublicationYear = 2000,
  } = options;

  const allISBNs = new Set();
  const stats = {
    worksDiscovered: 0,
    worksProcessed: 0,
    editionsDiscovered: 0,
    isbnsHarvested: 0,
    skipped: 0,
  };

  try {
    console.log(`📚 Fetching bibliography for: ${authorName}`);

    // Step 1: Get author's complete bibliography from OpenLibrary
    const bibliography = await fetchOpenLibraryAuthorWorks(authorName);

    if (!bibliography || !bibliography.works || bibliography.works.length === 0) {
      console.warn(`No works found for author: ${authorName}`);
      return { success: false, author: authorName, stats, isbns: [] };
    }

    stats.worksDiscovered = bibliography.works.length;
    console.log(`Found ${stats.worksDiscovered} works by ${authorName}`);

    // Step 2: Filter and prioritize works
    const prioritizedWorks = bibliography.works
      .filter((work) => {
        // Skip works without titles
        if (!work.title) return false;

        // Filter by publication year (if available)
        const year = parseInt(work.first_publish_year || "0");
        // If no year data, include it (we'll discover via Google Books)
        return year === 0 || year >= minPublicationYear;
      })
      .sort((a, b) => {
        // Sort by publication year (newest first, nulls last)
        const yearA = parseInt(a.first_publish_year || "0");
        const yearB = parseInt(b.first_publish_year || "0");
        return yearB - yearA;
      })
      .slice(0, maxWorks); // Limit to maxWorks

    console.log(
      `Prioritized to ${prioritizedWorks.length} works (${minPublicationYear}+)`,
    );

    // Step 3: For each Work, discover multiple editions
    const rateLimiter = new RateLimiter(10); // Google Books: 10 req/sec

    for (const work of prioritizedWorks) {
      await rateLimiter.acquire();

      try {
        // Discover editions for this Work
        const editions = await getTopEditions(
          {
            title: work.title,
            authors: [authorName],
          },
          env,
          editionsPerWork,
        );

        stats.worksProcessed++;

        if (editions.length === 0) {
          console.log(`  ⊗ ${work.title}: No editions found`);
          stats.skipped++;
          continue;
        }

        // Add ISBNs to set
        editions.forEach((ed) => {
          if (ed.isbn) {
            allISBNs.add(ed.isbn);
            stats.editionsDiscovered++;
          }
        });

        console.log(
          `  ✓ ${work.title} (${work.first_publish_year}): ${editions.length} editions discovered`,
        );
      } catch (error) {
        console.error(`Error discovering editions for "${work.title}":`, error);
        stats.skipped++;
      }
    }

    stats.isbnsHarvested = allISBNs.size;

    console.log(``);
    console.log(`✅ ${authorName} Bibliography Expansion Complete:`);
    console.log(`   Works discovered: ${stats.worksDiscovered}`);
    console.log(`   Works processed: ${stats.worksProcessed}`);
    console.log(`   Editions per work: ${editionsPerWork}`);
    console.log(`   Total ISBNs: ${stats.isbnsHarvested}`);
    console.log(
      `   Avg editions/work: ${(stats.editionsDiscovered / stats.worksProcessed).toFixed(1)}`,
    );
    console.log(``);

    return {
      success: true,
      author: authorName,
      stats,
      isbns: Array.from(allISBNs),
    };
  } catch (error) {
    console.error(`Bibliography expansion failed for ${authorName}:`, error);
    return {
      success: false,
      author: authorName,
      error: error.message,
      stats,
      isbns: [],
    };
  }
}

/**
 * Fetch author works from OpenLibrary API
 * @param {string} authorName - Author name
 * @returns {Promise<{works: Array}>} Author bibliography
 */
async function fetchOpenLibraryAuthorWorks(authorName) {
  try {
    // Step 1: Search for author to get OpenLibrary author key
    const searchUrl = new URL("https://openlibrary.org/search/authors.json");
    searchUrl.searchParams.set("q", authorName);

    const searchResponse = await fetch(searchUrl.toString());

    if (!searchResponse.ok) {
      console.error(
        `OpenLibrary author search failed: ${searchResponse.status}`,
      );
      return null;
    }

    const searchData = await searchResponse.json();

    if (!searchData.docs || searchData.docs.length === 0) {
      console.warn(`Author not found in OpenLibrary: ${authorName}`);
      return null;
    }

    // Get first matching author (OpenLibrary returns best match first)
    const authorKey = searchData.docs[0].key;
    console.log(`Found OpenLibrary author key: ${authorKey}`);

    // Step 2: Fetch author's works
    const worksUrl = `https://openlibrary.org/authors/${authorKey}/works.json?limit=500`;

    const worksResponse = await fetch(worksUrl);

    if (!worksResponse.ok) {
      console.error(`OpenLibrary works fetch failed: ${worksResponse.status}`);
      return null;
    }

    const worksData = await worksResponse.json();

    return {
      authorKey,
      authorName: searchData.docs[0].name,
      works: worksData.entries || [],
    };
  } catch (error) {
    console.error("OpenLibrary API error:", error);
    return null;
  }
}
