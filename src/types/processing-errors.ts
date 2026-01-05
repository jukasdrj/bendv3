/**
 * Error detail from CSV processing pipeline
 * Matches JobErrorDetailSchema in @bookstrack/schemas
 */
export interface ProcessingError {
  row?: number
  isbn?: string
  error: string
}
