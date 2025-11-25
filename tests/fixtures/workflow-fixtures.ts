/**
 * Workflow Test Fixtures
 *
 * Sprint 3: Phase 3 - Workflow Testing Strategy (Issues #27, #28)
 *
 * Provides consistent test data for workflow unit and integration tests.
 */

// ============================================================================
// CSV Test Data
// ============================================================================

export const sampleCSVContent = `ISBN,Title,Author
9780439708180,Harry Potter and the Philosopher's Stone,J.K. Rowling
9780547928227,The Hobbit,J.R.R. Tolkien
9780142437230,Don Quixote,Miguel de Cervantes
`

export const sampleCSVContentWithErrors = `ISBN,Title,Author
INVALID_ISBN,Bad Book,Unknown
9780439708180,Harry Potter and the Philosopher's Stone,J.K. Rowling
12345,Another Bad ISBN,Nobody
9780547928227,The Hobbit,J.R.R. Tolkien
`

export const emptyCSV = `ISBN,Title,Author
`

export const largeCSVContent = Array.from({ length: 100 }, (_, i) =>
  `978043970818${i.toString().padStart(1, '0')},Test Book ${i},Test Author ${i}`
).join('\n')

// ============================================================================
// Book Metadata Fixtures
// ============================================================================

export const mockHarryPotterMetadata = {
  isbn: '9780439708180',
  title: "Harry Potter and the Philosopher's Stone",
  author: 'J.K. Rowling',
  authors: ['J.K. Rowling'],
  description: 'Harry Potter has never been the star of a Quidditch team, scoring points while riding a broom far above the ground...',
  coverUrl: 'https://books.google.com/books/content?id=wrOQLV6xB-wC&printsec=frontcover&img=1&zoom=1',
  publicationDate: '1997-06-26',
  publisher: 'Bloomsbury Publishing',
  pageCount: 309,
  categories: ['Fiction', 'Fantasy', 'Young Adult'],
}

export const mockHobbitMetadata = {
  isbn: '9780547928227',
  title: 'The Hobbit',
  author: 'J.R.R. Tolkien',
  authors: ['J.R.R. Tolkien'],
  description: 'Bilbo Baggins is a hobbit who enjoys a comfortable, unambitious life...',
  coverUrl: 'https://books.google.com/books/content?id=example&img=1',
  publicationDate: '1937-09-21',
  publisher: 'Houghton Mifflin Harcourt',
  pageCount: 310,
  categories: ['Fiction', 'Fantasy', 'Adventure'],
}

export const mockDonQuixoteMetadata = {
  isbn: '9780142437230',
  title: 'Don Quixote',
  author: 'Miguel de Cervantes',
  authors: ['Miguel de Cervantes'],
  description: 'The story of a Spanish gentleman who reads so many chivalric romances that he loses his mind...',
  coverUrl: null,
  publicationDate: '1605-01-16',
  publisher: 'Penguin Classics',
  pageCount: 1072,
  categories: ['Fiction', 'Classic Literature'],
}

// ============================================================================
// Embedding Fixtures
// ============================================================================

export const mockEmbedding768 = Array.from({ length: 768 }, () => Math.random() * 2 - 1)
export const mockEmbedding1024 = Array.from({ length: 1024 }, () => Math.random() * 2 - 1)

export const mockEmbeddingResult = {
  isbn: '9780439708180',
  embedding: mockEmbedding1024,
  dimensions: 1024,
  model: '@cf/baai/bge-m3',
  generatedAt: '2025-11-25T12:00:00Z',
}

// ============================================================================
// Workflow Input Fixtures
// ============================================================================

export const mockBookImportInput = {
  isbn: '9780439708180',
  jobId: 'test-job-123',
  userId: 'user-456',
  source: 'google_books' as const,
}

export const mockWorkflowEvent = {
  payload: mockBookImportInput,
  timestamp: new Date('2025-11-25T12:00:00Z'),
  instanceId: 'workflow-instance-789',
}

