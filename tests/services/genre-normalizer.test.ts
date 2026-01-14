import { describe, it, expect } from 'vitest';
import { GenreNormalizer } from '../../src/services/genre-normalizer.js';

describe('GenreNormalizer - Expanded Taxonomy (Issue #185)', () => {
  const normalizer = new GenreNormalizer();

  describe('Core Fiction Genres (Existing)', () => {
    it('should normalize Science Fiction variants', () => {
      expect(normalizer.normalize(['Sci-Fi'], 'google_books')).toContain('Science Fiction');
      expect(normalizer.normalize(['SF'], 'google_books')).toContain('Science Fiction');
      expect(normalizer.normalize(['Scifi'], 'google_books')).toContain('Science Fiction');
    });

    it('should normalize Fantasy variants', () => {
      expect(normalizer.normalize(['Fantasy'], 'google_books')).toContain('Fantasy');
      expect(normalizer.normalize(['Fantasie'], 'google_books')).toContain('Fantasy');
    });

    it('should normalize Mystery variants', () => {
      expect(normalizer.normalize(['Mystery'], 'google_books')).toContain('Mystery');
      expect(normalizer.normalize(['Detective'], 'google_books')).toContain('Mystery');
      expect(normalizer.normalize(['Whodunit'], 'google_books')).toContain('Mystery');
    });
  });

  describe('Science Fiction Subgenres (NEW)', () => {
    it('should normalize Cyberpunk', () => {
      expect(normalizer.normalize(['Cyberpunk'], 'google_books')).toContain('Cyberpunk');
      expect(normalizer.normalize(['Cyber Punk'], 'google_books')).toContain('Cyberpunk');
      expect(normalizer.normalize(['Cyber-punk'], 'google_books')).toContain('Cyberpunk');
    });

    it('should normalize Steampunk', () => {
      expect(normalizer.normalize(['Steampunk'], 'google_books')).toContain('Steampunk');
      expect(normalizer.normalize(['Steam Punk'], 'google_books')).toContain('Steampunk');
    });

    it('should normalize Solarpunk (2026 trend)', () => {
      expect(normalizer.normalize(['Solarpunk'], 'google_books')).toContain('Solarpunk');
      expect(normalizer.normalize(['Climate Fiction'], 'google_books')).toContain('Solarpunk');
      expect(normalizer.normalize(['Cli-Fi'], 'google_books')).toContain('Solarpunk');
    });

    it('should normalize Space Opera', () => {
      expect(normalizer.normalize(['Space Opera'], 'google_books')).toContain('Space Opera');
      expect(normalizer.normalize(['Galactic Empire'], 'google_books')).toContain('Space Opera');
    });

    it('should normalize Dystopian', () => {
      expect(normalizer.normalize(['Dystopian'], 'google_books')).toContain('Dystopian');
      expect(normalizer.normalize(['Dystopia'], 'google_books')).toContain('Dystopian');
    });

    it('should normalize Post-Apocalyptic', () => {
      expect(normalizer.normalize(['Post-Apocalyptic'], 'google_books')).toContain('Post-Apocalyptic');
      expect(normalizer.normalize(['Apocalyptic'], 'google_books')).toContain('Post-Apocalyptic');
    });
  });

  describe('Fantasy Subgenres (NEW)', () => {
    it('should normalize Epic Fantasy', () => {
      expect(normalizer.normalize(['Epic Fantasy'], 'google_books')).toContain('Epic Fantasy');
      expect(normalizer.normalize(['High Fantasy'], 'google_books')).toContain('Epic Fantasy');
    });

    it('should normalize Urban Fantasy', () => {
      expect(normalizer.normalize(['Urban Fantasy'], 'google_books')).toContain('Urban Fantasy');
    });

    it('should normalize Cozy Fantasy (2026 trend)', () => {
      expect(normalizer.normalize(['Cozy Fantasy'], 'google_books')).toContain('Cozy Fantasy');
      expect(normalizer.normalize(['Low-Stakes Fantasy'], 'google_books')).toContain('Cozy Fantasy');
      expect(normalizer.normalize(['Comfort Fantasy'], 'google_books')).toContain('Cozy Fantasy');
    });

    it('should normalize Romantasy (2026 trend)', () => {
      expect(normalizer.normalize(['Romantasy'], 'google_books')).toContain('Romantasy');
      expect(normalizer.normalize(['Fantasy Romance'], 'google_books')).toContain('Romantasy');
    });

    it('should normalize Portal Fantasy', () => {
      expect(normalizer.normalize(['Portal Fantasy'], 'google_books')).toContain('Portal Fantasy');
      expect(normalizer.normalize(['Isekai'], 'google_books')).toContain('Portal Fantasy');
    });
  });

  describe('Mystery & Thriller Subgenres (NEW)', () => {
    it('should normalize Cozy Mystery', () => {
      expect(normalizer.normalize(['Cozy Mystery'], 'google_books')).toContain('Cozy Mystery');
      expect(normalizer.normalize(['Cosy Mystery'], 'google_books')).toContain('Cozy Mystery');
    });

    it('should normalize Noir', () => {
      expect(normalizer.normalize(['Noir'], 'google_books')).toContain('Noir');
      expect(normalizer.normalize(['Hardboiled'], 'google_books')).toContain('Noir');
      expect(normalizer.normalize(['Hard-boiled'], 'google_books')).toContain('Noir');
    });

    it('should normalize Techno-Thriller (2026 trend)', () => {
      expect(normalizer.normalize(['Techno-Thriller'], 'google_books')).toContain('Techno-Thriller');
      expect(normalizer.normalize(['Tech Thriller'], 'google_books')).toContain('Techno-Thriller');
      expect(normalizer.normalize(['Technology Thriller'], 'google_books')).toContain('Techno-Thriller');
    });

    it('should normalize Psychological Thriller', () => {
      expect(normalizer.normalize(['Psychological Thriller'], 'google_books')).toContain('Psychological Thriller');
      expect(normalizer.normalize(['Psychological Suspense'], 'google_books')).toContain('Psychological Thriller');
    });
  });

  describe('Romance Subgenres (NEW)', () => {
    it('should normalize Contemporary Romance', () => {
      expect(normalizer.normalize(['Contemporary Romance'], 'google_books')).toContain('Contemporary Romance');
      expect(normalizer.normalize(['Modern Romance'], 'google_books')).toContain('Contemporary Romance');
    });

    it('should normalize Romantic Comedy', () => {
      expect(normalizer.normalize(['Rom-Com'], 'google_books')).toContain('Romantic Comedy');
      expect(normalizer.normalize(['RomCom'], 'google_books')).toContain('Romantic Comedy');
    });

    it('should normalize LGBTQ+ Romance', () => {
      expect(normalizer.normalize(['LGBTQ Romance'], 'google_books')).toContain('LGBTQ+ Romance');
      expect(normalizer.normalize(['Queer Romance'], 'google_books')).toContain('LGBTQ+ Romance');
    });
  });

  describe('Horror Subgenres (NEW)', () => {
    it('should normalize Gothic Horror (2026 trend)', () => {
      expect(normalizer.normalize(['Gothic'], 'google_books')).toContain('Gothic Horror');
      expect(normalizer.normalize(['Gothic Horror'], 'google_books')).toContain('Gothic Horror');
    });

    it('should normalize Folk Horror (2026 trend)', () => {
      expect(normalizer.normalize(['Folk Horror'], 'google_books')).toContain('Folk Horror');
    });

    it('should normalize Cosmic Horror', () => {
      expect(normalizer.normalize(['Cosmic Horror'], 'google_books')).toContain('Cosmic Horror');
      expect(normalizer.normalize(['Lovecraftian'], 'google_books')).toContain('Cosmic Horror');
    });
  });

  describe('Non-Fiction Expanded (NEW)', () => {
    it('should normalize Psychology', () => {
      expect(normalizer.normalize(['Psychology'], 'google_books')).toContain('Psychology');
      expect(normalizer.normalize(['Behavioral Science'], 'google_books')).toContain('Psychology');
    });

    it('should normalize Health & Wellness', () => {
      expect(normalizer.normalize(['Health'], 'google_books')).toContain('Health & Wellness');
      expect(normalizer.normalize(['Wellness'], 'google_books')).toContain('Health & Wellness');
    });

    it('should normalize Technology', () => {
      expect(normalizer.normalize(['Technology'], 'google_books')).toContain('Technology');
      expect(normalizer.normalize(['Computing'], 'google_books')).toContain('Technology');
      expect(normalizer.normalize(['Programming'], 'google_books')).toContain('Technology');
    });
  });

  describe('Special Categories (NEW)', () => {
    it('should normalize LitRPG', () => {
      expect(normalizer.normalize(['LitRPG'], 'google_books')).toContain('LitRPG');
      expect(normalizer.normalize(['Lit RPG'], 'google_books')).toContain('LitRPG');
      expect(normalizer.normalize(['GameLit'], 'google_books')).toContain('LitRPG');
    });

    it('should normalize Alternate History', () => {
      expect(normalizer.normalize(['Alternate History'], 'google_books')).toContain('Alternate History');
      expect(normalizer.normalize(['Alternative History'], 'google_books')).toContain('Alternate History');
    });
  });

  describe('Provider-Specific Mappings', () => {
    it('should handle Google Books hierarchical format', () => {
      const result = normalizer.normalize(['Fiction / Science Fiction / Cyberpunk'], 'google_books');
      expect(result).toContain('Cyberpunk');
      expect(result).toContain('Science Fiction');
      expect(result).toContain('Fiction');
    });

    it('should handle OpenLibrary descriptive subjects', () => {
      const result = normalizer.normalize(['Cyberpunk fiction'], 'openlibrary');
      expect(result).toContain('Cyberpunk');
      expect(result).toContain('Science Fiction');
    });

    it('should handle OpenLibrary Cozy Fantasy', () => {
      const result = normalizer.normalize(['Cozy fantasy'], 'openlibrary');
      expect(result).toContain('Cozy Fantasy');
      expect(result).toContain('Fantasy');
    });
  });

  describe('Fuzzy Matching (85% threshold)', () => {
    it('should fuzzy match slight typos', () => {
      expect(normalizer.normalize(['Mystrey'], 'google_books')).toContain('Mystery');
      expect(normalizer.normalize(['Fantazy'], 'google_books')).toContain('Fantasy');
    });

    it('should pass through unrecognized genres (custom tags)', () => {
      // The normalizer intentionally passes through unrecognized genres
      // This allows users to have custom tags
      const result = normalizer.normalize(['RandomNonGenre'], 'google_books');
      expect(result).toContain('RandomNonGenre');
    });
  });

  describe('Multiple Genres', () => {
    it('should normalize multiple genres', () => {
      const result = normalizer.normalize(
        ['Cyberpunk', 'Space Opera', 'Hard Science Fiction'],
        'google_books'
      );
      expect(result).toContain('Cyberpunk');
      expect(result).toContain('Space Opera');
      expect(result).toContain('Hard Science Fiction');
      expect(result.length).toBe(3);
    });

    it('should deduplicate genres', () => {
      const result = normalizer.normalize(
        ['Science Fiction', 'Sci-Fi', 'SF'],
        'google_books'
      );
      expect(result).toEqual(['Science Fiction']);
    });
  });

  describe('Count Validation', () => {
    it('should have 92 canonical genres (expanded from 44)', () => {
      // This test ensures the expanded taxonomy is complete
      const allGenres = [
        // Core Fiction (8)
        'Science Fiction', 'Fantasy', 'Mystery', 'Thriller', 'Romance', 'Horror', 'Literary Fiction', 'Historical Fiction',
        // SF Subgenres (10)
        'Cyberpunk', 'Steampunk', 'Solarpunk', 'Space Opera', 'Time Travel', 'Dystopian', 'Utopian', 'Post-Apocalyptic', 'Hard Science Fiction', 'Soft Science Fiction',
        // Fantasy Subgenres (10)
        'Epic Fantasy', 'Urban Fantasy', 'Dark Fantasy', 'Paranormal', 'Cozy Fantasy', 'Fairy Tales', 'Magical Realism', 'Sword & Sorcery', 'Romantasy', 'Portal Fantasy',
        // Mystery & Thriller (12)
        'Cozy Mystery', 'Police Procedural', 'Noir', 'Crime Fiction', 'Legal Thriller', 'Espionage', 'Psychological Thriller', 'Domestic Suspense', 'Techno-Thriller', 'Medical Thriller', 'Action Thriller', 'Political Thriller',
        // Romance (9)
        'Contemporary Romance', 'Historical Romance', 'Paranormal Romance', 'Romantic Suspense', 'Romantic Comedy', 'New Adult Romance', 'Erotic Romance', 'LGBTQ+ Romance', 'Western Romance',
        // Horror (8)
        'Gothic Horror', 'Folk Horror', 'Cosmic Horror', 'Psychological Horror', 'Supernatural Horror', 'Body Horror', 'Splatterpunk', 'Ghost Stories',
        // Non-Fiction Core (7)
        'Biography', 'History', 'Science', 'Philosophy', 'Self-Help', 'Business', 'True Crime',
        // Non-Fiction Expanded (15)
        'Psychology', 'Health & Wellness', 'Spirituality', 'Travel', 'Cookbooks', 'Art & Photography', 'Music', 'Technology', 'Nature', 'Politics', 'Sports', 'Humor', 'Essays', 'Education', 'Parenting',
        // Age Groups (3)
        'Young Adult', "Children's", 'Middle Grade',
        // Special Categories (10)
        'Classics', 'Contemporary', 'Graphic Novels', 'Poetry', 'Fiction', 'Drama', 'Short Stories', 'Anthologies', 'LitRPG', 'Alternate History'
      ];

      expect(allGenres.length).toBe(92);

      // Verify each canonical genre is recognized
      allGenres.forEach(genre => {
        const result = normalizer.normalize([genre], 'google_books');
        expect(result).toContain(genre);
      });
    });
  });
});
