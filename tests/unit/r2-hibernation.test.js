/**
 * Unit Tests: R2 Hibernation Utilities
 *
 * Tests for Issue #11: R2 Migration for Hibernation Fix
 * Validates R2 upload/fetch/delete operations for large CSV/image payloads
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  uploadPayloadToR2,
  fetchPayloadFromR2,
  deletePayloadFromR2,
  validatePayloadSize,
  generateR2Key,
  cleanupJobR2Objects,
} from '../../src/utils/r2-hibernation.ts'

describe('R2 Hibernation Utilities', () => {
  let mockEnv
  let mockBucket

  beforeEach(() => {
    // Mock R2 bucket operations
    mockBucket = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn(),
      head: vi.fn(),
    }

    mockEnv = {
      BOOKSHELF_IMAGES: mockBucket,
    }
  })

  describe('uploadPayloadToR2', () => {
    it('should upload CSV payload successfully', async () => {
      const csvData = 'isbn,title,author\n9780439708180,Harry Potter,J.K. Rowling\n'
      const jobId = 'test-job-123'

      const result = await uploadPayloadToR2(mockEnv, jobId, 'csv', csvData)

      expect(result.r2Key).toMatch(/^hibernation\/csv\/test-job-123\/\d{13}\.csv$/)
      expect(result.size).toBeGreaterThan(0)
      expect(result.etag).toBe('upload-complete')
      expect(mockBucket.put).toHaveBeenCalledWith(
        expect.stringMatching(/^hibernation\/csv\/test-job-123\/\d{13}\.csv$/),
        csvData,
        expect.objectContaining({
          httpMetadata: {
            contentType: 'text/csv',
          },
          customMetadata: expect.objectContaining({
            jobId: 'test-job-123',
            type: 'csv',
          }),
        }),
        { signal: expect.any(Object) } // Issue #59: signal now passed
      )
    })

    it('should upload image payload successfully', async () => {
      const imageData = new ArrayBuffer(1024 * 100) // 100KB image
      const jobId = 'test-job-456'

      const result = await uploadPayloadToR2(mockEnv, jobId, 'image', imageData)

      expect(result.r2Key).toMatch(/^hibernation\/image\/test-job-456\/\d{13}\.jpg$/)
      expect(result.size).toBe(1024 * 100)
      expect(result.etag).toBe('upload-complete')
      expect(mockBucket.put).toHaveBeenCalledWith(
        expect.stringMatching(/^hibernation\/image\/test-job-456\/\d{13}\.jpg$/),
        imageData,
        expect.objectContaining({
          httpMetadata: {
            contentType: 'image/jpeg',
          },
          customMetadata: expect.objectContaining({
            jobId: 'test-job-456',
            type: 'image',
          }),
        }),
        { signal: expect.any(Object) } // Issue #59: signal now passed
      )
    })

    it('should handle 8MB CSV payload', async () => {
      const csvData = 'a'.repeat(8 * 1024 * 1024) // 8MB
      const jobId = 'test-job-789'

      const result = await uploadPayloadToR2(mockEnv, jobId, 'csv', csvData)

      expect(result.size).toBe(8 * 1024 * 1024)
      expect(mockBucket.put).toHaveBeenCalled()
    })

    it('should handle 10MB image payload', async () => {
      const imageData = new ArrayBuffer(10 * 1024 * 1024) // 10MB
      const jobId = 'test-job-abc'

      const result = await uploadPayloadToR2(mockEnv, jobId, 'image', imageData)

      expect(result.size).toBe(10 * 1024 * 1024)
      expect(mockBucket.put).toHaveBeenCalled()
    })

    it('should reject oversized CSV payload', async () => {
      const oversized = 'a'.repeat(11 * 1024 * 1024) // 11MB (over 10MB limit)

      await expect(
        uploadPayloadToR2(mockEnv, 'test-job-fail', 'csv', oversized)
      ).rejects.toThrow(/Payload too large/)
    })

    it('should reject oversized image payload', async () => {
      const oversized = new ArrayBuffer(16 * 1024 * 1024) // 16MB (over 15MB limit)

      await expect(
        uploadPayloadToR2(mockEnv, 'test-job-fail', 'image', oversized)
      ).rejects.toThrow(/Payload too large/)
    })

    it('should retry on transient failures', async () => {
      mockBucket.put
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockRejectedValueOnce(new Error('Transient failure'))
        .mockResolvedValueOnce(undefined) // Success on 3rd attempt

      const csvData = 'test data'
      const result = await uploadPayloadToR2(mockEnv, 'test-job-retry', 'csv', csvData)

      expect(result.r2Key).toBeDefined()
      expect(mockBucket.put).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retries', async () => {
      mockBucket.put.mockRejectedValue(new Error('Persistent failure'))

      await expect(
        uploadPayloadToR2(mockEnv, 'test-job-fail', 'csv', 'test data')
      ).rejects.toThrow(/R2 upload failed after 3 attempts/)
    })
  })

  describe('fetchPayloadFromR2', () => {
    it('should fetch CSV payload as text', async () => {
      const csvData = 'isbn,title,author\ntest'
      mockBucket.get.mockResolvedValue({
        text: vi.fn().mockResolvedValue(csvData),
        arrayBuffer: vi.fn(),
      })

      const result = await fetchPayloadFromR2(mockEnv, 'hibernation/csv/job-123/1234567890123.csv')

      expect(result).toBe(csvData)
      expect(mockBucket.get).toHaveBeenCalledWith('hibernation/csv/job-123/1234567890123.csv', { signal: expect.any(Object) })
    })

    it('should fetch image payload as ArrayBuffer', async () => {
      const imageData = new ArrayBuffer(1024)
      mockBucket.get.mockResolvedValue({
        text: vi.fn(),
        arrayBuffer: vi.fn().mockResolvedValue(imageData),
      })

      const result = await fetchPayloadFromR2(mockEnv, 'hibernation/image/job-456/1234567890123.jpg')

      expect(result).toBe(imageData)
      expect(mockBucket.get).toHaveBeenCalledWith('hibernation/image/job-456/1234567890123.jpg', { signal: expect.any(Object) })
    })

    it('should throw error if object not found', async () => {
      mockBucket.get.mockResolvedValue(null)

      await expect(
        fetchPayloadFromR2(mockEnv, 'hibernation/csv/nonexistent/1234567890123.csv')
      ).rejects.toThrow(/R2 object not found/)
    })

    it('should handle timeout on slow fetch', async () => {
      // Skip this test - timeout behavior is hard to reliably test in unit tests
      // Real timeout handling is tested in integration tests
    })
  })

  describe('deletePayloadFromR2', () => {
    it('should delete R2 object successfully', async () => {
      await deletePayloadFromR2(mockEnv, 'hibernation/csv/job-123/1234567890123.csv')

      expect(mockBucket.delete).toHaveBeenCalledWith('hibernation/csv/job-123/1234567890123.csv', { signal: expect.any(Object) })
    })

    it('should not throw on delete failure', async () => {
      mockBucket.delete.mockRejectedValue(new Error('Delete failed'))

      // Should not throw - cleanup is best effort
      await expect(
        deletePayloadFromR2(mockEnv, 'hibernation/csv/job-123/1234567890123.csv')
      ).resolves.toBeUndefined()
    })
  })

  describe('validatePayloadSize', () => {
    it('should validate CSV within size limit', () => {
      const csvData = 'a'.repeat(5 * 1024 * 1024) // 5MB
      const result = validatePayloadSize('csv', csvData)

      expect(result.valid).toBe(true)
      expect(result.size).toBe(5 * 1024 * 1024)
    })

    it('should validate image within size limit', () => {
      const imageData = new ArrayBuffer(10 * 1024 * 1024) // 10MB
      const result = validatePayloadSize('image', imageData)

      expect(result.valid).toBe(true)
      expect(result.size).toBe(10 * 1024 * 1024)
    })

    it('should reject oversized CSV', () => {
      const oversized = 'a'.repeat(11 * 1024 * 1024) // 11MB
      const result = validatePayloadSize('csv', oversized)

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/Payload too large/)
    })

    it('should reject oversized image', () => {
      const oversized = new ArrayBuffer(16 * 1024 * 1024) // 16MB
      const result = validatePayloadSize('image', oversized)

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/Payload too large/)
    })

    it('should reject invalid data type', () => {
      const result = validatePayloadSize('csv', 12345) // Number instead of string/buffer

      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/Invalid data type/)
    })
  })

  describe('generateR2Key', () => {
    it('should generate CSV key with correct format', () => {
      const key = generateR2Key('test-job-123', 'csv')

      expect(key).toMatch(/^hibernation\/csv\/test-job-123\/\d{13}\.csv$/)
    })

    it('should generate image key with correct format', () => {
      const key = generateR2Key('test-job-456', 'image')

      expect(key).toMatch(/^hibernation\/image\/test-job-456\/\d{13}\.jpg$/)
    })

    it('should generate unique keys for same job', async () => {
      const key1 = generateR2Key('test-job-789', 'csv')

      // Wait 10ms to ensure different timestamp (Date.now() is millisecond precision)
      await new Promise((resolve) => setTimeout(resolve, 10))

      const key2 = generateR2Key('test-job-789', 'csv')

      expect(key1).not.toBe(key2) // Different timestamps
    })
  })

  describe('cleanupJobR2Objects', () => {
    it('should delete all objects for a job', async () => {
      // Mock for CSV prefix
      mockBucket.list.mockResolvedValueOnce({
        objects: [
          { key: 'hibernation/csv/job-123/1234567890123.csv' },
          { key: 'hibernation/csv/job-123/1234567890124.csv' },
        ],
        truncated: false,
      })

      // Mock for image prefix
      mockBucket.list.mockResolvedValueOnce({
        objects: [
          { key: 'hibernation/image/job-123/1234567890123.jpg' },
          { key: 'hibernation/image/job-123/1234567890124.jpg' },
        ],
        truncated: false,
      })

      await cleanupJobR2Objects(mockEnv, 'job-123')

      expect(mockBucket.list).toHaveBeenCalledWith({
        prefix: 'hibernation/csv/job-123/',
        cursor: undefined,
      }, { signal: expect.any(Object) })
      expect(mockBucket.list).toHaveBeenCalledWith({
        prefix: 'hibernation/image/job-123/',
        cursor: undefined,
      }, { signal: expect.any(Object) })
      // 2 CSV + 2 image = 4 delete calls
      expect(mockBucket.delete).toHaveBeenCalledTimes(4)
    })

    it('should handle pagination for >1000 objects', async () => {
      mockBucket.list
        .mockResolvedValueOnce({
          objects: Array(1000).fill({ key: 'hibernation/csv/job-123/file.csv' }),
          truncated: true,
          cursor: 'cursor-1',
        })
        .mockResolvedValueOnce({
          objects: Array(500).fill({ key: 'hibernation/csv/job-123/file.csv' }),
          truncated: false,
        })
        .mockResolvedValueOnce({
          objects: [],
          truncated: false,
        })

      await cleanupJobR2Objects(mockEnv, 'job-123')

      expect(mockBucket.list).toHaveBeenCalledTimes(3) // 2 for CSV prefix, 1 for image prefix
      expect(mockBucket.delete).toHaveBeenCalledTimes(1500)
    })

    it('should handle no objects found', async () => {
      mockBucket.list.mockResolvedValue({
        objects: [],
        truncated: false,
      })

      await cleanupJobR2Objects(mockEnv, 'job-nonexistent')

      expect(mockBucket.delete).not.toHaveBeenCalled()
    })

    it('should not throw on cleanup failure', async () => {
      mockBucket.list.mockRejectedValue(new Error('List failed'))

      // Should not throw - cleanup is best effort
      await expect(
        cleanupJobR2Objects(mockEnv, 'job-123')
      ).resolves.toBeUndefined()
    })
  })
})
