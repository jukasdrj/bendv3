/**
 * Wikidata Author Enrichment Service
 *
 * Enriches author metadata with cultural diversity data from Wikidata:
 * - Gender (male, female, non-binary, other, unknown)
 * - Nationality (country name)
 * - Birth year / Death year
 *
 * API: https://www.wikidata.org/w/api.php
 * Search: https://www.wikidata.org/w/api.php?action=wbsearchentities
 * Data: https://www.wikidata.org/wiki/Special:EntityData/{entityId}.json
 */

import type { AuthorGender, CulturalRegion } from '../types/enums.js';

/**
 * Wikidata author enrichment result
 */
export interface WikidataAuthorData {
  gender: AuthorGender;
  nationality?: string;
  culturalRegion?: CulturalRegion;
  birthYear?: number;
  deathYear?: number;
  wikidataId?: string;
}

/**
 * Map Wikidata gender ID to AuthorGender enum
 *
 * Wikidata gender property (P21):
 * - Q6581097: male
 * - Q6581072: female
 * - Q1052281: transgender female
 * - Q2449503: transgender male
 * - Q48270: non-binary
 * - Q1097630: intersex
 */
function mapWikidataGender(genderId?: string): AuthorGender {
  if (!genderId) return 'Unknown';

  switch (genderId) {
    case 'Q6581097': // male
    case 'Q2449503': // transgender male
      return 'Male';
    case 'Q6581072': // female
    case 'Q1052281': // transgender female
      return 'Female';
    case 'Q48270': // non-binary
    case 'Q1097630': // intersex
      return 'Non-binary';
    default:
      return 'Unknown';
  }
}

/**
 * Map country/nationality to CulturalRegion
 * Based on geographic and cultural groupings
 */
function mapNationalityToCulturalRegion(nationality: string): CulturalRegion | undefined {
  const nationalityLower = nationality.toLowerCase();

  // Africa
  if (nationalityLower.match(/nigeria|kenya|ghana|south africa|egypt|morocco|ethiopia|tanzania|uganda|algeria|sudan|senegal|zimbabwe|rwanda|tunisia|cameroon|ivory coast|angola|madagascar|zambia|mozambique|botswana|namibia|mauritius|malawi|congo|somalia|mali|burkina faso|sierra leone|togo|benin|chad|liberia|guinea|gabon/)) {
    return 'Africa';
  }

  // Asia
  if (nationalityLower.match(/china|japan|korea|india|thailand|vietnam|philippines|indonesia|malaysia|singapore|taiwan|hong kong|pakistan|bangladesh|myanmar|cambodia|laos|sri lanka|nepal|mongolia|bhutan|afghanistan|maldives/)) {
    return 'Asia';
  }

  // Europe
  if (nationalityLower.match(/uk|england|scotland|wales|ireland|france|germany|italy|spain|russia|poland|ukraine|romania|netherlands|belgium|czech|greece|portugal|sweden|hungary|austria|switzerland|denmark|finland|norway|slovakia|croatia|serbia|bulgaria|belarus|lithuania|slovenia|latvia|estonia|albania|macedonia|bosnia|iceland|malta|luxembourg|montenegro|cyprus/)) {
    return 'Europe';
  }

  // North America
  if (nationalityLower.match(/united states|usa|canada|mexico|cuba|jamaica|haiti|dominican republic|guatemala|honduras|nicaragua|el salvador|costa rica|panama|bahamas|trinidad|barbados|belize/)) {
    return 'North America';
  }

  // South America
  if (nationalityLower.match(/brazil|argentina|colombia|venezuela|peru|chile|ecuador|bolivia|paraguay|uruguay|guyana|suriname|french guiana/)) {
    return 'South America';
  }

  // Middle East
  if (nationalityLower.match(/saudi arabia|iran|iraq|israel|palestine|jordan|lebanon|syria|yemen|oman|kuwait|bahrain|qatar|uae|emirates|turkey/)) {
    return 'Middle East';
  }

  // Oceania
  if (nationalityLower.match(/australia|new zealand|fiji|papua new guinea|samoa|tonga|solomon islands|vanuatu|micronesia|palau|kiribati|marshall islands|nauru|tuvalu/)) {
    return 'Oceania';
  }

  // Caribbean (sometimes grouped separately from North America)
  if (nationalityLower.match(/caribbean|west indies|antigua|grenada|st lucia|st vincent|dominica|st kitts/)) {
    return 'Caribbean';
  }

  // Central Asia (sometimes grouped separately from Asia)
  if (nationalityLower.match(/kazakhstan|uzbekistan|turkmenistan|kyrgyzstan|tajikistan/)) {
    return 'Central Asia';
  }

  // Indigenous peoples (special category)
  if (nationalityLower.match(/indigenous|aboriginal|maori|native american|first nations|inuit/)) {
    return 'Indigenous';
  }

  // International (authors with multiple nationalities or stateless)
  if (nationalityLower.match(/international|stateless|multiple|dual|refugee/)) {
    return 'International';
  }

  return undefined; // Unknown region
}

/**
 * Search Wikidata for author by name
 * Returns Wikidata entity ID (e.g., "Q5673")
 */
