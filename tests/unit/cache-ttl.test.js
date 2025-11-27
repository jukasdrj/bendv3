import { describe, it, expect } from 'vitest';
import { getCacheTTL, getAllCacheTTLs, DEFAULT_TTL } from '../../src/config/cache-ttl.js';

describe('Cache TTL Configuration', () => {
  describe('DEFAULT_TTL constants', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_TTL.hot).toBe(2 * 60 * 60); // 2 hours
      expect(DEFAULT_TTL.cold).toBe(14 * 24 * 60 * 60); // 14 days
      expect(DEFAULT_TTL.isbn).toBe(365 * 24 * 60 * 60); // 365 days
      expect(DEFAULT_TTL.title).toBe(7 * 24 * 60 * 60); // 7 days
      expect(DEFAULT_TTL.author).toBe(7 * 24 * 60 * 60); // 7 days
      expect(DEFAULT_TTL.enrichment).toBe(180 * 24 * 60 * 60); // 180 days
      expect(DEFAULT_TTL.cover).toBe(365 * 24 * 60 * 60); // 365 days
    });
  });

  describe('getCacheTTL', () => {
    it('should return default values when no env provided', () => {
      expect(getCacheTTL('hot')).toBe(DEFAULT_TTL.hot);
      expect(getCacheTTL('cold')).toBe(DEFAULT_TTL.cold);
      expect(getCacheTTL('isbn')).toBe(DEFAULT_TTL.isbn);
      expect(getCacheTTL('title')).toBe(DEFAULT_TTL.title);
      expect(getCacheTTL('author')).toBe(DEFAULT_TTL.author);
      expect(getCacheTTL('enrichment')).toBe(DEFAULT_TTL.enrichment);
      expect(getCacheTTL('cover')).toBe(DEFAULT_TTL.cover);
    });

    it('should return default values when env is empty object', () => {
      const env = {};
      expect(getCacheTTL('hot', env)).toBe(DEFAULT_TTL.hot);
      expect(getCacheTTL('cold', env)).toBe(DEFAULT_TTL.cold);
    });

    it('should use env variable when provided', () => {
      const env = {
        CACHE_HOT_TTL: '3600', // 1 hour
        CACHE_COLD_TTL: '86400', // 1 day
        CACHE_TTL_ISBN: '2592000', // 30 days
      };

      expect(getCacheTTL('hot', env)).toBe(3600);
      expect(getCacheTTL('cold', env)).toBe(86400);
      expect(getCacheTTL('isbn', env)).toBe(2592000);
    });

    it('should fall back to default when env variable is invalid', () => {
      const env = {
        CACHE_HOT_TTL: 'invalid',
        CACHE_COLD_TTL: '-100',
        CACHE_TTL_ISBN: '0',
      };

      expect(getCacheTTL('hot', env)).toBe(DEFAULT_TTL.hot);
      expect(getCacheTTL('cold', env)).toBe(DEFAULT_TTL.cold);
      expect(getCacheTTL('isbn', env)).toBe(DEFAULT_TTL.isbn);
    });

    it('should fall back to cold TTL for unknown types', () => {
      expect(getCacheTTL('unknown')).toBe(DEFAULT_TTL.cold);
      expect(getCacheTTL('invalid', {})).toBe(DEFAULT_TTL.cold);
    });
  });

  describe('getAllCacheTTLs', () => {
    it('should return all default TTLs when no env provided', () => {
      const ttls = getAllCacheTTLs();

      expect(ttls.hot).toBe(DEFAULT_TTL.hot);
      expect(ttls.cold).toBe(DEFAULT_TTL.cold);
      expect(ttls.isbn).toBe(DEFAULT_TTL.isbn);
      expect(ttls.title).toBe(DEFAULT_TTL.title);
      expect(ttls.author).toBe(DEFAULT_TTL.author);
      expect(ttls.enrichment).toBe(DEFAULT_TTL.enrichment);
      expect(ttls.cover).toBe(DEFAULT_TTL.cover);
    });

    it('should return all TTLs with env overrides', () => {
      const env = {
        CACHE_HOT_TTL: '1800', // 30 min
        CACHE_TTL_TITLE: '43200', // 12 hours
      };

      const ttls = getAllCacheTTLs(env);

      expect(ttls.hot).toBe(1800);
      expect(ttls.cold).toBe(DEFAULT_TTL.cold); // Not overridden
      expect(ttls.title).toBe(43200);
      expect(ttls.isbn).toBe(DEFAULT_TTL.isbn); // Not overridden
    });

    it('should return consistent TTLs across multiple calls', () => {
      const env = { CACHE_HOT_TTL: '3600' };

      const ttls1 = getAllCacheTTLs(env);
      const ttls2 = getAllCacheTTLs(env);

      expect(ttls1.hot).toBe(ttls2.hot);
      expect(ttls1.cold).toBe(ttls2.cold);
    });
  });

  describe('Integration with KVCacheService', () => {
    it('should provide consistent TTLs matching kv-cache.js expectations', () => {
      const ttls = getAllCacheTTLs();

      // Verify KVCacheService will get expected TTL structure
      expect(ttls).toHaveProperty('title');
      expect(ttls).toHaveProperty('isbn');
      expect(ttls).toHaveProperty('author');
      expect(ttls).toHaveProperty('enrichment');
      expect(ttls).toHaveProperty('cover');
    });
  });

  describe('Integration with external-apis.ts', () => {
    it('should provide hot/cold TTLs for cache-service.js', () => {
      const env = {
        CACHE_HOT_TTL: '7200',
        CACHE_COLD_TTL: '1209600',
      };

      expect(getCacheTTL('hot', env)).toBe(7200);
      expect(getCacheTTL('cold', env)).toBe(1209600);
    });
  });
});
