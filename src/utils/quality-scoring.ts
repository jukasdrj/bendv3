/**
 * ISBNdb Quality Scoring Weights
 *
 * Calibration rationale:
 * - BASE (50pts): Every entry starts with a foundational score.
 * - IMAGE (20pts): Cover images significantly improve user experience and are a strong indicator of data quality.
 * - SYNOPSIS (10pts): Descriptions help users make informed choices and are crucial for discoverability.
 * - PAGES/PUBLISHER/SUBJECTS/AUTHORS (5pts each): Supplementary metadata points that enhance the completeness
 *   and utility of the book record.
 *
 * Total possible score: 50 (base) + 50 (all fields) = 100
 * Minimum score: 50 (base only, no metadata)
 */
export const ISBNDB_QUALITY_WEIGHTS = {
  BASE: 50,
  IMAGE: 20,
  SYNOPSIS: 10,
  PAGES: 5,
  PUBLISHER: 5,
  SUBJECTS: 5,
  AUTHORS: 5,
} as const;
