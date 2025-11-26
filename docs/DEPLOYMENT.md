# Deployment Process

This document outlines the deployment process for the BooksTrack API Worker.

## Continuous Integration & Deployment (CI/CD)

All deployments are handled automatically via GitHub Actions. A push to the `main` branch will trigger the deployment workflow.

## Cache Warming

To ensure a good user experience and reduce latency, we employ two cache-warming strategies.

### Static Cache Warming

*   **Frequency:** Every 6 hours
*   **Purpose:** To ensure that a predefined list of the most popular books are always available in the cache. This is especially important after a new deployment, which can clear the in-memory cache.
*   **Implementation:** The `handleStaticCacheWarmup` function in `src/handlers/scheduled-static-cache-warmup.js` is triggered by a cron job. It iterates through a static list of ISBNs in `src/config/popular-books.js` and fetches them, which populates the cache.

### Dynamic Cache Warming

*   **Frequency:** Every hour
*   **Purpose:** To proactively refresh the cache for books that have been popular in the last 24 hours.
*   **Implementation:** The `handleScheduledCacheWarming` function in `src/handlers/scheduled-cache-warming.js` is triggered by a cron job. It analyzes access logs to find the most frequently accessed books and refreshes their cache entries.
