/**
 * Unit Tests: JobStateManagerDO
 * 
 * Tests the refactored job state management Durable Object.
 * This DO is focused solely on state persistence and coordination.
 * 
 * Related: Issue #68 - Refactor Monolithic ProgressWebSocketDO
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock DurableObject base class for testing
class MockDurableObject {
  constructor(state, env) {
    this.ctx = state;  // Modern Cloudflare DO API uses ctx
    this.env = env;
  }
}

// Mock the cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}));

// Import after mocking
const { JobStateManagerDO } = await import('../../../src/durable-objects/job-state-manager.js');

describe('JobStateManagerDO', () => {
  let mockState;
  let mockEnv;
  let doInstance;
  let mockWsStub;

  beforeEach(() => {
    // Mock WebSocket DO stub
    mockWsStub = {
      send: vi.fn(async () => ({ success: true })),
      closeConnection: vi.fn(async () => ({ success: true }))
    };

    // Mock Durable Object state
    const internalStorage = new Map();
    
    mockState = {
      storage: new Map(),
      id: { toString: () => 'test-do-id' }
    };

    // Add storage methods that don't recurse
    mockState.storage.get = vi.fn(async (key) => {
      return internalStorage.get(key);
    });
    
    mockState.storage.put = vi.fn(async (key, value) => {
      internalStorage.set(key, value);
    });

    mockState.storage.delete = vi.fn(async (key) => {
      internalStorage.delete(key);
    });

    mockState.storage.has = vi.fn((key) => {
      return internalStorage.has(key);
    });

    mockState.storage.setAlarm = vi.fn(async (time) => {
      // Mock alarm scheduling
    });

    mockState.storage.deleteAlarm = vi.fn(async () => {
      // Mock alarm deletion (Issue #108)
    });

    // Mock environment with WebSocket DO binding
    mockEnv = {
      WEBSOCKET_CONNECTION_DO: {
        idFromName: vi.fn(() => 'ws-do-id'),
        get: vi.fn(() => mockWsStub)
      },
      JOB_STATE_MANAGER_DO: {
        idFromName: vi.fn((id) => `job-state-${id}`),
        get: vi.fn(() => ({ /* mock DO stub */ }))
      }
    };

    // Create DO instance
    doInstance = new JobStateManagerDO(mockState, mockEnv);
  });

  describe('Job Initialization', () => {
    it('should initialize job state with all required fields', async () => {
      const jobId = 'test-job-123';
      const pipeline = 'csv_import';
      const totalCount = 100;

      const result = await doInstance.initializeJobState(jobId, pipeline, totalCount);

      expect(result.success).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'jobState',
        expect.objectContaining({
          jobId,
          pipeline,
          totalCount,
          processedCount: 0,
          progress: 0,
          status: 'initialized',
          canceled: false
        })
      );
      // Note: currentPipeline is implementation detail, verified via storage
      // expect(doInstance.currentPipeline).toBe(pipeline);
    });

    it('should set start time on initialization', async () => {
      const before = Date.now();
      await doInstance.initializeJobState('job-123', 'csv_import', 50);
      const after = Date.now();

      const calls = mockState.storage.put.mock.calls;
      const jobState = calls[0][1];

      expect(jobState.startTime).toBeGreaterThanOrEqual(before);
      expect(jobState.startTime).toBeLessThanOrEqual(after);
    });
  });

  describe('Progress Updates', () => {
    beforeEach(async () => {
      // Initialize a job first
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        totalCount: 100,
        processedCount: 0,
        progress: 0,
        status: 'initialized',
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });
    });

    it('should update job progress and notify WebSocket DO', async () => {
      const payload = {
        progress: 0.5,
        status: 'Processing...',
        processedCount: 50
      };

      const result = await doInstance.updateProgress('csv_import', payload);

      expect(result.success).toBe(true);
      // WebSocketMessage format (src/types/websocket-messages.ts)
      expect(mockWsStub.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'job_progress',
          jobId: 'job-123',
          pipeline: 'csv_import',
          timestamp: expect.any(Number),
          version: '2.0.0',
          payload: expect.objectContaining({
            type: 'job_progress',
            progress: 0.5,
            status: 'Processing...',
            processedCount: 50,
            totalCount: 100
          })
        })
      );
    });

    it('should handle missing job state gracefully', async () => {
      await mockState.storage.delete('jobState');

      const result = await doInstance.updateProgress('csv_import', {
        progress: 0.5
      });

      expect(result.success).toBe(false);
      expect(mockWsStub.send).not.toHaveBeenCalled();
    });

    it('should throttle storage writes based on pipeline config', async () => {
      // Clear mock calls from beforeEach
      mockState.storage.put.mockClear();

      // CSV import throttles: 20 updates or 30 seconds
      // First update will trigger persist (timeSinceLastPersist is large)
      await doInstance.updateProgress('csv_import', { progress: 0.01 });

      // Filter for jobState writes only (not SSE updates)
      let jobStatePuts = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'jobState'
      );
      expect(jobStatePuts.length).toBe(1);

      mockState.storage.put.mockClear();

      // Next 19 updates should not persist (within threshold)
      for (let i = 0; i < 19; i++) {
        await doInstance.updateProgress('csv_import', { progress: (i + 2) / 100 });
      }

      // Should not persist jobState until threshold reached
      jobStatePuts = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'jobState'
      );
      expect(jobStatePuts.length).toBe(0);

      // 20th update should trigger persist
      await doInstance.updateProgress('csv_import', { progress: 0.22 });

      jobStatePuts = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'jobState'
      );
      expect(jobStatePuts.length).toBe(1);
    });

    it('should update lastUpdateTime on each progress update', async () => {
      const before = Date.now();
      
      await doInstance.updateProgress('csv_import', { progress: 0.5 });
      
      // Force persist by reaching threshold
      doInstance.updatesSinceLastPersist = 100;
      await doInstance.updateProgress('csv_import', { progress: 0.6 });
      
      const after = Date.now();

      const calls = mockState.storage.put.mock.calls;
      const lastCall = calls[calls.length - 1];
      const updatedState = lastCall[1];

      expect(updatedState.lastUpdateTime).toBeGreaterThanOrEqual(before);
      expect(updatedState.lastUpdateTime).toBeLessThanOrEqual(after);
    });
  });

  describe('Job Completion', () => {
    beforeEach(async () => {
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        totalCount: 100,
        processedCount: 100,
        progress: 1.0,
        status: 'processing',
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });

      // Clear setTimeout to prevent actual delays in tests
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should mark job as completed with result', async () => {
      const payload = {
        books: [{ title: 'Test Book', author: 'Test Author' }],
        successRate: '100/100'
      };

      const result = await doInstance.complete('csv_import', payload);

      expect(result.success).toBe(true);
      // Implementation extracts books from payload to avoid 128KB DO storage limit
      // result contains only summary (successRate), bookCount stores count
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'jobState',
        expect.objectContaining({
          status: 'completed',
          progress: 1.0,
          result: { successRate: '100/100' },
          bookCount: 1
        })
      );
    });

    it('should notify WebSocket DO on completion', async () => {
      await doInstance.complete('csv_import', { books: [] });

      // WebSocketMessage format (src/types/websocket-messages.ts)
      expect(mockWsStub.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'job_complete',
          jobId: 'job-123',
          pipeline: 'csv_import',
          timestamp: expect.any(Number),
          version: '2.0.0',
          payload: expect.objectContaining({
            type: 'job_complete',
            pipeline: 'csv_import',
            books: [],
            expiresAt: expect.any(String)
          })
        })
      );
    });

    it('should schedule cleanup alarm after 24 hours', async () => {
      await doInstance.complete('csv_import', { books: [] });

      expect(mockState.storage.setAlarm).toHaveBeenCalledWith(
        expect.any(Number)
      );

      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];
      const expectedTime = Date.now() + (24 * 60 * 60 * 1000);
      
      // Allow 1 second tolerance
      expect(Math.abs(alarmTime - expectedTime)).toBeLessThan(1000);
    });

    it('should close WebSocket after brief delay', async () => {
      await doInstance.complete('csv_import', { books: [] });

      // WebSocket should not close immediately
      expect(mockWsStub.closeConnection).not.toHaveBeenCalled();

      // Fast-forward 1 second
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Let promises settle

      expect(mockWsStub.closeConnection).toHaveBeenCalledWith('Job completed');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        totalCount: 100,
        processedCount: 50,
        progress: 0.5,
        status: 'processing',
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });

      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should mark job as failed with error details', async () => {
      const payload = {
        code: 'E_CSV_PARSE_FAILED',
        message: 'Invalid CSV format',
        retryable: true
      };

      const result = await doInstance.sendError('csv_import', payload);

      expect(result.success).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'jobState',
        expect.objectContaining({
          status: 'failed',
          error: payload
        })
      );
    });

    it('should notify WebSocket DO on error', async () => {
      const payload = {
        code: 'E_TEST_ERROR',
        message: 'Test error'
      };

      await doInstance.sendError('csv_import', payload);

      // UPDATED (Issue #167): Verify new canonical error format
      expect(mockWsStub.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          pipeline: 'csv_import',
          version: '2.0.0',
          payload: expect.objectContaining({
            type: 'error',
            data: null,
            metadata: expect.objectContaining({
              timestamp: expect.any(String)
            }),
            error: expect.objectContaining({
              code: 'E_TEST_ERROR',
              message: 'Test error'
            })
          })
        })
      );
    });

    it('should schedule cleanup after error', async () => {
      await doInstance.sendError('csv_import', { message: 'Error' });

      expect(mockState.storage.setAlarm).toHaveBeenCalled();
    });

    it('should close WebSocket after error with delay', async () => {
      await doInstance.sendError('csv_import', { message: 'Error' });

      expect(mockWsStub.closeConnection).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockWsStub.closeConnection).toHaveBeenCalledWith('Job failed');
    });
  });

  describe('Job Cancellation', () => {
    beforeEach(async () => {
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        totalCount: 100,
        processedCount: 30,
        progress: 0.3,
        status: 'processing',
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });
    });

    it('should mark job as canceled', async () => {
      const result = await doInstance.cancelJob('User requested cancellation');

      expect(result.success).toBe(true);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'jobState',
        expect.objectContaining({
          canceled: true,
          cancelReason: 'User requested cancellation'
        })
      );
    });

    it('should handle cancellation of non-existent job', async () => {
      await mockState.storage.delete('jobState');

      const result = await doInstance.cancelJob();

      expect(result.success).toBe(false);
    });

    it('should check if job is canceled', async () => {
      await doInstance.cancelJob('Test');

      const isCanceled = await doInstance.isCanceled();

      expect(isCanceled).toBe(true);
    });

    it('should return false for non-canceled job', async () => {
      const isCanceled = await doInstance.isCanceled();

      expect(isCanceled).toBe(false);
    });

    it('should return false when job state missing', async () => {
      await mockState.storage.delete('jobState');

      const isCanceled = await doInstance.isCanceled();

      expect(isCanceled).toBe(false);
    });
  });

  describe('State Queries', () => {
    it('should return current job state', async () => {
      const jobState = {
        jobId: 'job-123',
        pipeline: 'csv_import',
        status: 'processing',
        progress: 0.5
      };

      await mockState.storage.put('jobState', jobState);

      const result = await doInstance.getJobState();

      expect(result).toEqual(jobState);
    });

    it('should return null for non-existent state', async () => {
      const result = await doInstance.getJobState();

      expect(result).toBeNull();
    });
  });

  describe('Alarm Handler', () => {
    it('should cleanup old job state on alarm', async () => {
      await mockState.storage.put('jobState', { jobId: 'old-job' });

      await doInstance.alarm();

      expect(mockState.storage.delete).toHaveBeenCalledWith('jobState');
    });
  });

  describe('Alarm Resilience and Continuity (Issue #246)', () => {
    beforeEach(async () => {
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        totalCount: 100,
        processedCount: 50,
        progress: 0.5,
        status: 'processing',
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });

      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delete existing alarm before setting new one on completion (Issue #108)', async () => {
      // Track call order manually
      const callOrder = [];
      mockState.storage.deleteAlarm.mockClear();
      mockState.storage.setAlarm.mockClear();
      mockState.storage.deleteAlarm.mockImplementation(async () => {
        callOrder.push('delete');
      });
      mockState.storage.setAlarm.mockImplementation(async () => {
        callOrder.push('set');
      });

      await doInstance.complete('csv_import', { books: [] });

      // Verify deleteAlarm is called BEFORE setAlarm
      expect(callOrder).toEqual(['delete', 'set']);
      expect(mockState.storage.deleteAlarm).toHaveBeenCalledTimes(1);
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);
    });

    it('should delete existing alarm before setting new one on failure (Issue #108)', async () => {
      // Track call order manually
      const callOrder = [];
      mockState.storage.deleteAlarm.mockClear();
      mockState.storage.setAlarm.mockClear();
      mockState.storage.deleteAlarm.mockImplementation(async () => {
        callOrder.push('delete');
      });
      mockState.storage.setAlarm.mockImplementation(async () => {
        callOrder.push('set');
      });

      await doInstance.sendError('csv_import', {
        code: 'E_TEST',
        message: 'Test error'
      });

      // Verify deleteAlarm is called BEFORE setAlarm
      expect(callOrder).toEqual(['delete', 'set']);
      expect(mockState.storage.deleteAlarm).toHaveBeenCalledTimes(1);
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);
    });

    it('should attempt to schedule alarm during completion', async () => {
      // Complete job normally
      await doInstance.complete('csv_import', { books: [] });

      // Verify setAlarm was called with correct 24-hour delay
      expect(mockState.storage.setAlarm).toHaveBeenCalled();

      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];
      const expectedTime = Date.now() + (24 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(Math.abs(alarmTime - expectedTime)).toBeLessThan(1000);
    });

    it('should schedule cleanup alarm with correct 24-hour delay on completion', async () => {
      const beforeTime = Date.now();

      await doInstance.complete('csv_import', { books: [] });

      const afterTime = Date.now();
      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];

      // Verify alarm is scheduled for ~24 hours in the future
      const expectedMin = beforeTime + (24 * 60 * 60 * 1000);
      const expectedMax = afterTime + (24 * 60 * 60 * 1000);

      expect(alarmTime).toBeGreaterThanOrEqual(expectedMin);
      expect(alarmTime).toBeLessThanOrEqual(expectedMax);
    });

    it('should schedule cleanup alarm with correct 24-hour delay on failure', async () => {
      const beforeTime = Date.now();

      await doInstance.sendError('csv_import', {
        code: 'E_TEST',
        message: 'Test error'
      });

      const afterTime = Date.now();
      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];

      // Verify alarm is scheduled for ~24 hours in the future
      const expectedMin = beforeTime + (24 * 60 * 60 * 1000);
      const expectedMax = afterTime + (24 * 60 * 60 * 1000);

      expect(alarmTime).toBeGreaterThanOrEqual(expectedMin);
      expect(alarmTime).toBeLessThanOrEqual(expectedMax);
    });

    it('should handle alarm execution when job state is missing', async () => {
      // Clear job state
      await mockState.storage.delete('jobState');

      // Alarm should not throw
      await expect(doInstance.alarm()).resolves.toBeUndefined();

      // Should still attempt cleanup
      expect(mockState.storage.delete).toHaveBeenCalledWith('jobState');
    });

    it.skip('should cleanup all job-related storage keys on alarm', async () => {
      // SKIP: This test triggers real CSV processing logic in Workers pool
      // Alarm cleanup is tested in integration tests
      // Set up complete job state
      await mockState.storage.put('jobState', { jobId: 'job-123', status: 'completed' });
      await mockState.storage.put('csvText', 'test,csv,data');
      await mockState.storage.put('processingType', 'csv_import');
      await mockState.storage.put('scanImageR2Keys', ['key1', 'key2']);
      await mockState.storage.put('enrichmentISBNs', ['9780123456789']);

      await doInstance.alarm();

      // Verify cleanup (at minimum jobState should be deleted)
      expect(mockState.storage.delete).toHaveBeenCalledWith('jobState');
    });

    it('should schedule immediate alarm for CSV processing', async () => {
      mockState.storage.setAlarm.mockClear();

      await doInstance.scheduleCSVProcessing('test,csv,data', 'job-456');

      // Verify alarm is scheduled for immediate execution
      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];
      const now = Date.now();

      // Should be scheduled within 1 second of now
      expect(Math.abs(alarmTime - now)).toBeLessThan(1000);
    });

    it('should schedule immediate alarm for bookshelf scan', async () => {
      mockState.storage.setAlarm.mockClear();

      await doInstance.scheduleBookshelfScan(['r2-key-1', 'r2-key-2'], 'job-789');

      // Verify alarm is scheduled for immediate execution
      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];
      const now = Date.now();

      // Should be scheduled within 1 second of now
      expect(Math.abs(alarmTime - now)).toBeLessThan(1000);
    });

    it('should schedule immediate alarm for enrichment', async () => {
      mockState.storage.setAlarm.mockClear();

      await doInstance.scheduleEnrichment(['9780123456789'], 'job-999', true);

      // Verify alarm is scheduled for immediate execution
      const alarmTime = mockState.storage.setAlarm.mock.calls[0][0];
      const now = Date.now();

      // Should be scheduled within 1 second of now
      expect(Math.abs(alarmTime - now)).toBeLessThan(1000);
    });

    it('should not create race condition when multiple operations schedule alarms', async () => {
      // Reset deleteAlarm and setAlarm to basic mocks (remove custom implementations)
      mockState.storage.deleteAlarm.mockReset();
      mockState.storage.setAlarm.mockReset();
      mockState.storage.deleteAlarm.mockResolvedValue(undefined);
      mockState.storage.setAlarm.mockResolvedValue(undefined);

      // First operation completes
      await doInstance.complete('csv_import', { books: [] });

      // Verify first alarm was scheduled
      expect(mockState.storage.deleteAlarm).toHaveBeenCalledTimes(1);
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);

      // Reset state for second operation
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        status: 'processing',
        processedCount: 0,
        totalCount: 100,
        progress: 0,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });

      mockState.storage.deleteAlarm.mockClear();
      mockState.storage.setAlarm.mockClear();

      // Second operation fails
      await doInstance.sendError('csv_import', { message: 'Error' });

      // Verify deleteAlarm prevents race condition
      expect(mockState.storage.deleteAlarm).toHaveBeenCalledTimes(1);
      expect(mockState.storage.setAlarm).toHaveBeenCalledTimes(1);
    });
  });

  describe('SSE Update Batching (Issue #157)', () => {
    beforeEach(async () => {
      // Initialize SSE clients and updates storage
      await mockState.storage.put('jobState', {
        jobId: 'job-123',
        pipeline: 'csv_import',
        totalCount: 100,
        processedCount: 0,
        progress: 0,
        status: 'initialized',
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        canceled: false
      });
      await mockState.storage.put('sse-clients:job-123', []);
      await mockState.storage.put('updates:job-123', []);
    });

    it('should buffer updates in memory instead of writing immediately', async () => {
      // Set jobState in memory
      doInstance.jobState = await mockState.storage.get('jobState');

      // Clear mock calls
      mockState.storage.put.mockClear();
      mockState.storage.get.mockClear();

      // First 4 updates should not trigger storage writes
      for (let i = 0; i < 4; i++) {
        await doInstance.broadcastSSEUpdate('progress', {
          progress: (i + 1) / 10,
          processedCount: i + 1
        });
      }

      // Should have read sse-clients but not written to updates
      const putCalls = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'updates:job-123'
      );
      expect(putCalls.length).toBe(0);

      // Verify updates are buffered in memory
      expect(doInstance.pendingUpdates.length).toBe(4);
    });

    it('should flush to storage after 5 updates', async () => {
      doInstance.jobState = await mockState.storage.get('jobState');
      mockState.storage.put.mockClear();

      // Send 5 updates
      for (let i = 0; i < 5; i++) {
        await doInstance.broadcastSSEUpdate('progress', {
          progress: (i + 1) / 10,
          processedCount: i + 1
        });
      }

      // Should have flushed to storage
      const putCalls = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'updates:job-123'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);

      // Buffer should be cleared
      expect(doInstance.pendingUpdates.length).toBe(0);
    });

    it('should flush to storage after 1 second', async () => {
      vi.useFakeTimers();
      doInstance.jobState = await mockState.storage.get('jobState');
      mockState.storage.put.mockClear();

      // Send 1 update
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.1 });

      // Should be buffered
      expect(doInstance.pendingUpdates.length).toBe(1);

      // Advance time by 1.1 seconds
      vi.advanceTimersByTime(1100);

      // Send another update - should trigger flush due to time
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.2 });

      const putCalls = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'updates:job-123'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it.skip('should include pending updates in getUpdates', async () => {
      // SKIP: getUpdates() behavior differs in Workers pool vs Node pool
      // SSE update merging is tested in integration tests
      doInstance.jobState = await mockState.storage.get('jobState');

      // Initialize SSE clients (required for broadcastSSEUpdate to work)
      await mockState.storage.put('sse-clients:job-123', []);

      // Add some persisted updates
      await mockState.storage.put('updates:job-123', [
        { timestamp: 1000, eventType: 'progress', data: { progress: 0.1 } }
      ]);

      // Add buffered updates
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.2 });
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.3 });

      // Get all updates
      const updates = await doInstance.getUpdates(0);

      // Should return both persisted and pending
      expect(updates.length).toBe(3);
      expect(updates[0].data.progress).toBe(0.1);
      expect(updates[1].data.progress).toBe(0.2);
      expect(updates[2].data.progress).toBe(0.3);
    });

    it('should flush pending updates on job completion', async () => {
      doInstance.jobState = await mockState.storage.get('jobState');
      vi.useFakeTimers();

      // Add some buffered updates
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.5 });
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.8 });

      expect(doInstance.pendingUpdates.length).toBe(2);

      mockState.storage.put.mockClear();

      // Complete the job
      await doInstance.complete('csv_import', { books: [] });

      // Should have flushed pending updates
      expect(doInstance.pendingUpdates.length).toBe(0);

      const putCalls = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'updates:job-123'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it('should flush pending updates on job failure', async () => {
      doInstance.jobState = await mockState.storage.get('jobState');
      vi.useFakeTimers();

      // Add some buffered updates
      await doInstance.broadcastSSEUpdate('progress', { progress: 0.3 });

      expect(doInstance.pendingUpdates.length).toBe(1);

      mockState.storage.put.mockClear();

      // Fail the job
      await doInstance.sendError('csv_import', {
        code: 'E_TEST',
        message: 'Test error'
      });

      // Should have flushed pending updates
      expect(doInstance.pendingUpdates.length).toBe(0);

      const putCalls = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'updates:job-123'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it('should cap updates at 100 events when flushing', async () => {
      doInstance.jobState = await mockState.storage.get('jobState');

      // Create 95 persisted updates
      const persistedUpdates = Array.from({ length: 95 }, (_, i) => ({
        timestamp: 1000 + i,
        eventType: 'progress',
        data: { progress: i / 100 }
      }));
      await mockState.storage.put('updates:job-123', persistedUpdates);

      // Add 10 more buffered updates (total 105)
      for (let i = 0; i < 10; i++) {
        doInstance.pendingUpdates.push({
          timestamp: 2000 + i,
          eventType: 'progress',
          data: { progress: (95 + i) / 100 }
        });
      }

      // Flush
      await doInstance.flushPendingUpdates('job-123');

      // Get the flushed updates
      const flushedUpdates = await mockState.storage.get('updates:job-123');

      // Should have only 100 updates (oldest 5 trimmed)
      expect(flushedUpdates.length).toBe(100);

      // First update should be from index 5 (trimmed 0-4)
      expect(flushedUpdates[0].timestamp).toBe(1005);

      // Last update should be the newest buffered one
      expect(flushedUpdates[99].timestamp).toBe(2009);
    });

    it('should reduce I/O operations for high-frequency updates', async () => {
      doInstance.jobState = await mockState.storage.get('jobState');
      mockState.storage.put.mockClear();
      mockState.storage.get.mockClear();

      // Simulate 1000 progress updates (common for large CSV imports)
      for (let i = 0; i < 1000; i++) {
        await doInstance.broadcastSSEUpdate('progress', {
          progress: i / 1000,
          processedCount: i
        });
      }

      // Count how many times we wrote to storage
      const putCalls = mockState.storage.put.mock.calls.filter(
        call => call[0] === 'updates:job-123'
      );

      // Should have written ~200 times (1000 / 5 = 200) instead of 1000
      expect(putCalls.length).toBeLessThan(250); // Allow some margin
      expect(putCalls.length).toBeGreaterThan(150); // At least 150 flushes

      // This is an 80%+ reduction in I/O operations
      const ioReduction = ((1000 - putCalls.length) / 1000) * 100;
      expect(ioReduction).toBeGreaterThan(75);
    });
  });
});
