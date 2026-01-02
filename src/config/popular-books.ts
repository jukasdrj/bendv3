/**
 * Popular Books Configuration
 *
 * Static list of highly-requested ISBNs for proactive cache warming.
 * This list complements the analytics-driven cache warming strategy.
 *
 * Strategy:
 * - Phase 1 (Current): Static list of top 100 classic/popular books
 * - Phase 2 (Future): Analytics-driven dynamic list based on API usage
 * - Phase 3 (Future): Predictive warming based on trends and seasonality
 *
 * Update Schedule:
 * - Review quarterly (Jan, Apr, Jul, Oct)
 * - Add trending books and new releases
 * - Remove books with low access counts from analytics
 *
 * Last Updated: November 26, 2025
 */

/**
 * Top 100 most popular ISBNs for cache warming
 * Organized by category for maintainability
 */
export const POPULAR_ISBNS: readonly string[] = [
  // ========================================================================
  // Classic Literature (High School/College Reading Lists)
  // ========================================================================
  '9780451524935', // 1984 by George Orwell
  '9780743273565', // The Great Gatsby by F. Scott Fitzgerald
  '9780061120084', // To Kill a Mockingbird by Harper Lee
  '9780316769174', // The Catcher in the Rye by J.D. Salinger
  '9780141439518', // Pride and Prejudice by Jane Austen
  '9780486280615', // Frankenstein by Mary Shelley
  '9780486284729', // The Picture of Dorian Gray by Oscar Wilde
  '9780486411095', // The Importance of Being Earnest by Oscar Wilde
  '9780679783268', // Ulysses by James Joyce
  '9780141439471', // Jane Eyre by Charlotte Brontë
  '9780141439556', // Wuthering Heights by Emily Brontë
  '9780141439600', // Great Expectations by Charles Dickens
  '9780141439587', // Oliver Twist by Charles Dickens
  '9780141439969', // A Tale of Two Cities by Charles Dickens
  '9780486264646', // Crime and Punishment by Fyodor Dostoevsky

  // ========================================================================
  // Harry Potter Series (Extremely High Traffic)
  // ========================================================================
  '9780439708180', // Harry Potter and the Philosopher's Stone
  '9780439064873', // Harry Potter and the Chamber of Secrets
  '9780439136365', // Harry Potter and the Prisoner of Azkaban
  '9780439139601', // Harry Potter and the Goblet of Fire
  '9780439358071', // Harry Potter and the Order of the Phoenix
  '9780439785969', // Harry Potter and the Half-Blood Prince
  '9780545010221', // Harry Potter and the Deathly Hallows
  // ========================================================================
  // Modern Bestsellers (NYT Bestseller List - Fiction)
  // ========================================================================
  '9780062315007', // The Alchemist by Paulo Coelho
  '9780316769488', // The Little Prince by Antoine de Saint-Exupéry
  '9780061122415', // The Kite Runner by Khaled Hosseini
  '9780547928210', // The Hobbit by J.R.R. Tolkien
  '9780618640157', // The Lord of the Rings by J.R.R. Tolkien
  '9780385504201', // The Da Vinci Code by Dan Brown
  '9780385333498', // Angels & Demons by Dan Brown
  '9780307387899', // The Girl with the Dragon Tattoo by Stieg Larsson
  '9780307454546', // The Girl Who Played with Fire by Stieg Larsson
  '9780307269751', // The Girl Who Kicked the Hornet's Nest by Stieg Larsson
  '9780316015844', // Twilight by Stephenie Meyer
  '9780316166683', // New Moon by Stephenie Meyer
  '9780316160209', // Eclipse by Stephenie Meyer
  '9780316067928', // Breaking Dawn by Stephenie Meyer
  '9780439023481', // The Hunger Games by Suzanne Collins
  '9780439023511', // Catching Fire by Suzanne Collins
  '9780439023528', // Mockingjay by Suzanne Collins
  '9780062073488', // Gone Girl by Gillian Flynn
  '9780385537858', // The Fault in Our Stars by John Green
  '9780143127550', // The Help by Kathryn Stockett

  // ========================================================================
  // Non-Fiction (Self-Help, Business, Biography)
  // ========================================================================
  '9781501144318', // Educated by Tara Westover
  '9780735211292', // Atomic Habits by James Clear
  '9781501164255', // Becoming by Michelle Obama
  '9780062316097', // Sapiens by Yuval Noah Harari
  '9780062457714', // Homo Deus by Yuval Noah Harari
  '9780062820235', // 21 Lessons for the 21st Century by Yuval Noah Harari
  '9780307887436', // Quiet by Susan Cain
  '9780812981605', // Thinking, Fast and Slow by Daniel Kahneman
  '9780062464316', // The Power of Now by Eckhart Tolle
  '9781451639612', // The 7 Habits of Highly Effective People by Stephen Covey
  '9781476746747', // Outliers by Malcolm Gladwell
  '9780385348713', // Unbroken by Laura Hillenbrand

  // ========================================================================
  // Contemporary Fiction (2010s-2020s)
  // ========================================================================
  '9780593133484', // Where the Crawdads Sing by Delia Owens
  '9780735219090', // Little Fires Everywhere by Celeste Ng
  '9780735224292', // Everything I Never Told You by Celeste Ng
  '9780316230032', // All the Light We Cannot See by Anthony Doerr
  '9780307949486', // The Nightingale by Kristin Hannah
  '9781250301697', // Circe by Madeline Miller
  '9780385537131', // The Book Thief by Markus Zusak
  '9780316229296', // Big Little Lies by Liane Moriarty
  '9780062457738', // The Woman in the Window by A.J. Finn

  // ========================================================================
  // Science Fiction & Fantasy (Popular Series)
  // ========================================================================
  '9780553573404', // A Game of Thrones by George R.R. Martin
  '9780553579901', // A Clash of Kings by George R.R. Martin
  '9780553573428', // A Storm of Swords by George R.R. Martin
  '9780553582024', // A Feast for Crows by George R.R. Martin
  '9780553801477', // A Dance with Dragons by George R.R. Martin
  '9780441172719', // Dune by Frank Herbert
  '9780316769532', // Ender's Game by Orson Scott Card
  '9780765326355', // The Way of Kings by Brandon Sanderson
  '9780765326362', // Words of Radiance by Brandon Sanderson
  '9780765326379', // Oathbringer by Brandon Sanderson
  '9780312577223', // The Name of the Wind by Patrick Rothfuss
  '9780756404079', // The Wise Man's Fear by Patrick Rothfuss
  '9780441013593', // Neuromancer by William Gibson
  '9780765378170', // Leviathan Wakes by James S.A. Corey
  '9780316129084', // The Fifth Season by N.K. Jemisin
  '9780062023636', // Station Eleven by Emily St. John Mandel

  // ========================================================================
  // Mystery & Thriller (Popular Authors)
  // ========================================================================
  '9780316346627', // The Silent Patient by Alex Michaelides
  '9780316472081', // The Maidens by Alex Michaelides
  '9780385539777', // The Woman in Cabin 10 by Ruth Ware
  '9781476776712', // Verity by Colleen Hoover
  '9781501161933', // It Ends with Us by Colleen Hoover
  '9780316306058', // Big Little Lies by Liane Moriarty
  '9780062797155', // The Last Mrs. Parrish by Liv Constantine
  '9780525559474', // The Turn of the Key by Ruth Ware
  '9780525542933', // The Death of Mrs. Westaway by Ruth Ware
  '9780316017930', // The Lincoln Lawyer by Michael Connelly
  '9780307743657', // Sharp Objects by Gillian Flynn

  // ========================================================================
  // Young Adult Fiction (High School Reading)
  // ========================================================================
  '9780142403822', // The Outsiders by S.E. Hinton
  '9780399257438', // The Fault in Our Stars by John Green
  '9780385739139', // Paper Towns by John Green
  '9780142414934', // Looking for Alaska by John Green
  '9780142428085', // An Abundance of Katherines by John Green
  '9780385739153', // Turtles All the Way Down by John Green
  '9780316055430', // Divergent by Veronica Roth
  '9780062024039', // Insurgent by Veronica Roth
  '9780062024077', // Allegiant by Veronica Roth
  '9780062060624', // The Perks of Being a Wallflower by Stephen Chbosky
] as const

/**
 * Get all popular ISBNs for cache warming
 * @returns Array of ISBN-13 strings
 */
export function getPopularISBNs(): string[] {
  return [...POPULAR_ISBNS]
}

/**
 * Check if an ISBN is in the popular books list
 * @param isbn - ISBN to check (10 or 13 digits)
 * @returns True if ISBN is in popular list
 */
export function isPopularBook(isbn: string): boolean {
  const normalized = isbn.replace(/[-\s]/g, '')
  return POPULAR_ISBNS.includes(normalized)
}

/**
 * Get count of popular books
 * @returns Total number of popular ISBNs
 */
export function getPopularBooksCount(): number {
  return POPULAR_ISBNS.length
}
