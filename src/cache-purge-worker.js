/**
 * CACHE PURGE SCRIPT - Alexandria Integration
 * 
 * Mission: Eliminate old pre-integration cache entries with OpenLibrary/Google Books URLs
 * Result: Force fresh lookups through Alexandria for clean CDN URLs
 * 
 * Impact: Immediate user experience improvement for cached ISBNs
 * 
 * Execution: Deploy this as a one-time cron or manual trigger
 */

export default {
  async fetch(request, env) {
    const startTime = Date.now();
    
    // Target ISBNs with old cache contamination
    const targetISBNs = [
      // Known old cache from validation
      '9780525540670',  // Long Bright River - OpenLibrary URL
      '9780802158741',  // Small Things Like These - Google Books URL
      
      // CSV ISBNs likely to have old cache
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
    
    const results = {
      total: targetISBNs.length,
      deleted: 0,
      notFound: 0,
      errors: 0,
      details: []
    };
    
    console.log(`🚨 CACHE PURGE INITIATED: ${targetISBNs.length} ISBNs targeted`);
    console.log(`⏰ Start Time: ${new Date().toISOString()}`);
    console.log('');
    
    // Process each ISBN
    for (const isbn of targetISBNs) {
      try {
        // Generate cache key using same format as CacheKeyFactory
        const cacheKey = `search:isbn:isbn=${isbn}`;
        
        // Check if key exists before deletion
        const existingValue = await env.CACHE.get(cacheKey);
        
        if (existingValue) {
          // Parse to check for old URLs
          const cached = JSON.parse(existingValue);
          const coverURL = cached?.data?.works?.[0]?.coverImageURL || '';
          
          const isOldCache = 
            coverURL.includes('openlibrary.org') || 
            coverURL.includes('books.google.com') ||
            coverURL.includes('covers.isbndb.com');
          
          if (isOldCache) {
            // DELETE the contaminated cache entry
            await env.CACHE.delete(cacheKey);
            results.deleted++;
            
            console.log(`✅ DELETED: ${isbn}`);
            console.log(`   Key: ${cacheKey}`);
            console.log(`   Old URL: ${coverURL}`);
            console.log('');
            
            results.details.push({
              isbn,
              status: 'deleted',
              oldURL: coverURL,
              cacheKey
            });
          } else {
            // Already has Alexandria URL - skip
            results.notFound++;
            
            console.log(`⏭️  SKIP: ${isbn} (already has Alexandria URL)`);
            console.log(`   URL: ${coverURL}`);
            console.log('');
            
            results.details.push({
              isbn,
              status: 'skip',
              currentURL: coverURL,
              cacheKey
            });
          }
        } else {
          // No cache entry found
          results.notFound++;
          
          console.log(`ℹ️  NOT FOUND: ${isbn} (no cache entry)`);
          console.log('');
          
          results.details.push({
            isbn,
            status: 'not_found',
            cacheKey
          });
        }
        
      } catch (error) {
        results.errors++;
        console.error(`❌ ERROR: ${isbn} - ${error.message}`);
        console.log('');
        
        results.details.push({
          isbn,
          status: 'error',
          error: error.message
        });
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏁 CACHE PURGE COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 Results:`);
    console.log(`   Total ISBNs: ${results.total}`);
    console.log(`   ✅ Deleted: ${results.deleted}`);
    console.log(`   ⏭️  Skipped: ${results.notFound - results.errors}`);
    console.log(`   ❌ Errors: ${results.errors}`);
    console.log(`   ⏱️  Duration: ${duration}ms`);
    console.log('');
    console.log('🎯 Next step: Test ISBNs to verify Alexandria URLs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return new Response(JSON.stringify({
      success: true,
      operation: 'cache_purge',
      timestamp: new Date().toISOString(),
      durationMs: duration,
      results
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
