import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queueEnrichment, queueEnrichmentBatch } from '../../src/services/enrichment-queue'
import type { EnrichmentSource } from '../../src/types/enums'

describe('Enrichment Queue Service', () => {
  let mockEnv: any

  beforeEach(() => {
    mockEnv = {
      ENRICHMENT_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined),
      },
    }
    vi.clearAllMocks()
  })

  describe('queueEnrichment', () => {
    it('should queue enrichment with all parameters', async () => {
      const request = {
        isbn: '9780316769174',
        work_key: 'OL123W',
        priority: 'high' as const,
        source: 'user_add' as const,
      }

      const result = await queueEnrichment(request, mockEnv)

      expect(result.queued).toBe(true)
      expect(result.error).toBeUndefined()
      expect(mockEnv.ENRICHMENT_QUEUE.send).toHaveBeenCalledWith({
        isbn: '9780316769174',
        work_key: 'OL123W',
        priority: 'high',
        source: 'user_add',
        queued_at: expect.any(String),
      })
    })

    it('should use default priority of "normal" if not specified', async () => {
      const request = {
        isbn: '9780316769174',
      }

      await queueEnrichment(request, mockEnv)

      const call = mockEnv.ENRICHMENT_QUEUE.send.mock.calls[0][0]
      expect(call.priority).toBe('normal')
    })

    it('should use default source of "background" if not specified', async () => {
      const request = {
        isbn: '9780316769174',
      }

      await queueEnrichment(request, mockEnv)

      const call = mockEnv.ENRICHMENT_QUEUE.send.mock.calls[0][0]
      expect(call.source).toBe('background')
    })

    it('should include ISO timestamp in queued_at field', async () => {
      const request = {
        isbn: '9780316769174',
      }

      await queueEnrichment(request, mockEnv)

      const call = mockEnv.ENRICHMENT_QUEUE.send.mock.calls[0][0]
      expect(call.queued_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should return error if ISBN is missing', async () => {
      const request = {
        isbn: '',
      }

      const result = await queueEnrichment(request, mockEnv)

      expect(result.queued).toBe(false)
      expect(result.error).toBe('ISBN is required')
      expect(mockEnv.ENRICHMENT_QUEUE.send).not.toHaveBeenCalled()
    })

    it('should return error if ENRICHMENT_QUEUE binding is missing', async () => {
      const noQueueEnv = {}
      const request = {
        isbn: '9780316769174',
      }

      const result = await queueEnrichment(request, noQueueEnv)

      expect(result.queued).toBe(false)
      expect(result.error).toBe('ENRICHMENT_QUEUE binding not found')
    })

    it('should return error if queue.send throws', async () => {
      mockEnv.ENRICHMENT_QUEUE.send.mockRejectedValue(new Error('Queue error'))
      const request = {
        isbn: '9780316769174',
      }

      const result = await queueEnrichment(request, mockEnv)

      expect(result.queued).toBe(false)
      expect(result.error).toBe('Queue error')
    })

    it('should handle all priority levels', async () => {
      const priorities: Array<'high' | 'normal' | 'low'> = ['high', 'normal', 'low']

      for (const priority of priorities) {
        const request = {
          isbn: '9780316769174',
          priority,
        }

        const result = await queueEnrichment(request, mockEnv)

        expect(result.queued).toBe(true)
        const call = mockEnv.ENRICHMENT_QUEUE.send.mock.calls[
          mockEnv.ENRICHMENT_QUEUE.send.mock.calls.length - 1
        ][0]
        expect(call.priority).toBe(priority)
      }
    })

    it('should handle all source types', async () => {
      const sources: EnrichmentSource[] = [
        'user_add',
        'csv_import',
        'scan_import',
        'batch_enrichment',
        'background',
      ]

      for (const source of sources) {
        const request = {
          isbn: '9780316769174',
          source,
        }

        const result = await queueEnrichment(request, mockEnv)

        expect(result.queued).toBe(true)
        const call = mockEnv.ENRICHMENT_QUEUE.send.mock.calls[
          mockEnv.ENRICHMENT_QUEUE.send.mock.calls.length - 1
        ][0]
        expect(call.source).toBe(source)
      }
    })
  })

  describe('queueEnrichmentBatch', () => {
    it('should queue multiple ISBNs successfully', async () => {
      const isbns = ['9780316769174', '9780439708180', '9780451524935']
      const options = {
        priority: 'normal' as const,
        source: 'background' as const,
      }

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.queued).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.errors).toBeUndefined()
      expect(mockEnv.ENRICHMENT_QUEUE.send).toHaveBeenCalledTimes(3)
    })

    it('should handle partial success (some ISBNs fail)', async () => {
      const isbns = ['9780316769174', '', '9780451524935'] // Middle one is invalid
      const options = {
        priority: 'high' as const,
        source: 'csv_import' as const,
      }

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.queued).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors![0].isbn).toBe('')
      expect(result.errors![0].error).toBe('ISBN is required')
    })

    it('should handle complete failure (all ISBNs fail)', async () => {
      mockEnv.ENRICHMENT_QUEUE.send.mockRejectedValue(new Error('Queue unavailable'))
      const isbns = ['9780316769174', '9780439708180']
      const options = {}

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.queued).toBe(0)
      expect(result.failed).toBe(2)
      expect(result.errors).toHaveLength(2)
    })

    it('should handle empty ISBN array', async () => {
      const isbns: string[] = []
      const options = {}

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.queued).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.errors).toBeUndefined()
      expect(mockEnv.ENRICHMENT_QUEUE.send).not.toHaveBeenCalled()
    })

    it('should apply shared options to all ISBNs', async () => {
      const isbns = ['9780316769174', '9780439708180']
      const options = {
        priority: 'high' as const,
        source: 'scan_import' as const,
        work_key: 'OL123W',
      }

      await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(mockEnv.ENRICHMENT_QUEUE.send).toHaveBeenCalledTimes(2)
      mockEnv.ENRICHMENT_QUEUE.send.mock.calls.forEach((call: any) => {
        expect(call[0].priority).toBe('high')
        expect(call[0].source).toBe('scan_import')
        expect(call[0].work_key).toBe('OL123W')
      })
    })

    it('should process ISBNs in parallel (Promise.allSettled)', async () => {
      const isbns = ['9780316769174', '9780439708180', '9780451524935']
      const options = {}

      const startTime = Date.now()
      await queueEnrichmentBatch(isbns, options, mockEnv)
      const elapsedTime = Date.now() - startTime

      // If processed sequentially, would take longer (this is a basic check)
      expect(elapsedTime).toBeLessThan(100) // Parallel should be fast
      expect(mockEnv.ENRICHMENT_QUEUE.send).toHaveBeenCalledTimes(3)
    })

    it('should return undefined errors if all succeed', async () => {
      const isbns = ['9780316769174', '9780439708180']
      const options = {}

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.queued).toBe(2)
      expect(result.failed).toBe(0)
      expect(result.errors).toBeUndefined()
    })

    it('should include error details for each failed ISBN', async () => {
      const isbns = ['', '9780439708180', ''] // First and third are invalid
      const options = {}

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.failed).toBe(2)
      expect(result.errors).toHaveLength(2)
      expect(result.errors![0].isbn).toBe('')
      expect(result.errors![1].isbn).toBe('')
    })

    it('should handle large batches efficiently', async () => {
      const isbns = Array.from({ length: 100 }, (_, i) => `978031676917${i}`)
      const options = {
        priority: 'low' as const,
        source: 'background' as const,
      }

      const result = await queueEnrichmentBatch(isbns, options, mockEnv)

      expect(result.queued).toBe(100)
      expect(result.failed).toBe(0)
      expect(mockEnv.ENRICHMENT_QUEUE.send).toHaveBeenCalledTimes(100)
    })
  })
})
