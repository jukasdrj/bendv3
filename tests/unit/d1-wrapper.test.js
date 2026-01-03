
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wrapD1Database } from '../../src/utils/database/d1-wrapper.ts'

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
        // Mock native D1 statement having raw() execution method
        raw: vi.fn().mockImplementation(() => { throw new Error('Native raw() should not be called during unwrapping') }),
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

  it('should batch process raw statements with default metrics (read count)', async () => {
    const wrapper = wrapD1Database(mockDb, mockEnv)
    // Mock raw D1 statements (they have a .raw() method!)
    const stmt1 = {
        statement: 'stmt1',
        raw: vi.fn().mockImplementation(() => { throw new Error('Should not be called') })
    }
    const stmt2 = {
        statement: 'stmt2',
        raw: vi.fn().mockImplementation(() => { throw new Error('Should not be called') })
    }
    const statements = [stmt1, stmt2]

    // Mock successful batch return
    mockDb.batch.mockResolvedValue([{ success: true }, { success: true }])

    const result = await wrapper.batch(statements)

    expect(mockDb.batch).toHaveBeenCalledWith(statements)
    expect(result).toHaveLength(2)

    // Metrics should now be recorded, defaulting to read
    expect(mockMetricsStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
            readCount: 2,
            writeCount: 0,
            queryCount: 2,
            error: false
        })
    )
  })

  it('should unwrap wrapped statements before passing to batch using getInner', async () => {
    const wrapper = wrapD1Database(mockDb, mockEnv)

    const d1Stmt1 = { id: 1, bind: vi.fn() }
    const d1Stmt2 = { id: 2, bind: vi.fn() }

    // Configure mock to return specific D1 statements
    mockDb.prepare
        .mockReturnValueOnce(d1Stmt1)
        .mockReturnValueOnce(d1Stmt2)

    const wrapped1 = wrapper.prepare('INSERT INTO test VALUES (1)')
    const wrapped2 = wrapper.prepare('SELECT * FROM test')

    // Execute batch
    await wrapper.batch([wrapped1, wrapped2])

    // Verify db.batch was called with unwrapped statements
    expect(mockDb.batch).toHaveBeenCalledWith([d1Stmt1, d1Stmt2])
  })

  it('should correctly count reads and writes from wrapped statements', async () => {
    const wrapper = wrapD1Database(mockDb, mockEnv)

    const readStmt = {
        getInner: vi.fn().mockReturnValue('raw-read'),
        queryType: 'read'
    }
    const writeStmt = {
        getInner: vi.fn().mockReturnValue('raw-write'),
        queryType: 'write'
    }
    const mixedStmts = [readStmt, writeStmt, writeStmt]

    mockDb.batch.mockResolvedValue([{}, {}, {}])

    await wrapper.batch(mixedStmts)

    expect(mockDb.batch).toHaveBeenCalledWith(['raw-read', 'raw-write', 'raw-write'])

    expect(mockMetricsStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
            readCount: 1,
            writeCount: 2,
            queryCount: 3,
            error: false
        })
    )
  })

  it('should record error metrics when batch fails', async () => {
    const wrapper = wrapD1Database(mockDb, mockEnv)
    const stmts = [{ getInner: () => 's', queryType: 'read' }]

    mockDb.batch.mockRejectedValue(new Error('Batch failed'))

    await expect(wrapper.batch(stmts)).rejects.toThrow('Batch failed')

    expect(mockMetricsStub.recordD1Metrics).toHaveBeenCalledWith(
        expect.objectContaining({
            error: true,
            readCount: 1,
            writeCount: 0
        })
    )
  })
})
