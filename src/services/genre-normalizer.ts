/**
 * Genre Normalization Service
 * Transforms provider-specific genres into canonical subjectTags
 *
 * EXPANDED TAXONOMY (Issue #185): 44 → 92 canonical genres
 * Research: Amazon Kindle (14,000+ categories), Goodreads, 2026 trends
 * Added: Cozy Fantasy, Techno-Thriller, Romantasy, Folk Horror, LitRPG, etc.
 */

import { levenshteinDistance } from '../utils/book/string-similarity.js'

/**
 * Canonical genre taxonomy (92 genres)
 * Maps variations → canonical names
 */
const CANONICAL_GENRES: Record<string, string[]> = {
  // ============================================================================
  // FICTION - Core Genres (8 genres)
  // ============================================================================

  'Science Fiction': ['Sci-Fi', 'Science Fiction', 'SF', 'Scifi', 'Sci Fi'],
  'Fantasy': ['Fantasy', 'Fantasie'],
  'Mystery': ['Mystery', 'Detective', 'Whodunit', 'Mystrey'],
  'Thriller': ['Thriller', 'Suspense'],
  'Romance': ['Romance', 'Love Story'],
  'Horror': ['Horror', 'Scary'],
  'Literary Fiction': ['Literary', 'Literature', 'Literary Fiction'],
  'Historical Fiction': ['Historical Fiction', 'Historical Novel'],

  // ============================================================================
  // SCIENCE FICTION - Subgenres (10 genres)
  // ============================================================================

  'Cyberpunk': ['Cyberpunk', 'Cyber Punk', 'Cyber-punk'],
  'Steampunk': ['Steampunk', 'Steam Punk', 'Steam-punk'],
  'Solarpunk': ['Solarpunk', 'Solar Punk', 'Solar-punk', 'Climate Fiction', 'Cli-Fi'],
  'Space Opera': ['Space Opera', 'Galactic Empire', 'Space Adventure'],
  'Time Travel': ['Time Travel', 'Time-Travel Fiction', 'Time Travel Fiction'],
  'Dystopian': ['Dystopian', 'Dystopia', 'Dystopian Fiction'],
  'Utopian': ['Utopian', 'Utopia'],
  'Post-Apocalyptic': ['Post-Apocalyptic', 'Post Apocalyptic', 'Apocalyptic', 'Post-Apocalypse'],
  'Hard Science Fiction': ['Hard SF', 'Hard Science Fiction', 'Hard Sci-Fi'],
  'Soft Science Fiction': ['Soft SF', 'Soft Science Fiction', 'Soft Sci-Fi'],

  // ============================================================================
  // FANTASY - Subgenres (10 genres)
  // ============================================================================

  'Epic Fantasy': ['Epic Fantasy', 'High Fantasy'],
  'Urban Fantasy': ['Urban Fantasy'],
  'Dark Fantasy': ['Dark Fantasy'],
  'Paranormal': ['Paranormal', 'Paranormal Fiction'],
  'Cozy Fantasy': ['Cozy Fantasy', 'Low-Stakes Fantasy', 'Comfort Fantasy'], // 2026 trend
  'Fairy Tales': ['Fairy Tale', 'Fairy Tales', 'Fairytale', 'Fairy tale'],
  'Magical Realism': ['Magical Realism', 'Magic Realism'],
  'Sword & Sorcery': ['Sword and Sorcery', 'Sword & Sorcery', 'Sword and sorcery'],
  'Romantasy': ['Romantasy', 'Fantasy Romance'], // 2026 trend
  'Portal Fantasy': ['Portal Fantasy', 'Isekai'],

  // ============================================================================
  // MYSTERY & THRILLER - Subgenres (12 genres)
  // ============================================================================

  'Cozy Mystery': ['Cozy Mystery', 'Cosy Mystery'],
  'Police Procedural': ['Police Procedural'],
  'Noir': ['Noir', 'Hardboiled', 'Hard-boiled', 'Hard boiled'],
  'Crime Fiction': ['Crime Fiction', 'Crime'],
  'Legal Thriller': ['Legal Thriller', 'Courtroom Drama', 'Legal Drama'],
  'Espionage': ['Spy Thriller', 'Espionage', 'Spy Fiction', 'Spy'],
  'Psychological Thriller': ['Psychological Thriller', 'Psychological Suspense'],
  'Domestic Suspense': ['Domestic Thriller', 'Domestic Suspense'], // 2026 trend
  'Techno-Thriller': ['Techno-Thriller', 'Tech Thriller', 'Technology Thriller', 'Techno Thriller'], // 2026 trend
  'Medical Thriller': ['Medical Thriller'],
  'Action Thriller': ['Action Thriller', 'Action & Adventure', 'Action'],
  'Political Thriller': ['Political Thriller'],

  // ============================================================================
  // ROMANCE - Subgenres (9 genres)
  // ============================================================================

  'Contemporary Romance': ['Contemporary Romance', 'Modern Romance'],
  'Historical Romance': ['Historical Romance', 'Regency Romance', 'Regency'],
  'Paranormal Romance': ['Paranormal Romance'],
  'Romantic Suspense': ['Romantic Suspense'],
  'Romantic Comedy': ['Rom-Com', 'Romantic Comedy', 'RomCom', 'Rom Com'],
  'New Adult Romance': ['New Adult', 'NA Romance', 'NA'],
  'Erotic Romance': ['Erotic Romance', 'Erotica'],
  'LGBTQ+ Romance': ['LGBTQ Romance', 'Queer Romance', 'Gay Romance', 'Lesbian Romance', 'LGBTQ+ Romance'],
  'Western Romance': ['Western Romance', 'Cowboy Romance'],

  // ============================================================================
  // HORROR - Subgenres (8 genres)
  // ============================================================================

  'Gothic Horror': ['Gothic', 'Gothic Fiction', 'Gothic Horror'], // 2026 trend
  'Folk Horror': ['Folk Horror'], // 2026 trend
  'Cosmic Horror': ['Cosmic Horror', 'Lovecraftian'],
  'Psychological Horror': ['Psychological Horror'],
  'Supernatural Horror': ['Supernatural Horror', 'Supernatural'],
  'Body Horror': ['Body Horror'],
  'Splatterpunk': ['Splatterpunk', 'Extreme Horror'],
  'Ghost Stories': ['Ghost Story', 'Ghost Stories', 'Haunted House', 'Ghosts'],

  // ============================================================================
  // NON-FICTION - Core Categories (7 genres)
  // ============================================================================

  'Biography': ['Biography', 'Memoir', 'Autobiography', 'Biographies'],
  'History': ['History', 'Historical'],
  'Science': ['Science', 'Popular Science'],
  'Philosophy': ['Philosophy', 'Philosophical'],
  'Self-Help': ['Self-Help', 'Self Improvement', 'Personal Development', 'Self Help'],
  'Business': ['Business', 'Economics', 'Entrepreneurship'],
  'True Crime': ['True Crime', 'Crime'],

  // ============================================================================
  // NON-FICTION - Expanded Categories (15 genres)
  // ============================================================================

  'Psychology': ['Psychology', 'Behavioral Science'],
  'Health & Wellness': ['Health', 'Wellness', 'Fitness', 'Health & Wellness'],
  'Spirituality': ['Spirituality', 'Religion', 'Faith', 'Religious'],
  'Travel': ['Travel', 'Travel Writing'],
  'Cookbooks': ['Cookbook', 'Cooking', 'Recipes', 'Cookbooks'],
  'Art & Photography': ['Art', 'Photography', 'Design'],
  'Music': ['Music', 'Music Theory'],
  'Technology': ['Technology', 'Computing', 'Programming', 'Tech'],
  'Nature': ['Nature', 'Natural History', 'Environment', 'Environmental'],
  'Politics': ['Politics', 'Political Science', 'Government'],
  'Sports': ['Sports', 'Athletics'],
  'Humor': ['Humor', 'Comedy', 'Satire', 'Humour'],
  'Essays': ['Essays', 'Essay Collection', 'Essay'],
  'Education': ['Education', 'Teaching', 'Learning'],
  'Parenting': ['Parenting', 'Childcare', 'Family'],

  // ============================================================================
  // AGE GROUPS (3 genres)
  // ============================================================================

  'Young Adult': ['Young Adult', 'YA', 'Teen'],
  "Children's": ["Children's", 'Kids', 'Juvenile', 'Children', "Childrens"],
  'Middle Grade': ['Middle Grade', 'MG'],

  // ============================================================================
  // SPECIAL CATEGORIES (10 genres)
  // ============================================================================

  'Classics': ['Classic', 'Classics', 'Classical'],
  'Contemporary': ['Contemporary', 'Modern'],
  'Graphic Novels': ['Graphic Novel', 'Comics', 'Manga', 'Webcomic', 'Comic'],
  'Poetry': ['Poetry', 'Poems', 'Verse'],
  'Fiction': ['Fiction', 'General Fiction'],
  'Drama': ['Drama', 'Plays', 'Theatre', 'Theater'],
  'Short Stories': ['Short Story', 'Short Stories', 'Story Collection', 'Short Fiction'],
  'Anthologies': ['Anthology', 'Anthologies', 'Collection'],
  'LitRPG': ['LitRPG', 'Lit RPG', 'GameLit', 'Game Literature'],
  'Alternate History': ['Alternate History', 'Alternative History', 'What If', 'Alternate history'],
}

