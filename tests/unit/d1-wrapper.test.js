import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wrapD1Database, detectQueryType } from '../../src/utils/d1-wrapper.js'

describe('D1 Wrapper', () => {
  let mockDb
  let mockEnv
  let mockStub

  beforeEach(() => {
    // Mock Durable Object stub
    mockStub = {
      recordD1Metrics: vi.fn(async () => {})
    }

    // Mock environment
    mockEnv = {
      CACHE_METRICS_DO: {
        idFromName: vi.fn(() => 'mock-id'),
        get: vi.fn(() => mockStub)
      }
    }

    // Mock D1 database
    mockDb = {
      prepare: vi.fn((sql) => ({
        _sql: sql,
        bind: vi.fn(function(...values) {
          this._boundValues = values
          return this
        }),
        first: vi.fn(async () => ({ id: 1, title: 'Test Book' })),
        all: vi.fn(async () => ({ results: [{ id: 1 }, { id: 2 }] })),
        run: vi.fn(async () => ({ meta: { changes: 1 } }))
      }))
    }
  })

  describe('Query Type Detection', () => {
    it('should detect SELECT as read query', () => {
      expect(detectQueryType('SELECT * FROM books')).toBe('read')
    })

    it('should detect INSERT as write query', () => {
      expect(detectQueryType('INSERT INTO books VALUES (?)')).toBe('write')
    })

    it('should detect UPDATE as write query', () => {
      expect(detectQueryType('UPDATE books SET title = ?')).toBe('write')
    })

    it('should detect DELETE as write query', () => {
      expect(detectQueryType('DELETE FROM books WHERE id = ?')).toBe('write')
    })

    it('should detect CREATE as write query', () => {
      expect(detectQueryType('CREATE TABLE books (id INTEGER)')).toBe('write')
    })

    it('should detect DROP as write query', () => {
      expect(detectQueryType('DROP TABLE books')).toBe('write')
    })

    it('should detect ALTER as write query', () => {
      expect(detectQueryType('ALTER TABLE books ADD COLUMN year INTEGER')).toBe('write')
    })

    it('should handle queries with leading whitespace', () => {
      expect(detectQueryType('  SELECT * FROM books')).toBe('read')
      expect(detectQueryType('\n\tINSERT INTO books')).toBe('write')
    })

    it('should handle lowercase queries', () => {
      expect(detectQueryType('select * from books')).toBe('read')
      expect(detectQueryType('insert into books')).toBe('write')
    })
  })

  describe('Database Wrapping', () => {
    it('should wrap database with metrics tracking', () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)

      expect(wrapped).toHaveProperty('prepare')
      expect(wrapped).toHaveProperty('batch')
      expect(wrapped).toHaveProperty('raw')
    })

    it('should return unwrapped db when CACHE_METRICS_DO not available', () => {
      const noMetricsEnv = {}
      const wrapped = wrapD1Database(mockDb, noMetricsEnv)

      // Should return original db
      expect(wrapped).toBe(mockDb)
    })

    it('should provide access to raw database', () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      expect(wrapped.raw()).toBe(mockDb)
    })
  })

  describe('Prepared Statement Wrapping', () => {
    it('should wrap prepared statement with first()', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      const stmt = wrapped.prepare('SELECT * FROM books WHERE isbn = ?')

      expect(stmt).toHaveProperty('bind')
      expect(stmt).toHaveProperty('first')
      expect(stmt).toHaveProperty('all')
      expect(stmt).toHaveProperty('run')
    })

    it('should support bind() chaining', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      const result = await wrapped
        .prepare('SELECT * FROM books WHERE isbn = ?')
        .bind('9780439708180')
        .first()

      expect(result).toEqual({ id: 1, title: 'Test Book' })
    })

    it('should provide access to raw statement', () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      const stmt = wrapped.prepare('SELECT * FROM books')
      const rawStmt = stmt.raw()

      expect(rawStmt).toHaveProperty('_sql')
    })
  })

  describe('Metrics Recording - first()', () => {
    it('should record metrics for successful SELECT query', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books').first()

      expect(mockStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: 'read',
          error: false,
          latencyMs: expect.any(Number)
        })
      )
    })

    it('should record latency bucket for fast queries', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books').first()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(['fast', 'normal', 'slow', 'verySlow']).toContain(call.latencyBucket)
    })

    it('should record metrics for failed queries', async () => {
      mockDb.prepare = vi.fn(() => ({
        first: vi.fn(async () => {
          throw new Error('SQL syntax error')
        })
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)

      await expect(
        wrapped.prepare('SELECT * FROM invalid').first()
      ).rejects.toThrow('SQL syntax error')

      expect(mockStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: 'read',
          error: true,
          latencyMs: expect.any(Number)
        })
      )
    })

    it('should not throw if metrics recording fails', async () => {
      mockStub.recordD1Metrics.mockRejectedValue(new Error('Metrics DO unavailable'))

      const wrapped = wrapD1Database(mockDb, mockEnv)
      const result = await wrapped.prepare('SELECT * FROM books').first()

      // Query should still succeed
      expect(result).toEqual({ id: 1, title: 'Test Book' })
    })
  })

  describe('Metrics Recording - all()', () => {
    it('should record metrics for all() queries', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books').all()

      expect(mockStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: 'read',
          error: false,
          latencyMs: expect.any(Number),
          rowCount: 2
        })
      )
    })

    it('should record row count from results', async () => {
      mockDb.prepare = vi.fn(() => ({
        all: vi.fn(async () => ({
          results: [{ id: 1 }, { id: 2 }, { id: 3 }]
        }))
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books').all()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.rowCount).toBe(3)
    })

    it('should handle empty result sets', async () => {
      mockDb.prepare = vi.fn(() => ({
        all: vi.fn(async () => ({ results: [] }))
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books WHERE id = 999').all()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.rowCount).toBe(0)
    })
  })

  describe('Metrics Recording - run()', () => {
    it('should record metrics for write queries', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('INSERT INTO books VALUES (?)').bind(1).run()

      expect(mockStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
          queryType: 'write',
          error: false,
          latencyMs: expect.any(Number),
          changes: 1
        })
      )
    })

    it('should record UPDATE as write query', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('UPDATE books SET title = ?').bind('New Title').run()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.queryType).toBe('write')
    })

    it('should record DELETE as write query', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('DELETE FROM books WHERE id = ?').bind(1).run()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.queryType).toBe('write')
    })

    it('should record changes from meta object', async () => {
      mockDb.prepare = vi.fn(() => ({
        run: vi.fn(async () => ({ meta: { changes: 5 } }))
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('UPDATE books SET year = 2024').run()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.changes).toBe(5)
    })
  })

  describe('Latency Bucketing', () => {
    it('should categorize fast queries (< 10ms)', async () => {
      // Mock very fast response
      mockDb.prepare = vi.fn(() => ({
        first: vi.fn(async () => {
          // Simulate instant response
          return { id: 1 }
        })
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books').first()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      // Should be fast or normal (depends on test execution speed)
      expect(['fast', 'normal']).toContain(call.latencyBucket)
    })

    it('should record latency in milliseconds', async () => {
      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.prepare('SELECT * FROM books').first()

      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.latencyMs).toBeGreaterThanOrEqual(0)
      expect(call.latencyMs).toBeLessThan(1000) // Should complete in under 1s for tests
    })
  })

  describe('Error Handling', () => {
    it('should propagate query errors to caller', async () => {
      const sqlError = new Error('UNIQUE constraint failed')
      mockDb.prepare = vi.fn(() => ({
        run: vi.fn(async () => {
          throw sqlError
        })
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)

      await expect(
        wrapped.prepare('INSERT INTO books VALUES (1)').run()
      ).rejects.toThrow('UNIQUE constraint failed')
    })

    it('should still record metrics even when query fails', async () => {
      mockDb.prepare = vi.fn(() => ({
        first: vi.fn(async () => {
          throw new Error('Table not found')
        })
      }))

      const wrapped = wrapD1Database(mockDb, mockEnv)

      try {
        await wrapped.prepare('SELECT * FROM invalid_table').first()
      } catch (err) {
        // Expected
      }

      expect(mockStub.recordD1Metrics).toHaveBeenCalled()
      const call = mockStub.recordD1Metrics.mock.calls[0][0]
      expect(call.error).toBe(true)
    })

    it('should handle metrics DO being unavailable gracefully', async () => {
      mockEnv.CACHE_METRICS_DO.get.mockImplementation(() => {
        throw new Error('DO unavailable')
      })

      const wrapped = wrapD1Database(mockDb, mockEnv)
      const result = await wrapped.prepare('SELECT * FROM books').first()

      // Query should still work
      expect(result).toEqual({ id: 1, title: 'Test Book' })
    })
  })

  describe('Batch Operations', () => {
    it('should pass through batch() calls', async () => {
      const statements = [
        mockDb.prepare('INSERT INTO books VALUES (1)'),
        mockDb.prepare('INSERT INTO books VALUES (2)')
      ]

      mockDb.batch = vi.fn(async () => [
        { meta: { changes: 1 } },
        { meta: { changes: 1 } }
      ])

      const wrapped = wrapD1Database(mockDb, mockEnv)
      const results = await wrapped.batch(statements)

      expect(mockDb.batch).toHaveBeenCalledWith(statements)
      expect(results).toHaveLength(2)
    })

    it('should note that batch metrics not yet tracked', async () => {
      // This test documents that batch() doesn't track metrics yet
      // TODO: Add batch metrics in future enhancement
      mockDb.batch = vi.fn(async () => [])

      const wrapped = wrapD1Database(mockDb, mockEnv)
      await wrapped.batch([])

      // Metrics should NOT be called for batch operations yet
      expect(mockStub.recordD1Metrics).not.toHaveBeenCalled()
    })
  })
})
