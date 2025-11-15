import { describe, test, expect } from 'vitest';
import { createSuccessResponse, createErrorResponse, ErrorCodes, createSuccessResponseObject, createErrorResponseObject } from '../../src/utils/response-builder.js';

describe('Response Builder Utilities', () => {
  describe('Envelope Response Format (createSuccessResponse/createErrorResponse)', () => {
    test('createSuccessResponse wraps data with metadata', async () => {
      const payload = { id: 123, name: 'Test Book' };
      const response = createSuccessResponse(payload, { traceId: 'abc-123' }, 201);

      expect(response.status).toBe(201);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();

      expect(body.data).toEqual(payload);
      expect(body.error).toBeUndefined();
      expect(body.metadata.traceId).toBe('abc-123');
      expect(body.metadata.timestamp).toBeDefined();
      expect(new Date(body.metadata.timestamp).getTime()).toBeGreaterThan(0);
    });

    test('createSuccessResponse uses defaults for status and metadata', async () => {
      const payload = { message: 'OK' };
      const response = createSuccessResponse(payload);

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.data).toEqual(payload);
      expect(body.metadata.timestamp).toBeDefined();
    });

    test('createErrorResponse formats error with code', async () => {
      const response = createErrorResponse('Resource not found', 404, 'E_NOT_FOUND');

      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();

      expect(body.data).toBeNull();
      expect(body.error).toBeDefined();
      expect(body.error.message).toBe('Resource not found');
      expect(body.error.code).toBe('E_NOT_FOUND');
      expect(body.metadata.timestamp).toBeDefined();
    });

    test('createErrorResponse uses default status 500', async () => {
      const response = createErrorResponse('Internal error');

      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error.message).toBe('Internal error');
      expect(body.error.code).toBeUndefined();
    });
  });

  describe('Object Response Format (createSuccessResponseObject/createErrorResponseObject)', () => {
    test('createSuccessResponseObject returns success object', () => {
      const payload = { id: 123, name: 'Test Book' };
      const result = createSuccessResponseObject(payload, { cached: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(payload);
      expect(result.meta.timestamp).toBeDefined();
      expect(result.meta.cached).toBe(true);
      expect(new Date(result.meta.timestamp).getTime()).toBeGreaterThan(0);
    });

    test('createErrorResponseObject returns error object', () => {
      const result = createErrorResponseObject('Not found', 'NOT_FOUND', { suggestion: 'Try again' });

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Not found');
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.details).toEqual({ suggestion: 'Try again' });
      expect(result.meta.timestamp).toBeDefined();
    });
  });

  describe('ErrorCodes Constants', () => {
    test('ErrorCodes contains standard error codes', () => {
      expect(ErrorCodes.INVALID_ISBN).toBe('INVALID_ISBN');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes.MISSING_PARAMETER).toBe('MISSING_PARAMETER');
      expect(ErrorCodes.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
    });
  });
});
