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
    this.state = state;
    this.env = env;
  }
}

// Mock the cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}));

// Import after mocking
const { JobStateManagerDO } = await import('../../src/durable-objects/job-state-manager.js');

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

    // Mock environment with WebSocket DO binding
    mockEnv = {
      WEBSOCKET_CONNECTION_DO: {
        idFromName: vi.fn(() => 'ws-do-id'),
        get: vi.fn(() => mockWsStub)
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
      expect(doInstance.currentPipeline).toBe(pipeline);
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
      expect(mockWsStub.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          jobId: 'job-123',
          pipeline: 'csv_import',
          payload
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
      expect(mockState.storage.put).toHaveBeenCalledTimes(1);
      
      mockState.storage.put.mockClear();
      
      // Next 19 updates should not persist (within threshold)
      for (let i = 0; i < 19; i++) {
        await doInstance.updateProgress('csv_import', { progress: (i + 2) / 100 });
      }

      // Should not persist until threshold reached
      expect(mockState.storage.put).toHaveBeenCalledTimes(0);

      // 20th update should trigger persist
      await doInstance.updateProgress('csv_import', { progress: 0.22 });
      
      expect(mockState.storage.put).toHaveBeenCalledTimes(1);
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
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'jobState',
        expect.objectContaining({
          status: 'completed',
          progress: 1.0,
          result: payload
        })
      );
    });

    it('should notify WebSocket DO on completion', async () => {
      await doInstance.complete('csv_import', { books: [] });

      expect(mockWsStub.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'complete',
          pipeline: 'csv_import'
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

      expect(mockWsStub.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          pipeline: 'csv_import',
          payload
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

      expect(result).toBeUndefined();
    });
  });

  describe('Alarm Handler', () => {
    it('should cleanup old job state on alarm', async () => {
      await mockState.storage.put('jobState', { jobId: 'old-job' });

      await doInstance.alarm();

      expect(mockState.storage.delete).toHaveBeenCalledWith('jobState');
    });
  });
});
