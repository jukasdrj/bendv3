
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wrapD1Database } from '../../src/utils/d1-wrapper.js'

describe('D1 Wrapper Batch Metrics', () => {
  let mockDb
  let mockEnv
  let mockMetricsStub

  beforeEach(() => {
    // Mock D1 Database
    mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
        raw: vi.fn(), // If needed
      })),
      batch: vi.fn(),
    }

    // Mock CacheMetricsDO Stub
    mockMetricsStub = {
      recordD1Metrics: vi.fn().mockResolvedValue({ success: true }),
    }

    // Mock Environment
    mockEnv = {
      CACHE_METRICS_DO: {
        idFromName: vi.fn().mockReturnValue('mock-id'),
        get: vi.fn().mockReturnValue(mockMetricsStub),
      },
    }
  })

  it('should unwrap wrapped statements before passing to batch and record metrics', async () => {
    const wrapper = wrapD1Database(mockDb, mockEnv)

    // Mock distinct raw statements
    const rawStmt1 = { isRaw: 1 }
    const rawStmt2 = { isRaw: 2 }

    // Setup prepare to return statements that expose distinct raw statements
    mockDb.prepare.mockImplementation((sql) => {
      const raw = sql.includes('INSERT') ? rawStmt1 : rawStmt2
      return {
        bind: vi.fn().mockReturnThis(),
        raw: () => raw
      }
    })

    const wrapped1 = wrapper.prepare('INSERT INTO test VALUES (1)')
    const wrapped2 = wrapper.prepare('SELECT * FROM test')

    // The issue in the previous run is that `wrapper.prepare` wraps the result of `mockDb.prepare`.
    // `wrapStatement` creates a new object that has `raw()` which returns the internal statement.
    // The internal statement is what `mockDb.prepare` returned.
    // In our test, `mockDb.prepare` returns an object `{ bind, raw: () => raw }`.
    // So `wrapper.prepare` returns `{ ..., raw: () => internalStmt }`.
    // `wrapper.batch` calls `stmt.raw()`.
    // `stmt.raw()` returns `internalStmt`.
    // `internalStmt` is `{ bind, raw: () => raw }`.
    // Wait, `wrapper.batch` does `if (stmt.raw && typeof stmt.raw === 'function') unwrappedStatements.push(stmt.raw())`.
    // So it pushes `internalStmt`.
    // `internalStmt` is NOT `rawStmt1`. It is the object returned by mockDb.prepare.
    // `rawStmt1` is returned by `internalStmt.raw()`.

    // Ah, `wrapStatement` in `d1-wrapper.js`:
    // raw() { return stmt }
    // `stmt` is the object returned by `db.prepare()`.

    // In my test: `mockDb.prepare` returns `{ bind, raw: () => raw }`.
    // So `stmt` is `{ bind, raw: () => raw }`.
    // `wrapper.batch` unwraps and gets `stmt`.
    // So it calls `db.batch([stmt, stmt2])`.
    // `expect(mockDb.batch).toHaveBeenCalledWith([rawStmt1, rawStmt2])` fails because it gets `stmt`, not `rawStmt1`.

    // Real D1 `prepare` returns a D1PreparedStatement.
    // Real D1 `batch` expects D1PreparedStatements.
    // So `wrapper.batch` should unwrap the wrapper to get the D1PreparedStatement.
    // That's what it does.

    // So `mockDb.prepare` should return the "D1PreparedStatement" (the raw thing).
    // In my test, `rawStmt1` IS the D1PreparedStatement.

    mockDb.prepare.mockImplementation((sql) => {
      const raw = sql.includes('INSERT') ? rawStmt1 : rawStmt2
      // In real D1, prepare returns the statement directly.
      // So we should return the raw object, but it needs 'bind' etc.
      return {
        ...raw,
        bind: vi.fn().mockReturnThis(),
        // Real D1 statement doesn't have raw().
      }
    })

    const wrapped1_fixed = wrapper.prepare('INSERT INTO test VALUES (1)')
    const wrapped2_fixed = wrapper.prepare('SELECT * FROM test')

    // Mock successful batch execution
    mockDb.batch.mockResolvedValue([
        { meta: { changes: 1 } },
        { results: [] }
    ])

    // Execute batch
    const result = await wrapper.batch([wrapped1_fixed, wrapped2_fixed])

    // Verify db.batch was called with unwrapped statements
    // The unwrapped statement is the object returned by mockDb.prepare.
    // Which matches properties of rawStmt1 plus bind.

    const calls = mockDb.batch.mock.calls[0][0]
    expect(calls[0]).toEqual(expect.objectContaining(rawStmt1))
    expect(calls[1]).toEqual(expect.objectContaining(rawStmt2))

    // Verify metrics recorded
    expect(mockMetricsStub.recordD1Metrics).toHaveBeenCalledTimes(1)
    expect(mockMetricsStub.recordD1Metrics).toHaveBeenCalledWith(expect.objectContaining({
        queryType: 'batch',
        count: 2,
        readCount: 1, // SELECT
        writeCount: 1, // INSERT
        error: false
    }))
  })

  it('should handle unwrapped statements and record approximate metrics', async () => {
    const wrapper = wrapD1Database(mockDb, mockEnv)
    const statements = [
      { statement: 'stmt1' },
      { statement: 'stmt2' }
    ]

    mockDb.batch.mockResolvedValue([])

    await wrapper.batch(statements)

    // Should count total but not specific read/write if unknown
    expect(mockMetricsStub.recordD1Metrics).toHaveBeenCalledWith(expect.objectContaining({
        queryType: 'batch',
        count: 2,
        readCount: 0,
        writeCount: 0
    }))
  })
})