async function searchWikidataAuthor(authorName: string): Promise<string | null> {
  const searchUrl = new URL('https://www.wikidata.org/w/api.php');
  searchUrl.searchParams.set('action', 'wbsearchentities');
  searchUrl.searchParams.set('search', authorName);
  searchUrl.searchParams.set('language', 'en');
  searchUrl.searchParams.set('type', 'item');
  searchUrl.searchParams.set('limit', '1');
  searchUrl.searchParams.set('format', 'json');

  try {
    const response = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'BooksTrack/1.0 (https://api.oooefam.net; contact@oooefam.net)',
      },
    });

    if (!response.ok) {
      console.error(`[Wikidata] Search failed for "${authorName}": ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (!data.search || data.search.length === 0) {
      console.log(`[Wikidata] No results for "${authorName}"`);
      return null;
    }

    // Return first result's entity ID
    const entityId = data.search[0].id;
    console.log(`[Wikidata] Found "${authorName}" → ${entityId}`);
    return entityId;
  } catch (error: any) {
    console.error(`[Wikidata] Search error for "${authorName}":`, error.message);
    return null;
  }
}

/**
 * Fetch author data from Wikidata entity
 */
async function fetchWikidataEntity(entityId: string): Promise<any> {
  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`;

  try {
    const response = await fetch(entityUrl, {
      headers: {
        'User-Agent': 'BooksTrack/1.0 (https://api.oooefam.net; contact@oooefam.net)',
      },
    });

    if (!response.ok) {
      console.error(`[Wikidata] Entity fetch failed for ${entityId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.entities[entityId];
  } catch (error: any) {
    console.error(`[Wikidata] Entity fetch error for ${entityId}:`, error.message);
    return null;
  }
}

/**
 * Extract year from Wikidata time value
 * Format: "+1949-06-08T00:00:00Z" → 1949
 */
function extractYearFromWikidataTime(timeValue?: string): number | undefined {
  if (!timeValue) return undefined;
  const match = timeValue.match(/^[+-]?(\d{1,4})-/);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Get property value from Wikidata entity
 * Properties: P21 (gender), P27 (nationality), P569 (birth), P570 (death)
 */
function getPropertyValue(entity: any, propertyId: string): string | undefined {
  const claims = entity?.claims?.[propertyId];
  if (!claims || claims.length === 0) return undefined;

  const mainSnak = claims[0]?.mainsnak;
  if (!mainSnak?.datavalue) return undefined;

  // Handle entity references (e.g., gender, nationality)
  if (mainSnak.datavalue.type === 'wikibase-entityid') {
    return mainSnak.datavalue.value.id;
  }

  // Handle time values (e.g., birth/death dates)
  if (mainSnak.datavalue.type === 'time') {
    return mainSnak.datavalue.value.time;
  }

  // Handle string values
  if (mainSnak.datavalue.type === 'string') {
    return mainSnak.datavalue.value;
  }

  return undefined;
}

/**
 * Get label for Wikidata entity ID
 * Used to resolve nationality name from country ID
 */
function getEntityLabel(entity: any): string | undefined {
  return entity?.labels?.en?.value;
}

/**
 * Enrich author with Wikidata metadata
 *
 * @param authorName - Author name to search for
 * @param env - Worker environment (for KV caching)
 * @returns WikidataAuthorData or null if not found
 */
export async function enrichAuthorWithWikidata(
  authorName: string,
  env: any
): Promise<WikidataAuthorData | null> {
  // Check KV cache first (7-day TTL - author metadata is stable)
  const cacheKey = `wikidata:author:${authorName.toLowerCase()}`;
  const cached = await env.KV_CACHE?.get(cacheKey, 'json');

  if (cached) {
    console.log(`[Wikidata] Cache HIT for "${authorName}"`);
    return cached as WikidataAuthorData;
  }

  // Step 1: Search for author entity
  const entityId = await searchWikidataAuthor(authorName);
  if (!entityId) {
    // Cache negative result (author not found)
    const notFoundResult: WikidataAuthorData = { gender: 'Unknown' };
    await env.KV_CACHE?.put(cacheKey, JSON.stringify(notFoundResult), {
      expirationTtl: 604800, // 7 days
    });
    return notFoundResult;
  }

  // Step 2: Fetch entity data
  const entity = await fetchWikidataEntity(entityId);
  if (!entity) {
    const notFoundResult: WikidataAuthorData = { gender: 'Unknown' };
    return notFoundResult;
  }

  // Step 3: Extract properties
  const genderId = getPropertyValue(entity, 'P21'); // gender
  const nationalityId = getPropertyValue(entity, 'P27'); // country of citizenship
  const birthTime = getPropertyValue(entity, 'P569'); // date of birth
  const deathTime = getPropertyValue(entity, 'P570'); // date of death

  // Step 4: Resolve nationality label (requires second API call)
  let nationality: string | undefined;
  if (nationalityId) {
    const nationalityEntity = await fetchWikidataEntity(nationalityId);
    nationality = getEntityLabel(nationalityEntity);
  }

  // Step 5: Build enrichment result
  const result: WikidataAuthorData = {
    gender: mapWikidataGender(genderId),
    nationality,
    culturalRegion: nationality ? mapNationalityToCulturalRegion(nationality) : undefined,
    birthYear: extractYearFromWikidataTime(birthTime),
    deathYear: extractYearFromWikidataTime(deathTime),
    wikidataId: entityId,
  };

  console.log(`[Wikidata] Enriched "${authorName}":`, result);

  // Cache result for 7 days
  await env.KV_CACHE?.put(cacheKey, JSON.stringify(result), {
    expirationTtl: 604800, // 7 days
  });

  return result;
}
