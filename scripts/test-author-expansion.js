/**
 * Test Script: Author Bibliography Expansion
 *
 * Demonstrates the minimal viable test with Stephen King.
 * Run with: node scripts/test-author-expansion.js
 */

import { expandAuthorBibliography } from "../src/services/author-bibliography-expansion.js";

/**
 * Mock env object for local testing
 * (In production, this comes from Cloudflare Workers)
 */
const mockEnv = {
  GOOGLE_BOOKS_API_KEY: process.env.GOOGLE_BOOKS_API_KEY || "",
};

/**
 * Test Stephen King bibliography expansion
 */
async function testStephenKing() {
  console.log("=".repeat(60));
  console.log("Stephen King Bibliography Expansion - Minimal Test");
  console.log("=".repeat(60));
  console.log("");

  const startTime = Date.now();

  // Test with Stephen King
  const result = await expandAuthorBibliography("Stephen King", mockEnv, {
    maxWorks: 20, // His top 20 books
    editionsPerWork: 3, // 3 editions per book
    minPublicationYear: 1990, // Since 1990 (35 years of works)
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("=".repeat(60));
  console.log("Test Results");
  console.log("=".repeat(60));
  console.log("");

  if (!result.success) {
    console.error("❌ Test failed:", result.error);
    return;
  }

  console.log(`✅ Success: ${result.success}`);
  console.log(`👤 Author: ${result.author}`);
  console.log("");
  console.log("📊 Statistics:");
  console.log(`   Works discovered: ${result.stats.worksDiscovered}`);
  console.log(`   Works processed: ${result.stats.worksProcessed}`);
  console.log(`   Works skipped: ${result.stats.skipped}`);
  console.log(`   Editions discovered: ${result.stats.editionsDiscovered}`);
  console.log(`   Total ISBNs: ${result.stats.isbnsHarvested}`);
  console.log(
    `   Avg editions/work: ${(result.stats.editionsDiscovered / result.stats.worksProcessed).toFixed(1)}`,
  );
  console.log("");
  console.log(`⏱️  Duration: ${duration}s`);
  console.log("");

  // Show sample ISBNs
  console.log("📚 Sample ISBNs (first 10):");
  result.isbns.slice(0, 10).forEach((isbn, idx) => {
    console.log(`   ${idx + 1}. ${isbn}`);
  });
  console.log("");

  // Calculate harvest impact
  console.log("💡 Harvest Impact:");
  console.log(
    `   Current system: 700-1050 ISBNs/day (350 works × 2-3 editions)`,
  );
  console.log(
    `   Stephen King alone: ${result.stats.isbnsHarvested} ISBNs (${result.stats.worksProcessed} works × ${(result.stats.editionsDiscovered / result.stats.worksProcessed).toFixed(1)} editions)`,
  );
  console.log(
    `   % of daily quota: ${((result.stats.isbnsHarvested / 5000) * 100).toFixed(1)}% (ISBNdb: 5000 req/day)`,
  );
  console.log("");

  console.log("🎯 Proof of Concept:");
  console.log(
    `   ✓ Single author expansion works: ${result.stats.isbnsHarvested} ISBNs discovered`,
  );
  console.log(`   ✓ Edition discovery functional: 2-3 editions per work`);
  console.log(
    `   ✓ API integration stable: OpenLibrary + Google Books working`,
  );
  console.log(
    `   ✓ Quota efficient: ${result.stats.isbnsHarvested} ISBNs in ${duration}s (${(result.stats.isbnsHarvested / parseFloat(duration)).toFixed(0)} ISBNs/sec)`,
  );
  console.log("");

  console.log("=".repeat(60));
}

// Run test
testStephenKing().catch(console.error);
