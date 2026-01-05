/**
 * Processing error codes for CSV import and batch operations
 *
 * @remarks
 * Error codes are categorized by the stage where the error occurred:
 * - `gemini_filter_*`: Errors from AI-powered filtering/validation
 * - `validation_*`: Errors from schema validation
 * - `database_*`: Errors from database operations
 * - `unknown`: Unexpected errors that don't fit other categories
 */
export type ProcessingErrorCode =
  | 'gemini_filter_whitespace'
  | 'validation_missing_field'
  | 'database_duplicate'
  | 'database_other'
  | 'unknown'

/**
 * Structured error information for CSV processing operations
 *
 * @remarks
 * This interface is used to track errors during CSV import, batch enrichment,
 * and other multi-row processing operations. It provides consistent error
 * reporting with row-level granularity.
 *
 * @example Row Number Calculation
 * ```typescript
 * // CSV file (3 rows total):
 * // Row 1: "ISBN,Title,Author" (header)
 * // Row 2: "9780439708180,Harry Potter,J.K. Rowling" (first data row)
 * // Row 3: "invalid,Book Title,Author Name" (second data row)
 *
 * // Error for row 3:
 * const error: ProcessingError = {
 *   rowNumber: 3,  // 1-based row number in CSV file
 *   message: 'Invalid ISBN format',
 *   code: 'validation_missing_field'
 * }
 * ```
 *
 * @example Gemini Filter Error
 * ```typescript
 * const error: ProcessingError = {
 *   rowNumber: 5,
 *   message: 'Row contains only whitespace or empty values',
 *   code: 'gemini_filter_whitespace',
 *   details: { rawRow: '   ,  ,  ' }
 * }
 * ```
 *
 * @example Validation Error
 * ```typescript
 * const error: ProcessingError = {
 *   rowNumber: 7,
 *   message: 'Missing required field: ISBN',
 *   code: 'validation_missing_field',
 *   field: 'isbn',
 *   value: undefined
 * }
 * ```
 *
 * @example Database Error
 * ```typescript
 * const error: ProcessingError = {
 *   rowNumber: 10,
 *   message: 'Book already exists in database',
 *   code: 'database_duplicate',
 *   field: 'isbn',
 *   value: '9780439708180',
 *   details: { existingId: 'abc123' }
 * }
 * ```
 */
export interface ProcessingError {
  /**
   * 1-based row number in the CSV file
   *
   * @remarks
   * - Row 1 is the header row
   * - Row 2 is the first data row
   * - For array-based processing (0-indexed), add 2: `rowNumber = arrayIndex + 2`
   *
   * @example
   * ```typescript
   * // Processing CSV data array (0-indexed):
   * const dataRows = parsedCSV.data // Excludes header
   * dataRows.forEach((row, index) => {
   *   const rowNumber = index + 2 // +2 accounts for 0-index and header
   *   // ...
   * })
   * ```
   */
  rowNumber: number

  /**
   * User-friendly error message
   *
   * @remarks
   * Should be clear and actionable for end users. Avoid technical jargon
   * or internal implementation details in this field. Use `details` for
   * diagnostic information.
   *
   * @example
   * - "Invalid ISBN format" (good)
   * - "Schema validation failed: isbn.safeParse()" (bad - too technical)
   */
  message: string

  /**
   * Categorized error code
   *
   * @remarks
   * Error codes indicate the stage where the error occurred:
   *
   * **Gemini Filter Errors:**
   * - `gemini_filter_whitespace`: Row contains only whitespace or empty values
   *
   * **Validation Errors:**
   * - `validation_missing_field`: Required field is missing or empty
   *
   * **Database Errors:**
   * - `database_duplicate`: Record already exists (unique constraint violation)
   * - `database_other`: Other database errors (connection, constraint, etc.)
   *
   * **Unknown Errors:**
   * - `unknown`: Unexpected errors that don't fit other categories
   *
   * @example
   * ```typescript
   * switch (error.code) {
   *   case 'gemini_filter_whitespace':
   *     // Skip row silently (expected behavior)
   *     break
   *   case 'validation_missing_field':
   *     // Show user-facing validation error
   *     showError(error.message)
   *     break
   *   case 'database_duplicate':
   *     // Offer to skip or update existing record
   *     promptUserAction(error)
   *     break
   *   case 'database_other':
   *   case 'unknown':
   *     // Log for debugging, show generic error to user
   *     logError(error)
   *     showGenericError()
   *     break
   * }
   * ```
   */
  code: ProcessingErrorCode

  /**
   * Optional field name where the error occurred
   *
   * @remarks
   * Use this to highlight specific form fields or CSV columns.
   * Common values: 'isbn', 'title', 'author', 'publishedDate'
   *
   * @example
   * ```typescript
   * const error: ProcessingError = {
   *   rowNumber: 5,
   *   message: 'ISBN must be 10 or 13 digits',
   *   code: 'validation_missing_field',
   *   field: 'isbn',  // Highlight ISBN field in UI
   *   value: '123'    // Show problematic value
   * }
   * ```
   */
  field?: string

  /**
   * Optional problematic value that caused the error
   *
   * @remarks
   * Include the actual value to help users identify and fix the issue.
   * Truncate long values to avoid bloating error objects.
   *
   * @example
   * ```typescript
   * const error: ProcessingError = {
   *   rowNumber: 8,
   *   message: 'Invalid date format (expected YYYY-MM-DD)',
   *   code: 'validation_missing_field',
   *   field: 'publishedDate',
   *   value: '12/31/2024'  // Show what user entered
   * }
   * ```
   */
  value?: string

  /**
   * Optional internal diagnostic information
   *
   * @remarks
   * Use this for debugging and logging, NOT for user-facing messages.
   * Can contain technical details, stack traces, or provider-specific data.
   *
   * @example
   * ```typescript
   * const error: ProcessingError = {
   *   rowNumber: 12,
   *   message: 'Failed to save book to database',
   *   code: 'database_other',
   *   details: {
   *     sqlError: 'UNIQUE constraint failed: books.isbn',
   *     query: 'INSERT INTO books ...',
   *     timestamp: '2026-01-05T12:00:00Z'
   *   }
   * }
   * ```
   */
  details?: any
}
