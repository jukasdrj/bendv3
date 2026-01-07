// test/cache-keys.test.js
import { describe, test, expect } from 'vitest';
import { generateCSVCacheKey, generateISBNCacheKey } from '../src/utils/cache/cache-keys.js';

describe('Cache Key Generation', () => {
  test('CSV cache key includes content hash', async () => {
    const csv = 'Title,Author\nBook1,Author1';
    const key = await generateCSVCacheKey(csv);

    expect(key).toContain('csv-parse:');
    expect(key).toMatch(/^csv-parse:[a-f0-9]{64}:\d+$/); // Format: csv-parse:{64-char-hash}:{version}
  });

  test('different CSV content produces different hash', async () => {
    const csv1 = 'Title,Author\nBook1,Author1';
    const csv2 = 'Title,Author\nBook2,Author2';

    const key1 = await generateCSVCacheKey(csv1);
    const key2 = await generateCSVCacheKey(csv2);

    expect(key1).not.toBe(key2);
  });


  test('ISBN cache key normalizes ISBN13', () => {
    const key = generateISBNCacheKey('978-0-7432-7356-5');
    expect(key).toBe('book:isbn:9780743273565');
  });
});
