/**
 * D1 CACHE PURGE SCRIPT - Alexandria Integration
 * 
 * Problem: BookRepository caches return old cover URLs, bypassing Alexandria
 * Solution: Delete cached book records to force fresh Alexandria processing
 * 
 * Execution: npx wrangler dev then call this endpoint
 */

import { BookRepository } from './src/repositories/book-repository';

export default {
  async fetch(request: Request, env: any) {
    const startTime = Date.now();
    
    // Target ISBNs with old cached data
    const targetISBNs = [
      '9780525540670',  // Long Bright River - has OpenLibrary URL
      '9780802158741',  // Small Things Like These - has Google Books URL
      '9780593230388',  // The Message - variant
      '9780593733257',  // A Sunny Place for Shady People
      '9780593653227',  // We Solve Murders
      '9780063277050',  // The Mighty Red - variant
      '9780593657225',  // Murderland
      '9781250391230',  // Careless People
      '9780593318256',  // Wandering Stars
      '9781668034347',  // The Safekeep
      '9781945492600',  // I Who Have Never Known Men
      '9781324086031',  // Playground
      '9780802161543',  // Orbital
      '9781668063606',  // Heartwood
      '9781250827951',  // Wild Dark Shore
      '9781982116521',  // Creation Lake
      '9780141441160',  // A Passage to India
      '9781982150921',  // Tender Is the Flesh
    ];
    
    const bookRepo = new BookRepository(env);
    const results = {
      total: targetISBNs.length,
      deleted: 0,
      notFound: 0,
      errors: 0,
      details: [] as any[]
    };
    
    console.log(`🚨 D1/KV CACHE PURGE INITIATED`);
    console.log(`⏰ Start: ${new Date().toISOString()}`);
    console.log(`📋 Target: ${targetISBNs.length} ISBNs`);
    console.log('');
    
    for (const isbn of targetISBNs) {
      try {
        // Check if exists
        const exists = await bookRepo.findByISBN(isbn);
        
        if (exists) {
          // Check for old cover URL
          const coverURL = exists.canonicalMetadata?.works?.[0]?.coverImageURL || '';
          const isOldCache = 
            coverURL.includes('openlibrary.org') || 
            coverURL.includes('books.google.com') ||
            coverURL.includes('covers.isbndb.com');
          
          if (isOldCache) {
            // DELETE from D1/KV
            await bookRepo.delete(isbn);
            results.deleted++;
            
            console.log(`✅ DELETED: ${isbn}`);
            console.log(`   Old URL: ${coverURL}`);
            
            results.details.push({
              isbn,
              status: 'deleted',
              oldURL: coverURL
            });
          } else {
            results.notFound++;
            console.log(`⏭️  SKIP: ${isbn} (already has Alexandria URL)`);
            console.log(`   URL: ${coverURL}`);
            
            results.details.push({
              isbn,
              status: 'skip',
              currentURL: coverURL
            });
          }
        } else {
          results.notFound++;
          console.log(`ℹ️  NOT FOUND: ${isbn}`);
          
          results.details.push({
            isbn,
            status: 'not_found'
          });
        }
        
        console.log('');
        
      } catch (error: any) {
        results.errors++;
        console.error(`❌ ERROR: ${isbn} - ${error.message}`);
        
        results.details.push({
          isbn,
          status: 'error',
          error: error.message
        });
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 D1/KV CACHE PURGE COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Results:`);
    console.log(`   Total: ${results.total}`);
    console.log(`   ✅ Deleted: ${results.deleted}`);
    console.log(`   ⏭️  Skipped: ${results.notFound - results.errors}`);
    console.log(`   ❌ Errors: ${results.errors}`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log('');
    console.log('🎯 Next: Test ISBNs to verify Alexandria URLs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return new Response(JSON.stringify({
      success: true,
      operation: 'd1_kv_cache_purge',
      timestamp: new Date().toISOString(),
      durationMs: duration,
      results
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