/**
 * Provider-specific genre mappings
 * Handles exact matches for known provider formats
 * EXPANDED (Issue #185): Added 60+ new mappings for subgenres
 */
const PROVIDER_MAPPINGS: Record<string, string[]> = {
  // ============================================================================
  // GOOGLE BOOKS - Hierarchical format (Fiction / Genre / Subgenre)
  // ============================================================================

  // Science Fiction subgenres
  'Fiction / Science Fiction / General': ['Science Fiction', 'Fiction'],
  'Fiction / Science Fiction / Dystopian': ['Science Fiction', 'Dystopian', 'Fiction'],
  'Fiction / Science Fiction / Cyberpunk': ['Cyberpunk', 'Science Fiction', 'Fiction'],
  'Fiction / Science Fiction / Steampunk': ['Steampunk', 'Science Fiction', 'Fiction'],
  'Fiction / Science Fiction / Space Opera': ['Space Opera', 'Science Fiction', 'Fiction'],
  'Fiction / Science Fiction / Time Travel': ['Time Travel', 'Science Fiction', 'Fiction'],
  'Fiction / Science Fiction / Post-Apocalyptic': ['Post-Apocalyptic', 'Science Fiction', 'Fiction'],
  'Fiction / Science Fiction / Hard Science Fiction': ['Hard Science Fiction', 'Science Fiction', 'Fiction'],

  // Fantasy subgenres
  'Fiction / Fantasy / General': ['Fantasy', 'Fiction'],
  'Fiction / Fantasy / Epic': ['Epic Fantasy', 'Fantasy', 'Fiction'],
  'Fiction / Fantasy / Urban': ['Urban Fantasy', 'Fantasy', 'Fiction'],
  'Fiction / Fantasy / Dark Fantasy': ['Dark Fantasy', 'Fantasy', 'Fiction'],
  'Fiction / Fantasy / Paranormal': ['Paranormal', 'Fantasy', 'Fiction'],
  'Fiction / Fantasy / Historical': ['Historical Fiction', 'Fantasy', 'Fiction'],
  'Fiction / Fairy Tales, Folk Tales, Legends & Mythology': ['Fairy Tales', 'Fiction'],

  // Mystery & Thriller subgenres
  'Fiction / Mystery & Detective / General': ['Mystery', 'Fiction'],
  'Fiction / Mystery & Detective / Cozy': ['Cozy Mystery', 'Mystery', 'Fiction'],
  'Fiction / Mystery & Detective / Police Procedural': ['Police Procedural', 'Mystery', 'Fiction'],
  'Fiction / Mystery & Detective / Hard-Boiled': ['Noir', 'Mystery', 'Fiction'],
  'Fiction / Thrillers / General': ['Thriller', 'Fiction'],
  'Fiction / Thrillers / Psychological': ['Psychological Thriller', 'Thriller', 'Fiction'],
  'Fiction / Thrillers / Espionage': ['Espionage', 'Thriller', 'Fiction'],
  'Fiction / Thrillers / Legal': ['Legal Thriller', 'Thriller', 'Fiction'],
  'Fiction / Thrillers / Medical': ['Medical Thriller', 'Thriller', 'Fiction'],
  'Fiction / Thrillers / Political': ['Political Thriller', 'Thriller', 'Fiction'],
  'Fiction / Thrillers / Technological': ['Techno-Thriller', 'Thriller', 'Fiction'],
  'Fiction / Crime': ['Crime Fiction', 'Fiction'],

  // Romance subgenres
  'Fiction / Romance / General': ['Romance', 'Fiction'],
  'Fiction / Romance / Contemporary': ['Contemporary Romance', 'Romance', 'Fiction'],
  'Fiction / Romance / Historical': ['Historical Romance', 'Romance', 'Fiction'],
  'Fiction / Romance / Paranormal': ['Paranormal Romance', 'Romance', 'Fiction'],
  'Fiction / Romance / Suspense': ['Romantic Suspense', 'Romance', 'Fiction'],
  'Fiction / Romance / Comedy': ['Romantic Comedy', 'Romance', 'Fiction'],
  'Fiction / Romance / New Adult': ['New Adult Romance', 'Romance', 'Fiction'],
  'Fiction / Romance / Erotic': ['Erotic Romance', 'Romance', 'Fiction'],
  'Fiction / Romance / LGBTQ+': ['LGBTQ+ Romance', 'Romance', 'Fiction'],
  'Fiction / Romance / Western': ['Western Romance', 'Romance', 'Fiction'],

  // Horror subgenres
  'Fiction / Horror': ['Horror', 'Fiction'],
  'Fiction / Horror / General': ['Horror', 'Fiction'],
  'Fiction / Ghost': ['Ghost Stories', 'Horror', 'Fiction'],
  'Fiction / Gothic': ['Gothic Horror', 'Horror', 'Fiction'],
  'Fiction / Occult & Supernatural': ['Supernatural Horror', 'Horror', 'Fiction'],

  // Other Fiction
  'Fiction / Literary': ['Literary Fiction', 'Fiction'],
  'Fiction / Historical / General': ['Historical Fiction', 'Fiction'],
  'Fiction / Action & Adventure': ['Action Thriller', 'Fiction'],
  'Fiction / Magical Realism': ['Magical Realism', 'Fiction'],

  // ============================================================================
  // ISBNDB - Uses "&" separators
  // ============================================================================

  'Science Fiction & Fantasy': ['Science Fiction', 'Fantasy'],
  'Mystery & Thriller': ['Mystery', 'Thriller'],
  'Romance & Fiction': ['Romance', 'Fiction'],
  'Horror & Supernatural': ['Horror', 'Supernatural Horror'],
  'Young Adult & Teen': ['Young Adult', 'Fiction'],

  // ============================================================================
  // OPENLIBRARY - Descriptive subjects (lowercase)
  // ============================================================================

  // Science Fiction
  'Science fiction': ['Science Fiction'],
  'Dystopian fiction': ['Dystopian', 'Science Fiction'],
  'Cyberpunk fiction': ['Cyberpunk', 'Science Fiction'],
  'Steampunk fiction': ['Steampunk', 'Science Fiction'],
  'Space opera': ['Space Opera', 'Science Fiction'],
  'Time travel fiction': ['Time Travel', 'Science Fiction'],
  'Post-apocalyptic fiction': ['Post-Apocalyptic', 'Science Fiction'],

  // Fantasy
  'Fantasy fiction': ['Fantasy'],
  'Epic fantasy': ['Epic Fantasy', 'Fantasy'],
  'Urban fantasy': ['Urban Fantasy', 'Fantasy'],
  'Dark fantasy': ['Dark Fantasy', 'Fantasy'],
  'Fairy tales': ['Fairy Tales'],
  'Magic realism': ['Magical Realism'],

  // Mystery & Thriller
  'Detective and mystery stories': ['Mystery'],
  'Mystery fiction': ['Mystery'],
  'Thriller fiction': ['Thriller'],
  'Crime fiction': ['Crime Fiction'],
  'Spy stories': ['Espionage'],
  'Police procedural': ['Police Procedural'],

  // Romance
  'Romance fiction': ['Romance'],
  'Historical romance': ['Historical Romance'],
  'Paranormal romance': ['Paranormal Romance'],

  // Horror
  'Horror fiction': ['Horror'],
  'Ghost stories': ['Ghost Stories'],
  'Gothic fiction': ['Gothic Horror'],
  'Supernatural fiction': ['Supernatural Horror'],

  // Other
  'Classic Literature': ['Classics', 'Literary Fiction'],
  'Historical fiction': ['Historical Fiction'],
  'Literary fiction': ['Literary Fiction'],

  // ============================================================================
  // GEMINI AI - Free-form genres
  // ============================================================================

  'Sci-fi dystopia': ['Science Fiction', 'Dystopian'],
  'Cozy fantasy': ['Cozy Fantasy', 'Fantasy'],
  'Romantasy': ['Romantasy', 'Romance', 'Fantasy'],
  'Techno-thriller': ['Techno-Thriller', 'Thriller'],
  'Folk horror': ['Folk Horror', 'Horror'],
  'LitRPG': ['LitRPG', 'Fantasy'],
}

