import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateBookEmbedding,
  generateQueryEmbedding,
  generateBatchEmbeddings,
  storeEmbedding,
  findSimilarBooks,
  semanticSearch
} from '../../src/services/embedding-service';

// Mock Cloudflare AI binding
const mockAI = {
  run: vi.fn(),
};

// Mock Cloudflare Vectorize binding
const mockVectorize = {
  insert: vi.fn(),
  getByIds: vi.fn(),
  query: vi.fn(),
};

describe('Embedding Service', () => {
  let env: {
    AI: typeof mockAI
    BOOK_VECTORS: typeof mockVectorize
  };

  beforeEach(() => {
    env = {
      AI: mockAI,
      BOOK_VECTORS: mockVectorize,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateBookEmbedding', () => {
    const book = {
      isbn: '9780123456789',
      title: 'Test Book',
      author: 'Test Author',
      description: 'Test Description',
      categories: ['Fiction'],
    };

    it('should generate embedding successfully', async () => {
      const mockEmbedding = Array(1024).fill(0.1);
      mockAI.run.mockResolvedValue({
        data: [mockEmbedding],
        shape: [1, 1024],
      });

      const result = await generateBookEmbedding(book, env);

      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-m3', {
        text: ['Test Book. by Test Author. Test Description. Fiction'],
      });

      expect(result).toEqual({
        isbn: book.isbn,
        embedding: mockEmbedding,
        dimensions: 1024,
        model: '@cf/baai/bge-m3',
        generatedAt: expect.any(String),
      });
    });

    it('should return null if AI binding is missing', async () => {
      const result = await generateBookEmbedding(book, {});
      expect(result).toBeNull();
    });

    it('should return null if embedding generation fails', async () => {
      mockAI.run.mockRejectedValue(new Error('AI Error'));
      const result = await generateBookEmbedding(book, env);
      expect(result).toBeNull();
    });

    it('should return null if empty embedding returned', async () => {
      mockAI.run.mockResolvedValue({
        data: [],
        shape: [0, 0],
      });
      const result = await generateBookEmbedding(book, env);
      expect(result).toBeNull();
    });
  });

  describe('generateQueryEmbedding', () => {
    const query = 'test query';

    it('should generate query embedding successfully', async () => {
      const mockEmbedding = Array(1024).fill(0.1);
      mockAI.run.mockResolvedValue({
        data: [mockEmbedding],
        shape: [1, 1024],
      });

      const result = await generateQueryEmbedding(query, env);

      expect(mockAI.run).toHaveBeenCalledWith('@cf/baai/bge-m3', {
        text: [query],
      });
      expect(result).toEqual(mockEmbedding);
    });

    it('should return null if AI binding is missing', async () => {
        const result = await generateQueryEmbedding(query, {});
        expect(result).toBeNull();
    });

    it('should return null on error', async () => {
        mockAI.run.mockRejectedValue(new Error('AI Error'));
        const result = await generateQueryEmbedding(query, env);
        expect(result).toBeNull();
    });
  });

  describe('generateBatchEmbeddings', () => {
    const books = [
      { isbn: '1', title: 'Book 1', author: 'Author 1' },
      { isbn: '2', title: 'Book 2', author: 'Author 2' },
    ];

    it('should generate batch embeddings successfully', async () => {
      const mockEmbeddings = [
        Array(1024).fill(0.1),
        Array(1024).fill(0.2),
      ];

      mockAI.run.mockResolvedValue({
        data: mockEmbeddings,
        shape: [2, 1024],
      });

      const result = await generateBatchEmbeddings(books, env);

      expect(mockAI.run).toHaveBeenCalledTimes(1);
      expect(result.size).toBe(2);
      expect(result.get('1')).toEqual(mockEmbeddings[0]);
      expect(result.get('2')).toEqual(mockEmbeddings[1]);
    });

    it('should handle batch errors gracefully', async () => {
        mockAI.run.mockRejectedValue(new Error('AI Error'));
        const result = await generateBatchEmbeddings(books, env);
        expect(result.size).toBe(0);
    });
  });

  describe('storeEmbedding', () => {
    const result = {
      isbn: '123',
      embedding: [0.1, 0.2],
      dimensions: 2,
      model: 'model',
      generatedAt: 'now',
    };

    const metadata = {
      isbn: '123',
      title: 'Title',
      author: 'Author',
    };

    it('should store embedding successfully', async () => {
      mockVectorize.insert.mockResolvedValue({});

      const success = await storeEmbedding(result, metadata, env);

      expect(mockVectorize.insert).toHaveBeenCalledWith([{
        id: '123',
        values: [0.1, 0.2],
        metadata: expect.objectContaining(metadata),
      }]);
      expect(success).toBe(true);
    });

    it('should return false if Vectorize not configured', async () => {
        const success = await storeEmbedding(result, metadata, {});
        expect(success).toBe(false);
    });

    it('should return false on insert error', async () => {
        mockVectorize.insert.mockRejectedValue(new Error('DB Error'));
        const success = await storeEmbedding(result, metadata, env);
        expect(success).toBe(false);
    });
  });

  describe('findSimilarBooks', () => {
    const isbn = '123';

    it('should find similar books', async () => {
        mockVectorize.getByIds.mockResolvedValue([
            { id: '123', values: [0.1, 0.2] }
        ]);

        mockVectorize.query.mockResolvedValue({
            matches: [
                { id: '123', score: 1, metadata: { title: 'Self' } },
                { id: '456', score: 0.9, metadata: { title: 'Similar Book' } }
            ]
        });

        const results = await findSimilarBooks(isbn, 5, env);

        expect(mockVectorize.getByIds).toHaveBeenCalledWith([isbn]);
        expect(mockVectorize.query).toHaveBeenCalledWith([0.1, 0.2], expect.objectContaining({ topK: 6 }));

        expect(results).toHaveLength(1);
        expect(results[0].isbn).toBe('456');
    });

    it('should return empty if book not found', async () => {
        mockVectorize.getByIds.mockResolvedValue([]);
        const results = await findSimilarBooks(isbn, 5, env);
        expect(results).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
        mockVectorize.getByIds.mockRejectedValue(new Error('Vector Error'));
        const results = await findSimilarBooks(isbn, 5, env);
        expect(results).toHaveLength(0);
    });
  });

  describe('semanticSearch', () => {
      const query = 'fantasy magic';

      it('should return search results', async () => {
          mockAI.run.mockResolvedValue({
              data: [[0.1, 0.2]]
          });

          mockVectorize.query.mockResolvedValue({
              matches: [
                  { id: '123', score: 0.9, metadata: { title: 'Fantasy Book' } }
              ]
          });

          const results = await semanticSearch(query, 5, env);

          expect(mockAI.run).toHaveBeenCalled();
          expect(mockVectorize.query).toHaveBeenCalledWith([0.1, 0.2], expect.objectContaining({ topK: 5 }));
          expect(results).toHaveLength(1);
          expect(results[0].isbn).toBe('123');
      });

      it('should return empty if query embedding fails', async () => {
          mockAI.run.mockRejectedValue(new Error('AI Error'));
          const results = await semanticSearch(query, 5, env);
          expect(results).toHaveLength(0);
      });
  });
});
