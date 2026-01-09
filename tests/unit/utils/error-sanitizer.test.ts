/**
 * Error Sanitizer Tests
 *
 * Critical Security Utility - 100% Coverage Required
 *
 * Context:
 * - Remediates RFC 9457 audit finding: 16 catch blocks exposing raw error.message
 * - Prevents information disclosure of API keys, secrets, file paths, stack traces
 * - GDPR compliance: No PII logging in production
 *
 * Test Strategy:
 * - Development mode: Verify full error details returned
 * - Production mode: Verify sanitization + NO sensitive logging
 * - Edge cases: Null, undefined, non-Error objects
 * - Pattern matching: Verify all SENSITIVE_PATTERNS covered
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizeErrorMessage } from '../../../src/utils/error-sanitizer'

describe('Error Sanitizer - Development Mode', () => {
	const devUrls = [
		'https://bend-api.workers.dev/v3/books/search', // Cloudflare workers.dev
		'http://localhost:8787/v3/books/search', // Local dev
		'http://127.0.0.1:8787/v3/books/search', // Local IP
	]

	it('should return original error message unchanged in development', () => {
		const error = new Error('Database connection failed: timeout')

		for (const url of devUrls) {
			const result = sanitizeErrorMessage(error, url)
			expect(result).toBe('Database connection failed: timeout')
		}
	})

	it('should handle string errors directly in development', () => {
		const errorMsg = 'API key invalid: sk-1234567890'

		for (const url of devUrls) {
			const result = sanitizeErrorMessage(errorMsg, url)
			expect(result).toBe('API key invalid: sk-1234567890')
		}
	})

	it('should log full error context in development', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const error = new Error('Test error with stack')
		error.stack = 'Error: Test error\n    at /app/src/handlers/search.ts:42:10'

		sanitizeErrorMessage(error, 'http://localhost:8787/v3/books')

		expect(consoleErrorSpy).toHaveBeenCalledOnce()
		expect(consoleErrorSpy).toHaveBeenCalledWith('[Error Sanitizer] Development error:', {
			message: 'Test error with stack',
			stack: expect.stringContaining('at /app/src/handlers/search.ts'),
			name: 'Error',
		})

		consoleErrorSpy.mockRestore()
	})
})

describe('Error Sanitizer - Production Mode', () => {
	const prodUrls = [
		'https://api.oooefam.net/v3/books/search', // Production domain
		'https://staging.oooefam.net/v3/books/search', // Staging (not workers.dev)
	]

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('should return generic message for unknown errors in production', () => {
		const error = new Error('Some random error message')

		for (const url of prodUrls) {
			const result = sanitizeErrorMessage(error, url)
			expect(result).toBe('An internal error occurred')
		}
	})

	it('should sanitize API key errors', () => {
		const errors = [
			new Error('GEMINI_API_KEY not configured'),
			new Error('Invalid api_key provided'),
			new Error('Missing API key for service'),
		]

		for (const error of errors) {
			const result = sanitizeErrorMessage(error, prodUrls[0])
			expect(result).toBe('Authentication configuration error')
			expect(result).not.toContain('API')
			expect(result).not.toContain('key')
		}
	})

	it('should sanitize secret configuration errors', () => {
		const errors = [
			new Error('Required secret not configured: ALEXANDRIA_WEBHOOK_SECRET'),
			new Error('Missing secret: DATABASE_PASSWORD'),
		]

		for (const error of errors) {
			const result = sanitizeErrorMessage(error, prodUrls[0])
			expect(result).toBe('Configuration error')
			expect(result).not.toContain('secret')
			expect(result).not.toContain('ALEXANDRIA')
		}
	})

	it('should sanitize token/credential errors', () => {
		const errors = [
			new Error('Invalid token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
			new Error('Password validation failed'),
			new Error('Missing credentials for authentication'),
		]

		for (const error of errors) {
			const result = sanitizeErrorMessage(error, prodUrls[0])
			expect(result).toBe('Authentication error')
		}
	})

	it('should sanitize network errors', () => {
		const errors = [
			new Error('fetch failed'),
			new Error('Error: ECONNREFUSED connect to external API'),
			new Error('ETIMEDOUT: connection timeout'),
			new Error('socket hang up'),
			new Error('ENOTFOUND: DNS lookup failed'),
		]

		const expected = [
			'External service error',
			'Service temporarily unavailable',
			'Request timeout',
			'Network error',
			'Service unavailable',
		]

		for (let i = 0; i < errors.length; i++) {
			const result = sanitizeErrorMessage(errors[i]!, prodUrls[0])
			expect(result).toBe(expected[i])
		}
	})

	it('should sanitize file paths (Unix)', () => {
		const errors = [
			new Error('Error in /src/services/enrichment.ts'),
			new Error('Module not found: /node_modules/@bookstrack/schemas'),
			new Error('TypeError at file.ts:42'),
		]

		for (const error of errors) {
			const result = sanitizeErrorMessage(error, prodUrls[0])
			expect(result).toBe('Internal error')
			expect(result).not.toContain('/src/')
			expect(result).not.toContain('/node_modules')
		}
	})

	it('should sanitize file paths (Windows)', () => {
		const errors = [
			new Error('Error in C:\\src\\services\\enrichment.ts'),
			new Error('Module not found: C:\\node_modules\\package'),
		]

		for (const error of errors) {
			const result = sanitizeErrorMessage(error, prodUrls[0])
			expect(result).toBe('Internal error')
			expect(result).not.toContain('\\src\\')
			expect(result).not.toContain('\\node_modules')
		}
	})

	it('should sanitize errors containing file paths', () => {
		// Note: error.message is sanitized, not error.stack
		// Stack traces are filtered by "/src/" pattern in the message
		const error = new Error('Error in /app/src/services/book-service.ts')

		const result = sanitizeErrorMessage(error, prodUrls[0])

		expect(result).toBe('Internal error')
		expect(result).not.toContain('/src/')
		expect(result).not.toContain('book-service.ts')
	})

	it('should log ONLY error type in production (NO sensitive data)', () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const error = new Error('API key sk-prod-12345 is invalid')

		sanitizeErrorMessage(error, prodUrls[0])

		expect(consoleErrorSpy).toHaveBeenCalledOnce()
		expect(consoleErrorSpy).toHaveBeenCalledWith('[Error Sanitizer]', {
			errorType: 'Error',
			// NO message field
			// NO stack field
		})

		// Verify NO sensitive data logged
		const loggedData = consoleErrorSpy.mock.calls[0]![1]
		expect(loggedData).not.toHaveProperty('message')
		expect(loggedData).not.toHaveProperty('stack')

		consoleErrorSpy.mockRestore()
	})

	it('should handle "not configured" pattern (common in codebase)', () => {
		const errors = [
			// GEMINI_API_KEY contains "api key" → Authentication error (not "not configured")
			new Error('GEMINI_API_KEY not configured'), // Matches "api key" first
			new Error('Service not configured properly'), // Matches "not configured"
		]

		const expected = [
			'Authentication configuration error', // "api key" pattern wins
			'Service configuration error', // "not configured" pattern
		]

		for (let i = 0; i < errors.length; i++) {
			const result = sanitizeErrorMessage(errors[i]!, prodUrls[0])
			expect(result).toBe(expected[i])
		}
	})
})

describe('Error Sanitizer - Edge Cases', () => {
	const prodUrl = 'https://api.oooefam.net/v3/books/search'
	const devUrl = 'http://localhost:8787/v3/books/search'

	it('should handle null error gracefully', () => {
		expect(sanitizeErrorMessage(null, devUrl)).toBe('Unknown error')
		expect(sanitizeErrorMessage(null, prodUrl)).toBe('An internal error occurred')
	})

	it('should handle undefined error gracefully', () => {
		expect(sanitizeErrorMessage(undefined, devUrl)).toBe('Unknown error')
		expect(sanitizeErrorMessage(undefined, prodUrl)).toBe('An internal error occurred')
	})

	it('should handle empty string error', () => {
		expect(sanitizeErrorMessage('', devUrl)).toBe('Unknown error')
		expect(sanitizeErrorMessage('', prodUrl)).toBe('An internal error occurred')
	})

	it('should handle Error object without message', () => {
		const error = new Error()
		error.message = ''

		expect(sanitizeErrorMessage(error, devUrl)).toBe('Unknown error')
		expect(sanitizeErrorMessage(error, prodUrl)).toBe('An internal error occurred')
	})

	it('should handle non-Error objects with message property', () => {
		const obj = { message: 'Custom error object' }

		expect(sanitizeErrorMessage(obj, devUrl)).toBe('Custom error object')
		expect(sanitizeErrorMessage(obj, prodUrl)).toBe('An internal error occurred')
	})

	it('should handle plain objects by converting to string', () => {
		const obj = { status: 404, reason: 'Not Found' }

		// In dev: should attempt to extract message
		const devResult = sanitizeErrorMessage(obj, devUrl)
		expect(devResult).toBe('Unknown error') // No message property

		// In prod: generic message
		const prodResult = sanitizeErrorMessage(obj, prodUrl)
		expect(prodResult).toBe('An internal error occurred')
	})

	it('should handle invalid URL gracefully (fail secure to production)', () => {
		const error = new Error('Test error')

		// Invalid URL should trigger catch block → assume production
		const result = sanitizeErrorMessage(error, 'not-a-valid-url')
		expect(result).toBe('An internal error occurred')
	})

	it('should handle case-insensitive pattern matching', () => {
		const errors = [
			new Error('API KEY is missing'), // Uppercase
			new Error('Api Key is missing'), // Mixed case
			new Error('api key is missing'), // Lowercase
		]

		for (const error of errors) {
			const result = sanitizeErrorMessage(error, 'https://api.oooefam.net/v3/books')
			expect(result).toBe('Authentication configuration error')
		}
	})
})

describe('Error Sanitizer - Pattern Priority', () => {
	const prodUrl = 'https://api.oooefam.net/v3/books/search'

	it('should match more specific patterns first (api key > generic)', () => {
		const error = new Error('API key not configured')

		const result = sanitizeErrorMessage(error, prodUrl)

		// Should match "api key" pattern, not "not configured"
		expect(result).toBe('Authentication configuration error')
		expect(result).not.toBe('Service configuration error')
	})

	it('should match first pattern when multiple apply', () => {
		const error = new Error('Secret token not configured')

		const result = sanitizeErrorMessage(error, prodUrl)

		// Should match "secret" before "token" or "not configured"
		expect(result).toBe('Configuration error')
	})
})

describe('Error Sanitizer - Real Error Scenarios (from codebase)', () => {
	const prodUrl = 'https://api.oooefam.net/v3/books/search'

	it('should sanitize actual Gemini API error', () => {
		// Real error from src/providers/gemini-provider.ts:64
		const error = new Error('GEMINI_API_KEY not configured')

		const result = sanitizeErrorMessage(error, prodUrl)

		expect(result).not.toContain('GEMINI')
		expect(result).not.toContain('API_KEY')
		// NOTE: "api key" pattern matches before "not configured"
		expect(result).toBe('Authentication configuration error')
	})

	it('should sanitize actual secret validation error', () => {
		// Real error from src/utils/secrets.ts:71
		const error = new Error('Required secret not configured: ALEXANDRIA_WEBHOOK_SECRET')

		const result = sanitizeErrorMessage(error, prodUrl)

		expect(result).not.toContain('ALEXANDRIA')
		expect(result).not.toContain('WEBHOOK_SECRET')
		expect(result).toBe('Configuration error')
	})

	it('should sanitize actual ISBNdb error', () => {
		// Real error from src/workflows/import-book.ts
		const error = new Error('ISBNdb API key not configured')

		const result = sanitizeErrorMessage(error, prodUrl)

		expect(result).not.toContain('ISBNdb')
		expect(result).not.toContain('API key')
		expect(result).toBe('Authentication configuration error')
	})

	it('should sanitize actual fetch failure', () => {
		// Real error from external API calls
		const error = new Error('fetch failed')

		const result = sanitizeErrorMessage(error, prodUrl)

		expect(result).toBe('External service error')
	})

	it('should sanitize actual database connection error', () => {
		const error = new Error('Error: ECONNREFUSED 127.0.0.1:5432')

		const result = sanitizeErrorMessage(error, prodUrl)

		expect(result).toBe('Service temporarily unavailable')
		expect(result).not.toContain('127.0.0.1')
		expect(result).not.toContain('5432')
	})
})