/**
 * Genre Normalizer Service
 * Transforms provider-specific genres into canonical subjectTags
 */
export class GenreNormalizer {
  private readonly fuzzyThreshold = 0.85

  /**
   * Normalize raw genres from any provider to canonical subjectTags
   * @param rawGenres - Raw genre strings from provider
   * @param provider - Provider name ('google-books', 'openlibrary', etc.)
   * @returns Array of canonical genre tags (sorted, deduplicated)
   */
  normalize(rawGenres: string[], provider: string): string[] {
    const normalized: Set<string> = new Set()

    for (const raw of rawGenres) {
      // 1. Provider-specific preprocessing
      const cleaned = this.preprocess(raw, provider)

      // 2. Exact mapping lookup
      const exactMatch = PROVIDER_MAPPINGS[cleaned]
      if (exactMatch) {
        for (const tag of exactMatch) {
          normalized.add(tag)
        }
        continue
      }

      // 3. Check canonical genre variations
      const canonicalMatch = this.findCanonicalMatch(cleaned)
      if (canonicalMatch) {
        normalized.add(canonicalMatch)
        continue
      }

      // 4. Fuzzy matching for unmapped genres
      const fuzzyMatch = this.findFuzzyMatch(cleaned)
      if (fuzzyMatch) {
        normalized.add(fuzzyMatch)
      } else {
        // Pass through if no match found (user might have custom tags)
        normalized.add(cleaned)
      }
    }

    // Sort alphabetically for consistency
    return Array.from(normalized).sort()
  }

