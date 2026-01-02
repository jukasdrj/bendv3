/**
 * Curated List of 25 Popular Authors for Bibliography Expansion
 *
 * Selection criteria:
 * - High book count (10+ published works)
 * - Active authors (published in last 10 years)
 * - Popular genres (fiction, fantasy, mystery, romance, thriller)
 * - High reader demand (bestsellers, award winners)
 *
 * This list drives the automatic author expansion system.
 * Updated: November 28, 2025
 */

/**
 * Author information
 */
export interface PopularAuthor {
  name: string
  priority: 1 | 2 | 3
  genre: string
}

/**
 * Author without priority (for external consumption)
 */
export interface AuthorInfo {
  name: string
  genre: string
}

export const POPULAR_AUTHORS: readonly PopularAuthor[] = [
  // Contemporary Fiction & Literary
  { name: 'Colleen Hoover', priority: 1, genre: 'Romance/Contemporary' },
  { name: 'Taylor Jenkins Reid', priority: 1, genre: 'Contemporary Fiction' },
  { name: 'Kristin Hannah', priority: 1, genre: 'Historical Fiction' },
  { name: 'Emily Henry', priority: 1, genre: 'Romance/Contemporary' },

  // Fantasy & Sci-Fi
  { name: 'Brandon Sanderson', priority: 1, genre: 'Fantasy' },
  { name: 'Sarah J. Maas', priority: 1, genre: 'Fantasy/YA' },
  { name: 'Rebecca Yarros', priority: 1, genre: 'Fantasy/Romance' },
  { name: 'Pierce Brown', priority: 1, genre: 'Sci-Fi' },
  { name: 'Andy Weir', priority: 1, genre: 'Sci-Fi' },

  // Mystery & Thriller
  { name: 'Freida McFadden', priority: 1, genre: 'Psychological Thriller' },
  { name: 'Riley Sager', priority: 1, genre: 'Thriller' },
  { name: 'Ruth Ware', priority: 1, genre: 'Mystery/Thriller' },
  { name: 'Lucy Foley', priority: 1, genre: 'Mystery' },
  { name: 'Alex Michaelides', priority: 1, genre: 'Psychological Thriller' },

  // Horror & Dark Fantasy
  { name: 'Stephen King', priority: 2, genre: 'Horror' },
  { name: 'Joe Hill', priority: 2, genre: 'Horror' },

  // Literary & Award Winners
  { name: 'Celeste Ng', priority: 2, genre: 'Literary Fiction' },
  { name: 'Madeline Miller', priority: 2, genre: 'Historical/Mythology' },
  { name: 'Brit Bennett', priority: 2, genre: 'Literary Fiction' },

  // Romance
  { name: 'Ali Hazelwood', priority: 1, genre: 'Romance/Contemporary' },
  { name: 'Abby Jimenez', priority: 2, genre: 'Romance' },

  // Young Adult
  { name: 'Leigh Bardugo', priority: 2, genre: 'YA Fantasy' },
  { name: 'Holly Jackson', priority: 2, genre: 'YA Mystery' },

  // Classic Modern Authors (High Backlist)
  { name: 'Neil Gaiman', priority: 2, genre: 'Fantasy' },
  { name: 'John Grisham', priority: 3, genre: 'Legal Thriller' },
] as const

/**
 * Get authors by priority level
 * @param priority - Priority level (1 = highest, 3 = lowest)
 * @returns Array of author info objects
 */
export function getAuthorsByPriority(priority: 1 | 2 | 3): AuthorInfo[] {
  return POPULAR_AUTHORS.filter((author) => author.priority === priority).map(
    ({ name, genre }) => ({ name, genre }),
  )
}

/**
 * Get all author names (sorted by priority)
 * @returns Array of author names
 */
export function getAllAuthorNames(): string[] {
  return [...POPULAR_AUTHORS].sort((a, b) => a.priority - b.priority).map((author) => author.name)
}

/**
 * Get top N authors
 * @param count - Number of authors to return
 * @returns Array of author names
 */
export function getTopAuthors(count = 25): string[] {
  return [...POPULAR_AUTHORS]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, count)
    .map((author) => author.name)
}
