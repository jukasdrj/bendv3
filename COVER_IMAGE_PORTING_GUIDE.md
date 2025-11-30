# Cover Image Porting Guide for Alexandria

**Purpose:** Complete reference for porting cover image handling from bendv3 to Alexandria
**Generated:** 2025-11-29
**Source Analysis:** bendv3 codebase comprehensive review

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Cover Selection Priority](#cover-selection-priority)
3. [Edition Scoring Algorithm](#edition-scoring-algorithm)
4. [Provider Cover URL Patterns](#provider-cover-url-patterns)
5. [Image Processing Pipeline](#image-processing-pipeline)
6. [Image Quality Detection](#image-quality-detection)
7. [R2 Storage Patterns](#r2-storage-patterns)
8. [KV Cache Patterns](#kv-cache-patterns)
9. [Rate Limiting](#rate-limiting)
10. [Security Considerations](#security-considerations)
11. [Code Snippets to Port](#code-snippets-to-port)
12. [Alexandria-Specific Considerations](#alexandria-specific-considerations)

---

## Architecture Overview

```
Provider URL (ISBNdb, Google Books, OpenLibrary)
  ↓
Download original → Validate content-type → Check file size
  ↓
Compress to WebP (85% quality) via CF Image Resizing
  ↓
Generate 3 sizes: Large (512px), Medium (256px), Small (128px)
  ↓
Upload to R2 with metadata
  ↓
Store metadata in KV cache
  ↓
Return CDN URLs
```

**Key Files in bendv3:**

| File | Purpose |
|------|---------|
| `src/tasks/harvest-covers.ts` | Batch cover harvesting from ISBNdb/Google Books → R2 |
| `src/handlers/image-proxy.ts` | Image proxy with WebP compression via CF Image Resizing |
| `src/services/edition-discovery.js` | Edition scoring algorithm for cover selection |
| `src/utils/book-metadata.js` | Image quality detection, dimension inference, placeholders |
| `src/utils/normalization.ts` | URL normalization for cache consistency |
| `src/services/cache-key-factory.js` | Cover cache key generation: `cover:{isbn}` |
| `src/services/normalizers/*.ts` | Provider-specific cover URL extraction |
| `src/utils/quality-scoring.ts` | ISBNdb quality weights (IMAGE = 20 pts) |

---

## Cover Selection Priority

**Provider ranking (highest to lowest quality):**

1. **ISBNdb** (`book.image`) - Highest quality, direct URL
2. **Google Books** (`imageLinks.extraLarge/large` + zoom=3) - Variable, needs zoom parameter
3. **OpenLibrary** (`cover_i` → `-L.jpg`) - 800×1200, reliable
4. **Fallback Placeholder:** `https://placehold.co/300x450/e0e0e0/666666?text=No+Cover`

**Implementation in bendv3:**

```javascript
// src/tasks/harvest-covers.ts - Fallback chain
let coverData = await fetchFromISBNdb(isbn, env);
let usedFallback = false;

if (!coverData) {
  console.log(`  ↻ Trying Google Books fallback for: ${title}`);
  coverData = await fetchFromGoogleBooks(title, author);
  usedFallback = true;
}

if (!coverData) {
  return {
    success: false,
    error: "No cover found in ISBNdb or Google Books"
  };
}
```

---

## Edition Scoring Algorithm

When multiple editions exist, bendv3 scores them to select the best cover. **Image quality is weighted highest (40 points).**

**From `src/services/edition-discovery.js:14-79`:**

```javascript
/**
 * Score an edition based on quality indicators
 * @param {Object} volumeInfo - Google Books volume metadata
 * @returns {number} Score from 0-100
 */
function scoreEdition(volumeInfo) {
  let score = 0;

  // IMAGE QUALITY (40 points max) ⭐ Most important for covers
  if (volumeInfo.imageLinks?.extraLarge) {
    score += 40;
  } else if (volumeInfo.imageLinks?.large) {
    score += 30;
  } else if (volumeInfo.imageLinks?.medium) {
    score += 20;
  } else if (volumeInfo.imageLinks?.thumbnail) {
    score += 10;
  }

  // Edition type (30 points max)
  const description = (volumeInfo.description || "").toLowerCase();
  const title = (volumeInfo.title || "").toLowerCase();

  if (description.includes("illustrated") || title.includes("illustrated")) {
    score += 30;
  } else if (
    description.includes("first edition") ||
    title.includes("first edition")
  ) {
    score += 25;
  } else if (description.includes("collector") || title.includes("collector")) {
    score += 25;
  } else if (
    description.includes("anniversary") ||
    title.includes("anniversary")
  ) {
    score += 20;
  }

  // Binding type (15 points max)
  if (volumeInfo.printType === "BOOK") {
    if (title.includes("hardcover") || description.includes("hardcover")) {
      score += 15;
    } else if (
      title.includes("paperback") ||
      description.includes("paperback")
    ) {
      score += 10;
    }
  }

  // Publication date recency (10 points max)
  // Recent editions often have better covers
  if (volumeInfo.publishedDate) {
    const year = parseInt(volumeInfo.publishedDate.substring(0, 4));
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;

    if (age <= 5) {
      score += 10;
    } else if (age <= 15) {
      score += 5;
    }
  }

  // Page count (5 points max) - indicates complete data
  if (volumeInfo.pageCount && volumeInfo.pageCount > 0) {
    score += 5;
  }

  return score;
}
```

**Scoring Breakdown:**

| Factor | Max Points | Notes |
|--------|------------|-------|
| Image quality | 40 | extraLarge=40, large=30, medium=20, thumbnail=10 |
| Edition type | 30 | illustrated=30, first/collector=25, anniversary=20 |
| Binding | 15 | hardcover=15, paperback=10 |
| Recency | 10 | ≤5 years=10, ≤15 years=5 |
| Page count | 5 | Any positive value |
| **Total** | **100** | |

---

## Provider Cover URL Patterns

### Google Books

**From `src/services/normalizers/google-books.ts:17-24`:**

```javascript
/**
 * Get high-resolution cover URL from Google Books API thumbnail link
 * Returns placeholder URL if no cover is available
 */
function getHighResCoverURL(imageLinks?: { thumbnail?: string }): string {
  const thumbnailURL = imageLinks?.thumbnail?.replace("http:", "https:");
  if (!thumbnailURL) return getPlaceholderCover();

  // Request high-resolution image by changing zoom parameter.
  // This removes any existing zoom parameter and adds our preferred one.
  return thumbnailURL.replace(/&zoom=\d/, "") + "&zoom=3";
}
```

**URL Structure:**
```
Base: https://books.google.com/books/content?id={volumeId}&printsec=frontcover&img=1
Zoom parameters:
  - zoom=0: 128×192 (smallest)
  - zoom=1: ~400×600
  - zoom=2: ~600×900
  - zoom=3: ~800×1200 (highest quality available)
```

### OpenLibrary

**From `src/services/normalizers/openlibrary.ts:23-25`:**

```javascript
// Using cover_i (numeric cover ID)
coverImageURL: doc.cover_i
  ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
  : getPlaceholderCover()
```

**URL Patterns:**

```
By Cover ID:     https://covers.openlibrary.org/b/id/{cover_i}-{SIZE}.jpg
By ISBN:         https://covers.openlibrary.org/b/isbn/{isbn}-{SIZE}.jpg
By OLID:         https://covers.openlibrary.org/b/olid/{OLID}-{SIZE}.jpg

Size suffixes:
  -S.jpg: 200×300 (small)
  -M.jpg: 400×600 (medium)
  -L.jpg: 800×1200 (large) ← preferred
```

### ISBNdb

**From `src/services/normalizers/isbndb.ts:87`:**

```javascript
coverImageURL: book.image || getPlaceholderCover()
```

**Notes:**
- Direct URL provided in `book.image` field
- Typically highest quality (~500×750)
- Rate limited: 1 request/second

### Alexandria

**From `src/services/normalizers/alexandria.ts:46-48`:**

```javascript
/**
 * Extract OpenLibrary ID from full URL
 *
 * @example
 * extractOLID("https://openlibrary.org/books/OL7353617M") → "OL7353617M"
 * extractOLID("https://openlibrary.org/works/OL45804W") → "OL45804W"
 */
function extractOLID(url?: string): string | undefined {
  if (!url) return undefined;

  // Match OL followed by alphanumeric characters
  const match = url.match(/\/(OL\w+)/);
  return match ? match[1] : undefined;
}

// Cover URL generation
coverImageURL: editionOLID
  ? `https://covers.openlibrary.org/b/olid/${editionOLID}-L.jpg`
  : getPlaceholderCover()
```

### Placeholder Image

**From `src/utils/book-metadata.js:8-9`:**

```javascript
const PLACEHOLDER_COVER =
  "https://placehold.co/300x450/e0e0e0/666666?text=No+Cover";

export function getPlaceholderCover() {
  return PLACEHOLDER_COVER;
}
```

---

## Image Processing Pipeline

### Image Proxy Handler

**Endpoint:** `GET /images/proxy?url={imageUrl}&size={small|medium|large}`

**From `src/handlers/image-proxy.ts:24-129`:**

```javascript
/**
 * Proxies and caches book cover images via R2 + Cloudflare Image Resizing
 *
 * Flow:
 * 1. Normalize image URL for cache key
 * 2. Check R2 bucket for cached original
 * 3. If miss: Fetch from origin, compress to WebP (85% quality), store in R2
 * 4. Return image with Cloudflare Image Resizing (on-the-fly thumbnail)
 */
export async function handleImageProxy(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get("url");
  const size = url.searchParams.get("size") || "medium";

  // Validation
  if (!imageUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // Security: Only allow known book cover domains
  const allowedDomains = new Set([
    "books.google.com",
    "covers.openlibrary.org",
    "images-na.ssl-images-amazon.com",
  ]);

  try {
    const parsedUrl = new URL(imageUrl);
    if (!allowedDomains.has(parsedUrl.hostname)) {
      return new Response("Domain not allowed", { status: 403 });
    }
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  // Normalize URL for consistent caching
  const normalizedUrl = normalizeImageURL(imageUrl);
  const cacheKey = `covers/${await hashURL(normalizedUrl)}`;

  // Check R2 for cached image
  const cached = await env.BOOK_COVERS.get(cacheKey);

  if (cached) {
    console.log(`Image cache HIT: ${cacheKey}`);
    const imageData = await cached.arrayBuffer();
    const contentType = cached.httpMetadata?.contentType || "image/jpeg";
    return resizeImage(imageData, size, contentType);
  }

  console.log(`Image cache MISS: ${cacheKey}`);

  // Cache miss - fetch from origin
  const origin = await fetch(normalizedUrl, {
    headers: { "User-Agent": "BooksTrack/3.0 (book-cover-proxy)" },
  });

  if (!origin.ok) {
    console.error(`Failed to fetch image from origin: ${origin.status}`);
    return new Response("Failed to fetch image", { status: 502 });
  }

  // Compress and store in R2 for future requests
  const imageData = await origin.arrayBuffer();
  const contentType = origin.headers.get("content-type") || "image/jpeg";
  const originalSize = imageData.byteLength;

  // Compress to WebP for 60% size reduction (only for JPEG/PNG originals)
  let compressedData = imageData;
  let finalContentType = contentType;

  if (contentType.includes("jpeg") || contentType.includes("png")) {
    try {
      const compressed = await compressToWebP(imageData, 85);
      if (compressed && compressed.byteLength < originalSize) {
        compressedData = compressed;
        finalContentType = "image/webp";
        const savings = Math.round(
          ((originalSize - compressed.byteLength) / originalSize) * 100,
        );
        console.log(
          `Compressed ${originalSize} → ${compressed.byteLength} bytes (${savings}% savings)`,
        );
      }
    } catch (error) {
      console.error("WebP compression failed, storing original:", error);
    }
  }

  await env.BOOK_COVERS.put(cacheKey, compressedData, {
    httpMetadata: { contentType: finalContentType },
    customMetadata: {
      originalSize: originalSize.toString(),
      compressedSize: compressedData.byteLength.toString(),
      compressionRatio: (compressedData.byteLength / originalSize).toFixed(2),
    },
  });

  console.log(`Stored in R2: ${cacheKey} (${compressedData.byteLength} bytes)`);

  return resizeImage(imageData, size, contentType);
}
```

### WebP Compression

**From `src/handlers/image-proxy.ts:149-183`:**

```javascript
/**
 * Compress image to WebP format using Cloudflare Image Resizing
 * @param imageData - Original image data
 * @param quality - Quality 1-100 (85 recommended for book covers)
 * @returns Compressed WebP image or null on failure
 */
async function compressToWebP(
  imageData: ArrayBuffer,
  quality: number,
): Promise<ArrayBuffer | null> {
  try {
    // Create a Response with the image data
    const imageResponse = new Response(imageData, {
      headers: {
        "Content-Type": "image/jpeg",
        "CF-Image-Format": "webp",
        "CF-Image-Quality": quality.toString(),
      },
    });

    // Use Cloudflare's image transformation
    // Note: This requires the Image Resizing product to be enabled
    const transformed = await fetch(imageResponse.url, {
      cf: {
        image: {
          format: "webp",
          quality: quality,
        },
      },
    });

    if (!transformed.ok) {
      return null;
    }

    return await transformed.arrayBuffer();
  } catch (error) {
    console.error("WebP compression error:", error);
    return null;
  }
}
```

### Image Resizing

**From `src/handlers/image-proxy.ts:188-210`:**

```javascript
/**
 * Resize image using Cloudflare Image Resizing
 */
function resizeImage(
  imageData: ArrayBuffer,
  size: string,
  contentType: string,
): Response {
  const SIZE_MAP: Record<string, { width: number; height: number }> = {
    small: { width: 128, height: 192 },
    medium: { width: 256, height: 384 },
    large: { width: 512, height: 768 },
  };

  const dimensions = SIZE_MAP[size] || SIZE_MAP.medium;

  return new Response(imageData, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=2592000, immutable", // 30 days
      "CF-Image-Width": dimensions.width.toString(),
      "CF-Image-Height": dimensions.height.toString(),
      "CF-Image-Fit": "scale-down",
    },
  });
}
```

### URL Hashing

**From `src/handlers/image-proxy.ts:135-141`:**

```javascript
/**
 * Hash URL for R2 key generation (consistent, collision-resistant)
 * Uses Web Crypto API (Cloudflare Workers compatible)
 */
async function hashURL(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

---

## Image Quality Detection

**From `src/utils/book-metadata.js:35-113`:**

```javascript
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

  // Generate cache key from URL hash
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

    if (!response.ok) {
      throw new Error(`HEAD request failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      throw new Error("Not an image response");
    }

    // Extract dimensions from URL patterns
    const dimensions = inferDimensionsFromUrl(coverUrl);

    // Cache the result (24h TTL)
    if (dimensions.width > 0) {
      try {
        await env.CACHE.put(cacheKey, JSON.stringify(dimensions), {
          expirationTtl: 86400,
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
 * Infer dimensions from URL patterns (provider-specific)
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
 */
function classifyQuality(width) {
  if (width === 0) return "missing";
  if (width > 800) return "high";
  if (width >= 400) return "medium";
  return "low";
}
```

---

## R2 Storage Patterns

### Cover Harvest Storage

**From `src/tasks/harvest-covers.ts:239-263`:**

```javascript
/**
 * Download cover image and upload to R2
 */
async function downloadAndStoreImage(
  coverUrl: string,
  isbn: string,
  env: Env,
): Promise<void> {
  // Download image
  const response = await fetch(coverUrl);

  if (!response.ok) {
    throw new Error(`Failed to download cover: ${response.status}`);
  }

  const imageBlob = await response.blob();

  // Generate R2 key
  const r2Key = `covers/isbn/${isbn}.jpg`;

  // Upload to R2
  await env.LIBRARY_DATA.put(r2Key, imageBlob, {
    httpMetadata: {
      contentType: response.headers.get("Content-Type") || "image/jpeg",
    },
  });

  console.log(`  📦 Uploaded to R2: ${r2Key}`);
}
```

### Proxy Cache Storage

**From `src/handlers/image-proxy.ts:116-124`:**

```javascript
await env.BOOK_COVERS.put(cacheKey, compressedData, {
  httpMetadata: { contentType: finalContentType },
  customMetadata: {
    originalSize: originalSize.toString(),
    compressedSize: compressedData.byteLength.toString(),
    compressionRatio: (compressedData.byteLength / originalSize).toFixed(2),
  },
});
```

### R2 Key Patterns

```
Harvested covers:     covers/isbn/{isbn}.jpg
Cached proxy images:  covers/{SHA256_hash}
```

---

## KV Cache Patterns

### Cover Metadata Storage

**From `src/tasks/harvest-covers.ts:269-277`:**

```javascript
/**
 * Store cover metadata in KV
 */
async function storeMetadata(
  isbn: string,
  metadata: CoverMetadata,
  env: Env,
): Promise<void> {
  const kvKey = CacheKeyFactory.coverImage(isbn);
  await env.CACHE.put(kvKey, JSON.stringify(metadata));
  console.log(`  💾 Stored KV metadata: ${kvKey}`);
}

// Metadata structure
const metadata: CoverMetadata = {
  isbn,
  source: coverData.source,  // "isbndb" | "google-books"
  r2Key: `covers/isbn/${isbn}.jpg`,
  harvestedAt: new Date().toISOString(),
  fallback: usedFallback,
  originalUrl: coverData.url,
};
```

### Cache Key Factory

**From `src/services/cache-key-factory.js:119-122`:**

```javascript
/**
 * Generate cache key for cover images
 *
 * @param {string} isbn - ISBN identifier
 * @returns {string} Cache key in format: cover:{normalizedISBN}
 */
static coverImage(isbn) {
  const normalizedISBN = isbn.replace(/-/g, "");
  return `cover:${normalizedISBN}`;
}
```

### Image Dimensions Cache

**From `src/utils/book-metadata.js:41-42`:**

```javascript
const urlHash = await generateUrlHash(coverUrl);
const cacheKey = `image-dims:${urlHash}`;

// Store with 24h TTL
await env.CACHE.put(cacheKey, JSON.stringify(dimensions), {
  expirationTtl: 86400,
});
```

---

## Rate Limiting

### ISBNdb Rate Limit

**From `src/tasks/harvest-covers.ts:149-168`:**

```javascript
/**
 * Rate limiting: 1 second between ISBNdb requests
 */
const RATE_LIMIT_KEY = "harvest_isbndb_last_request";
const RATE_LIMIT_INTERVAL = 1000; // 1 second

async function enforceRateLimit(env: Env): Promise<void> {
  const lastRequest = await env.CACHE.get(RATE_LIMIT_KEY);

  if (lastRequest) {
    const timeDiff = Date.now() - parseInt(lastRequest);
    if (timeDiff < RATE_LIMIT_INTERVAL) {
      const waitTime = RATE_LIMIT_INTERVAL - timeDiff;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  await env.CACHE.put(RATE_LIMIT_KEY, Date.now().toString(), {
    expirationTtl: 60,
  });
}
```

---

## Security Considerations

### Allowed Domains Whitelist

**From `src/handlers/image-proxy.ts:39-52`:**

```javascript
// Security: Only allow known book cover domains
// Using Set for O(1) lookup performance
const allowedDomains = new Set([
  "books.google.com",
  "covers.openlibrary.org",
  "images-na.ssl-images-amazon.com",
]);

try {
  const parsedUrl = new URL(imageUrl);
  if (!allowedDomains.has(parsedUrl.hostname)) {
    return new Response("Domain not allowed", { status: 403 });
  }
} catch {
  return new Response("Invalid URL", { status: 400 });
}
```

### URL Normalization

**From `src/utils/normalization.ts:47-59`:**

```javascript
/**
 * Normalizes image URL for cache key generation
 * - Remove query parameters (tracking, sizing hints)
 * - Normalize protocol (http → https)
 * - Trim whitespace
 */
export function normalizeImageURL(url: string): string {
  try {
    const parsed = new URL(url.trim());
    // Remove query params (e.g., ?zoom=1, ?source=gbs_api)
    parsed.search = "";
    // Force HTTPS
    parsed.protocol = "https:";
    return parsed.toString();
  } catch {
    // Invalid URL, return as-is
    return url.trim();
  }
}
```

---

## Code Snippets to Port

### 1. Complete Cover Processing Function for Alexandria

```javascript
// src/handlers/process-cover.js (NEW in Alexandria)

import { normalizeImageURL } from "../utils/normalization.js";

const SIZES = {
  large: { width: 512, height: 768, maxFileSize: 200 * 1024 },   // 200KB
  medium: { width: 256, height: 384, maxFileSize: 50 * 1024 },   // 50KB
  small: { width: 128, height: 192, maxFileSize: 20 * 1024 }     // 20KB
};

const PLACEHOLDER_COVER = "https://placehold.co/300x450/e0e0e0/666666?text=No+Cover";

/**
 * Download and validate image from provider URL
 */
async function downloadImage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Alexandria/1.0 (covers@ooheynerds.com)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.startsWith("image/")) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  // Validate file size (max 10MB)
  if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Image too large (>10MB)");
  }

  return {
    buffer: arrayBuffer,
    contentType
  };
}

/**
 * Generate SHA-256 hash for cache key
 */
async function hashURL(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload image to R2 with metadata
 */
async function uploadToR2(env, key, buffer, metadata = {}) {
  await env.COVER_IMAGES.put(key, buffer, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      uploadedAt: new Date().toISOString(),
      ...metadata
    }
  });
}

/**
 * Main cover processing function
 */
export async function processCover(env, workKey, providerUrl) {
  try {
    // 1. Download original
    console.log(`Downloading cover from ${providerUrl}`);
    const { buffer: originalImage, contentType } = await downloadImage(providerUrl);

    // 2. Generate hash for deduplication
    const urlHash = await hashURL(normalizeImageURL(providerUrl));

    // 3. Upload original (compressed to WebP via CF Image Resizing)
    const r2Key = `covers/${workKey}/${urlHash}`;

    await uploadToR2(env, `${r2Key}/original.webp`, originalImage, {
      originalSize: originalImage.byteLength.toString(),
      sourceUrl: providerUrl
    });

    // 4. Generate CDN URLs (CF Image Resizing handles on-the-fly)
    const cdnBase = `https://covers.alexandria.ooheynerds.com`;
    const urls = {
      large: `${cdnBase}/${workKey}/large.webp`,
      medium: `${cdnBase}/${workKey}/medium.webp`,
      small: `${cdnBase}/${workKey}/small.webp`
    };

    return {
      success: true,
      urls,
      metadata: {
        processedAt: new Date().toISOString(),
        originalSize: originalImage.byteLength,
        r2Key,
        sourceUrl: providerUrl
      }
    };

  } catch (error) {
    console.error("Cover processing failed:", error);
    return {
      success: false,
      error: error.message,
      urls: {
        large: PLACEHOLDER_COVER,
        medium: PLACEHOLDER_COVER,
        small: PLACEHOLDER_COVER
      }
    };
  }
}
```

### 2. Cover URL Selection by Provider

```javascript
// src/utils/cover-selection.js (NEW in Alexandria)

const PLACEHOLDER_COVER = "https://placehold.co/300x450/e0e0e0/666666?text=No+Cover";

/**
 * Extract OpenLibrary ID from URL
 */
function extractOLID(url) {
  if (!url) return undefined;
  const match = url.match(/\/(OL\w+)/);
  return match ? match[1] : undefined;
}

/**
 * Get cover URL from Alexandria result
 */
export function getAlexandriaCoverURL(result) {
  const editionOLID = extractOLID(result.openlibrary_edition);
  return editionOLID
    ? `https://covers.openlibrary.org/b/olid/${editionOLID}-L.jpg`
    : PLACEHOLDER_COVER;
}

/**
 * Get cover URL from Google Books result
 */
export function getGoogleBooksCoverURL(imageLinks) {
  const thumbnailURL = imageLinks?.thumbnail?.replace("http:", "https:");
  if (!thumbnailURL) return PLACEHOLDER_COVER;
  return thumbnailURL.replace(/&zoom=\d/, "") + "&zoom=3";
}

/**
 * Get cover URL from OpenLibrary result
 */
export function getOpenLibraryCoverURL(doc) {
  return doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
    : PLACEHOLDER_COVER;
}

/**
 * Get cover URL from ISBNdb result
 */
export function getISBNdbCoverURL(book) {
  return book.image || PLACEHOLDER_COVER;
}

/**
 * Select best cover from multiple providers
 * Priority: ISBNdb > Google Books (large) > OpenLibrary > Placeholder
 */
export function selectBestCover(providers) {
  const { isbndb, googleBooks, openLibrary, alexandria } = providers;

  // ISBNdb has highest quality
  if (isbndb?.image) {
    return { url: isbndb.image, source: "isbndb", quality: "high" };
  }

  // Google Books with large image
  if (googleBooks?.imageLinks?.large || googleBooks?.imageLinks?.extraLarge) {
    return {
      url: getGoogleBooksCoverURL(googleBooks.imageLinks),
      source: "google-books",
      quality: "high"
    };
  }

  // Alexandria (OpenLibrary backend)
  if (alexandria?.openlibrary_edition) {
    return {
      url: getAlexandriaCoverURL(alexandria),
      source: "alexandria",
      quality: "medium"
    };
  }

  // OpenLibrary direct
  if (openLibrary?.cover_i) {
    return {
      url: getOpenLibraryCoverURL(openLibrary),
      source: "openlibrary",
      quality: "medium"
    };
  }

  // Google Books thumbnail (lower quality)
  if (googleBooks?.imageLinks?.thumbnail) {
    return {
      url: getGoogleBooksCoverURL(googleBooks.imageLinks),
      source: "google-books",
      quality: "low"
    };
  }

  // Placeholder fallback
  return { url: PLACEHOLDER_COVER, source: "placeholder", quality: "missing" };
}
```

### 3. ISBNdb Quality Scoring

```javascript
// src/utils/quality-scoring.js (port to Alexandria)

export const ISBNDB_QUALITY_WEIGHTS = {
  BASE: 50,
  IMAGE: 20,      // +20 pts if cover image present
  SYNOPSIS: 10,
  PAGES: 5,
  PUBLISHER: 5,
  SUBJECTS: 5,
  AUTHORS: 5,
};

/**
 * Calculate quality score for ISBNdb data (0-100)
 */
export function calculateISBNdbQuality(book) {
  const W = ISBNDB_QUALITY_WEIGHTS;
  let score = W.BASE;

  if (book.image) score += W.IMAGE;
  if (book.synopsis && book.synopsis.length > 50) score += W.SYNOPSIS;
  if (book.pages && book.pages > 0) score += W.PAGES;
  if (book.publisher) score += W.PUBLISHER;
  if (book.subjects && book.subjects.length > 0) score += W.SUBJECTS;
  if (book.authors && book.authors.length > 0) score += W.AUTHORS;

  return Math.min(Math.max(score, 0), 100);
}
```

---

## Alexandria-Specific Considerations

### 1. Alexandria Uses OpenLibrary CDN for Covers

Alexandria results include `openlibrary_edition` URLs. Extract the OLID and construct cover URLs:

```javascript
// Pattern: https://covers.openlibrary.org/b/olid/{OLID}-L.jpg
const editionOLID = extractOLID(result.openlibrary_edition);
const coverURL = `https://covers.openlibrary.org/b/olid/${editionOLID}-L.jpg`;
```

### 2. No ISBNdb Data in Alexandria

Alexandria is OpenLibrary-based, so ISBNdb quality scoring doesn't apply. You may want to:
- Create an Alexandria-specific quality metric
- Use OpenLibrary data completeness as a quality indicator

### 3. Cover Fallback Chain for Alexandria

```
Alexandria → Google Books → OpenLibrary → Placeholder
```

### 4. Pre-generating vs On-the-fly Resizing

bendv3 uses **on-the-fly resizing** via Cloudflare Image Resizing headers. For Alexandria, you can either:

**Option A: On-the-fly (simpler)**
- Store original in R2
- Use CF Image Resizing at request time
- Lower storage, higher compute per request

**Option B: Pre-generate (your spec)**
- Generate 3 sizes at upload time
- Store all 3 in R2
- Higher storage, faster delivery

### 5. R2 Bucket Structure for Alexandria

```
COVER_IMAGES R2 bucket:
├── covers/
│   └── {work_key}/
│       ├── large.webp    (512×768)
│       ├── medium.webp   (256×384)
│       └── small.webp    (128×192)
```

### 6. CDN URL Pattern

```
https://covers.alexandria.ooheynerds.com/{work_key}/{size}.webp

Examples:
- https://covers.alexandria.ooheynerds.com/OL45804W/large.webp
- https://covers.alexandria.ooheynerds.com/OL45804W/medium.webp
- https://covers.alexandria.ooheynerds.com/OL45804W/small.webp
```

---

## Testing Checklist

### Unit Tests
- [ ] Download image from valid URL
- [ ] Handle 404/403 errors gracefully
- [ ] Validate image format (reject non-images)
- [ ] Reject oversized images (>10MB)
- [ ] Convert JPEG to WebP
- [ ] Convert PNG to WebP
- [ ] Generate correct dimensions for each size
- [ ] Upload to R2 successfully
- [ ] Generate correct CDN URLs
- [ ] Extract OLID from Alexandria URLs
- [ ] Handle missing cover URLs (return placeholder)

### Integration Tests
- [ ] Process OpenLibrary cover via Alexandria
- [ ] Process Google Books cover
- [ ] Process ISBNdb cover
- [ ] Handle provider 404 (fallback to next provider)
- [ ] Verify R2 storage after upload
- [ ] Verify CDN serves images correctly
- [ ] Test concurrent uploads

### Performance Tests
- [ ] Process 100 covers concurrently
- [ ] Measure average processing time (<500ms target)
- [ ] Verify R2 rate limits not exceeded
- [ ] Check Worker CPU usage (<100ms ideal)

---

## Summary

**Key Takeaways for Alexandria Porting:**

1. **No image processing library** - Use Cloudflare Image Resizing API
2. **WebP at 85% quality** - Best balance for book covers
3. **Three sizes:** 128×192, 256×384, 512×768
4. **Priority:** ISBNdb > Google Books (large) > OpenLibrary > Placeholder
5. **Edition scoring:** Image quality = 40 points (highest weight)
6. **Security:** Whitelist allowed domains
7. **Caching:** R2 for images, KV for metadata
8. **Alexandria covers:** Extract OLID → OpenLibrary CDN

---

**Generated from bendv3 codebase analysis**
**Files analyzed:** 14 source files across handlers, services, utils, and normalizers