  /**
   * Provider-specific preprocessing
   * - Google Books: Attempts exact match for hierarchical genres (e.g., "Fiction / Science Fiction / General") via PROVIDER_MAPPINGS, falls back to fuzzy matching
   * - OpenLibrary: Lowercase normalization, trim
   * - ISBNDB: Split "&" separators
   */
  private preprocess(raw: string, provider: string): string {
    // Trim whitespace
    const cleaned = raw.trim()

    // Provider-specific transformations
    if (provider === 'google-books') {
      // Google Books uses hierarchical format "Fiction / Science Fiction / General"
      // We check the full string first in PROVIDER_MAPPINGS
      // If not found, we'll fuzzy match
      return cleaned
    }

    if (provider === 'isbndb') {
      // ISBNDB uses "&" separators - but we check full string first
      return cleaned
    }

    if (provider === 'openlibrary') {
      // OpenLibrary uses lowercase descriptive subjects
      // Capitalize first letter for consistency
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()
    }

    return cleaned
  }

  /**
   * Find canonical genre by checking all variations
   */
  private findCanonicalMatch(genre: string): string | null {
    const lowerGenre = genre.toLowerCase()

    for (const [canonical, variations] of Object.entries(CANONICAL_GENRES)) {
      if (variations.some((v) => v.toLowerCase() === lowerGenre)) {
        return canonical
      }
    }

    return null
  }

  /**
   * Find fuzzy match using Levenshtein distance
   * Returns canonical genre if similarity > threshold (85%)
   */
  private findFuzzyMatch(genre: string): string | null {
    const lowerGenre = genre.toLowerCase()
    let bestMatch: string | null = null
    let bestSimilarity = 0

    for (const canonical of Object.keys(CANONICAL_GENRES)) {
      const distance = levenshteinDistance(lowerGenre, canonical.toLowerCase())
      const maxLen = Math.max(lowerGenre.length, canonical.length)
      const similarity = 1 - distance / maxLen

      if (similarity > bestSimilarity && similarity >= this.fuzzyThreshold) {
        bestMatch = canonical
        bestSimilarity = similarity
      }
    }

    return bestMatch
  }
}