// ============================================================================
// API Response Fixtures
// ============================================================================

export const mockGoogleBooksResponse = {
  totalItems: 1,
  items: [
    {
      volumeInfo: {
        title: "Harry Potter and the Philosopher's Stone",
        authors: ['J.K. Rowling'],
        description: 'Harry Potter has never been the star of a Quidditch team...',
        imageLinks: {
          thumbnail: 'https://books.google.com/books/content?id=wrOQLV6xB-wC&img=1',
        },
        publishedDate: '1997-06-26',
        publisher: 'Bloomsbury Publishing',
        pageCount: 309,
        categories: ['Fiction'],
        industryIdentifiers: [
          { type: 'ISBN_13', identifier: '9780439708180' },
        ],
      },
    },
  ],
}

export const mockOpenLibraryResponse = {
  'ISBN:9780439708180': {
    title: "Harry Potter and the Philosopher's Stone",
    authors: [{ name: 'J.K. Rowling' }],
    cover: {
      medium: 'https://covers.openlibrary.org/b/isbn/9780439708180-M.jpg',
      large: 'https://covers.openlibrary.org/b/isbn/9780439708180-L.jpg',
    },
    publish_date: 'June 26, 1997',
    publishers: [{ name: 'Bloomsbury Publishing' }],
    number_of_pages: 309,
    subjects: [{ name: 'Fiction' }, { name: 'Fantasy' }],
  },
}

// ============================================================================
// Job Status Fixtures
// ============================================================================

export const mockJobStatusInitialized = {
  jobId: 'test-job-123',
  status: 'initialized',
  progress: 0,
  startedAt: '2025-11-25T12:00:00Z',
  updatedAt: '2025-11-25T12:00:00Z',
}

export const mockJobStatusProcessing = {
  jobId: 'test-job-123',
  status: 'processing',
  progress: 0.5,
  currentStep: 'fetching_metadata',
  startedAt: '2025-11-25T12:00:00Z',
  updatedAt: '2025-11-25T12:00:30Z',
}

export const mockJobStatusCompleted = {
  jobId: 'test-job-123',
  status: 'completed',
  progress: 1.0,
  startedAt: '2025-11-25T12:00:00Z',
  completedAt: '2025-11-25T12:01:00Z',
  result: {
    success: true,
    isbn: '9780439708180',
    savedToD1: true,
    hasEmbedding: true,
  },
}

export const mockJobStatusFailed = {
  jobId: 'test-job-123',
  status: 'failed',
  progress: 0.5,
  startedAt: '2025-11-25T12:00:00Z',
  failedAt: '2025-11-25T12:00:30Z',
  error: {
    code: 'METADATA_FETCH_FAILED',
    message: 'Google Books API returned 429: Too Many Requests',
  },
}

// ============================================================================
// WebSocket Message Fixtures
// ============================================================================

export const mockProgressMessage = {
  type: 'workflow_progress',
  jobId: 'test-job-123',
  status: 'fetching_metadata',
  progress: 20,
  timestamp: '2025-11-25T12:00:15Z',
  data: { source: 'google_books' },
}

export const mockCompletionMessage = {
  type: 'workflow_progress',
  jobId: 'test-job-123',
  status: 'completed',
  progress: 100,
  timestamp: '2025-11-25T12:01:00Z',
  data: {
    success: true,
    isbn: '9780439708180',
    savedToD1: true,
    hasEmbedding: true,
  },
}

// ============================================================================
// Error Fixtures
// ============================================================================

export const mockAPIError = {
  code: 'API_ERROR',
  message: 'External API call failed',
  statusCode: 503,
}

export const mockValidationError = {
  code: 'INVALID_ISBN',
  message: 'Invalid ISBN format: ABC123',
  statusCode: 400,
}

export const mockTimeoutError = {
  code: 'TIMEOUT',
  message: 'Request timeout after 30000ms',
  statusCode: 504,
}
