/**
 * Book metadata utilities
 * Provider-agnostic image quality detection and search link generation
 */

// Placeholder cover for books without images (Issue #202)
// Using placehold.co CDN for reliability and performance
const PLACEHOLDER_COVER =
  "https://placehold.co/300x450/e0e0e0/666666?text=No+Cover";

/**
 * Generate SHA-256 hash of URL for cache key (using Web Crypto API)
 * @param {string} url - The URL to hash
 * @returns {Promise<string>} First 32 characters of hex hash (16 bytes)
 */
async function generateUrlHash(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex.substring(0, 32); // 32 chars (16 bytes) for collision resistance
}

/**
 * Detect image quality via dimension analysis
 * Uses KV cache to minimize HEAD requests
 *
 * @param {string} coverUrl - Cover image URL
 * @param {Object} env - Worker environment bindings
 * @returns {Promise<Object>} { quality: 'high'|'medium'|'low', width: number, height: number }
 */
export async function detectImageQuality(coverUrl, env) {
  if (!coverUrl) {
    return { quality: "missing", width: 0, height: 0 };
  }

  // Generate cache key from URL hash (now async with Web Crypto)
  const urlHash = await generateUrlHash(coverUrl);
  const cacheKey = `image-dims:${urlHash}`;

  // Check KV cache first (24h TTL)
  try {
    const cached = await env.CACHE.get(cacheKey, "json");
    if (cached && cached.width && cached.height) {
      return {
        quality: classifyQuality(cached.width),
        width: cached.width,
        height: cached.height,
        cached: true,
      };
    }
  } catch (error) {
    console.warn("KV cache read failed for image dimensions:", error);
  }

  // Attempt HEAD request with 2s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(coverUrl, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Validate HTTP response (Grok-4 finding #2)
    if (!response.ok) {
      throw new Error(`HEAD request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      throw new Error("Not an image response");
    }

    // Try to extract dimensions from response headers
    const dimensions = await extractDimensionsFromResponse(response, coverUrl);

    // Cache the result (24h TTL)
    if (dimensions.width > 0) {
      try {
        await env.CACHE.put(cacheKey, JSON.stringify(dimensions), {
          expirationTtl: 86400, // 24 hours
        });
      } catch (error) {
        console.warn("KV cache write failed for image dimensions:", error);
      }

      return {
        quality: classifyQuality(dimensions.width),
        ...dimensions,
        cached: false,
      };
    }
  } catch (error) {
    // HEAD request failed (timeout, CORS, network error)
    console.warn(`HEAD request failed for ${coverUrl}:`, error.message);
  }

  // Fallback to URL pattern heuristics
  const heuristicDimensions = inferDimensionsFromUrl(coverUrl);

  return {
    quality: classifyQuality(heuristicDimensions.width),
    ...heuristicDimensions,
    fallback: true,
  };
}

/**
 * Extract image dimensions from HTTP response
 * Simplified to skip unreliable content-length heuristics (Grok-4 finding #3)
 *
 * @param {Response} response - Fetch response object
 * @param {string} url - Image URL for pattern matching
 * @returns {Promise<Object>} { width: number, height: number }
 */
async function extractDimensionsFromResponse(response, url) {
  // Skip content-length heuristics and fall back to URL inference
  // Content-Length doesn't reliably indicate image dimensions
  return inferDimensionsFromUrl(url);
}

/**
 * Infer dimensions from URL patterns (provider-specific)
 * @param {string} url - Cover image URL
 * @returns {Object} { width: number, height: number }
 */
function inferDimensionsFromUrl(url) {
  // Google Books zoom parameters
  if (url.includes("zoom=1") || url.includes("zoom=2")) {
    return { width: 800, height: 1200 };
  } else if (url.includes("zoom=0")) {
    return { width: 128, height: 192 };
  }

  // OpenLibrary size suffixes
  if (url.includes("-L.jpg")) {
    return { width: 800, height: 1200 };
  } else if (url.includes("-M.jpg")) {
    return { width: 400, height: 600 };
  } else if (url.includes("-S.jpg")) {
    return { width: 200, height: 300 };
  }

  // ISBNdb (typically medium quality)
  if (url.includes("isbndb.com")) {
    return { width: 500, height: 750 };
  }

  // Default fallback
  return { width: 400, height: 600 };
}

/**
 * Classify image quality based on width
 * @param {number} width - Image width in pixels
 * @returns {string} 'high' | 'medium' | 'low' | 'missing'
 */
function classifyQuality(width) {
  if (width === 0) return "missing";
  if (width > 800) return "high";
  if (width >= 400) return "medium";
  return "low";
}

/**
 * Generate search links for HATEOAS compliance
 * Centralizes URL construction for all book search providers
 *
 * @param {string} isbn - ISBN-10 or ISBN-13 (preferred)
 * @param {string} title - Book title (fallback)
 * @param {string} author - Author name (fallback)
 * @param {string} volumeId - Google Books volume ID (optional)
 * @returns {Object} { googleBooks: string, openLibrary: string, amazon: string }
 */
export function generateSearchLinks(isbn, title, author, volumeId = null) {
  const links = {};

  // Google Books
  if (volumeId) {
    links.googleBooks = `https://www.google.com/books/edition/_/${volumeId}`;
  } else if (isbn) {
    links.googleBooks = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
  } else if (title) {
    const query = author ? `${title} ${author}` : title;
    links.googleBooks = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`;
  }

  // OpenLibrary
  if (isbn) {
    links.openLibrary = `https://openlibrary.org/isbn/${isbn}`;
  } else if (title) {
    links.openLibrary = `https://openlibrary.org/search?q=${encodeURIComponent(title)}`;
  }

  // Amazon
  if (isbn) {
    links.amazon = `https://www.amazon.com/s?k=${isbn}`;
  } else if (title && author) {
    links.amazon = `https://www.amazon.com/s?k=${encodeURIComponent(title + " " + author)}`;
  } else if (title) {
    links.amazon = `https://www.amazon.com/s?k=${encodeURIComponent(title)}`;
  }

  return links;
}

/**
 * Get placeholder cover URL for missing images
 * @returns {string} Placeholder URL
 */
export function getPlaceholderCover() {
  return PLACEHOLDER_COVER;
}
