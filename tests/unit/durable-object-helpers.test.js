/**
 * Unit Tests: Durable Object Helper Utilities
 *
 * Tests the getProgressDOStub() routing logic for WebSocket Hibernation API migration.
 * Validates feature flag switching and future percentage-based rollout (Phase 2B).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProgressDOStub } from '../../src/utils/durable-object-helpers.js';

describe('getProgressDOStub', () => {
  let mockEnv;
  let mockTraditionalStub;
  let mockHibernationStub;

  beforeEach(() => {
    // Create mock DO stubs
    mockTraditionalStub = { type: 'traditional' };
    mockHibernationStub = { type: 'hibernation' };

    // Create mock DO namespaces
    const mockTraditionalDO = {
      idFromName: vi.fn((name) => `traditional-id-${name}`),
      get: vi.fn(() => mockTraditionalStub),
    };

    const mockHibernationDO = {
      idFromName: vi.fn((name) => `hibernation-id-${name}`),
      get: vi.fn(() => mockHibernationStub),
    };

    mockEnv = {
      PROGRESS_WEBSOCKET_DO: mockTraditionalDO,
      PROGRESS_WEBSOCKET_DO_HIBERNATION: mockHibernationDO,
    };
  });

  describe('Feature Flag Routing', () => {
    it('should route to traditional DO when flag is not set', () => {
      // No ENABLE_HIBERNATION_WEBSOCKET flag
      const stub = getProgressDOStub('job-123', mockEnv);

      expect(stub).toBe(mockTraditionalStub);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith('job-123');
      expect(mockEnv.PROGRESS_WEBSOCKET_DO_HIBERNATION.idFromName).not.toHaveBeenCalled();
    });

    it('should route to traditional DO when flag is false', () => {
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'false';

      const stub = getProgressDOStub('job-123', mockEnv);

      expect(stub).toBe(mockTraditionalStub);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith('job-123');
    });

    it('should route to hibernation DO when flag is true', () => {
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'true';

      const stub = getProgressDOStub('job-456', mockEnv);

      expect(stub).toBe(mockHibernationStub);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO_HIBERNATION.idFromName).toHaveBeenCalledWith('job-456');
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).not.toHaveBeenCalled();
    });

    it('should use same jobId for DO instance name in both implementations', () => {
      const jobId = 'job-deterministic-789';

      // Traditional
      getProgressDOStub(jobId, mockEnv);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(jobId);

      // Hibernation
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'true';
      getProgressDOStub(jobId, mockEnv);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO_HIBERNATION.idFromName).toHaveBeenCalledWith(jobId);
    });
  });

  describe('Stub Return Values', () => {
    it('should return valid stub from traditional DO namespace', () => {
      const stub = getProgressDOStub('job-123', mockEnv);

      expect(stub).toBeDefined();
      expect(stub.type).toBe('traditional');
    });

    it('should return valid stub from hibernation DO namespace', () => {
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'true';
      const stub = getProgressDOStub('job-456', mockEnv);

      expect(stub).toBeDefined();
      expect(stub.type).toBe('hibernation');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing traditional DO namespace gracefully', () => {
      delete mockEnv.PROGRESS_WEBSOCKET_DO;

      expect(() => {
        getProgressDOStub('job-123', mockEnv);
      }).toThrow();
    });

    it('should handle missing hibernation DO namespace when flag is true', () => {
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'true';
      delete mockEnv.PROGRESS_WEBSOCKET_DO_HIBERNATION;

      expect(() => {
        getProgressDOStub('job-456', mockEnv);
      }).toThrow();
    });
  });

  describe('Phase 2B: Percentage-Based Rollout (Future)', () => {
    // These tests document the expected behavior for Phase 2B
    // When implemented, getProgressDOStub will use hashJobId() for percentage routing

    it.skip('should support HIBERNATION_ROLLOUT_PERCENTAGE for gradual migration', () => {
      // Phase 2B: Percentage-based routing
      // Example: HIBERNATION_ROLLOUT_PERCENTAGE=10 routes ~10% to hibernation
      mockEnv.HIBERNATION_ROLLOUT_PERCENTAGE = '10';

      // Implementation will use hash-based routing for deterministic distribution
      // const hash = hashJobId(jobId);
      // const useHibernation = (hash % 100) < rolloutPercentage;
    });

    it.skip('should override percentage routing when binary flag is set', () => {
      // Phase 2B: Binary flag takes precedence
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'true';
      mockEnv.HIBERNATION_ROLLOUT_PERCENTAGE = '10'; // Should be ignored

      const stub = getProgressDOStub('job-123', mockEnv);
      expect(stub).toBe(mockHibernationStub); // 100% hibernation
    });
  });

  describe('Integration with Handlers', () => {
    it('should work with csv-import handler pattern', () => {
      // Simulates: const doStub = getProgressDOStub(jobId, env);
      const jobId = 'csv-import-job-123';

      const stub = getProgressDOStub(jobId, mockEnv);

      expect(stub).toBe(mockTraditionalStub);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO.idFromName).toHaveBeenCalledWith(jobId);
    });

    it('should work with batch-enrichment handler pattern', () => {
      // Simulates: const doStub = getProgressDOStub(jobId, env);
      const jobId = 'batch-enrichment-job-456';
      mockEnv.ENABLE_HIBERNATION_WEBSOCKET = 'true';

      const stub = getProgressDOStub(jobId, mockEnv);

      expect(stub).toBe(mockHibernationStub);
      expect(mockEnv.PROGRESS_WEBSOCKET_DO_HIBERNATION.idFromName).toHaveBeenCalledWith(jobId);
    });
  });
});
