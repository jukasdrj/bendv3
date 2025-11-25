/**
 * Workflow Test Helpers
 *
 * Sprint 3: Phase 3 - Workflow Testing Strategy (Issues #27, #28)
 *
 * Provides utilities for testing Cloudflare Workflows:
 * - Mock workflow step execution
 * - Job status polling helpers
 * - WebSocket message simulation
 * - Environment mock factories
 */

import { vi, type Mock } from 'vitest'

// ============================================================================
// Types
// ============================================================================

export interface MockWorkflowStep {
  do: Mock
  sleep: Mock
}

export interface MockEnv {
  AI: { run: Mock }
  DB: { prepare: Mock }
  KV_CACHE: { get: Mock; put: Mock; delete: Mock }
  BOOK_COVERS: { put: Mock; get: Mock }
  BOOK_VECTORS: { insert: Mock; query: Mock; getByIds: Mock }
  WEBSOCKET_CONNECTION_DO: { idFromName: Mock; get: Mock }
  JOB_STATE_MANAGER_DO: { idFromName: Mock; get: Mock }
  GOOGLE_BOOKS_API_KEY: string
}

export interface JobStatus {
  jobId: string
  status: 'initialized' | 'processing' | 'completed' | 'failed' | 'canceled'
  progress: number
  error?: { code: string; message: string }
  result?: Record<string, unknown>
}

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create a mock WorkflowStep that executes functions immediately
 */
export function createMockWorkflowStep(): MockWorkflowStep {
  return {
    do: vi.fn(async (name: string, optionsOrFn: unknown, maybeFn?: () => Promise<unknown>) => {
      // Handle both signatures: do(name, fn) and do(name, options, fn)
      const fn = maybeFn ?? optionsOrFn
      if (typeof fn === 'function') {
        return await fn()
      }
      return undefined
    }),
    sleep: vi.fn(async () => undefined),
  }
}

/**
 * Create a mock environment with all required bindings
 */
export function createMockEnv(overrides?: Partial<MockEnv>): MockEnv {
  const mockDOStub = {
    send: vi.fn().mockResolvedValue(undefined),
    fetch: vi.fn().mockResolvedValue(new Response('ok')),
  }

  return {
    AI: {
      run: vi.fn().mockResolvedValue({
        data: [Array.from({ length: 1024 }, () => Math.random())],
        shape: [1, 1024],
      }),
    },
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    },
    KV_CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    BOOK_COVERS: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
    },
    BOOK_VECTORS: {
      insert: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ matches: [] }),
      getByIds: vi.fn().mockResolvedValue([]),
    },
    WEBSOCKET_CONNECTION_DO: {
      idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
      get: vi.fn().mockReturnValue(mockDOStub),
    },
    JOB_STATE_MANAGER_DO: {
      idFromName: vi.fn().mockReturnValue({ toString: () => 'mock-id' }),
      get: vi.fn().mockReturnValue(mockDOStub),
    },
    GOOGLE_BOOKS_API_KEY: 'test-api-key',
    ...overrides,
  }
}

/**
 * Create mock fetch responses for external APIs
 */
export function createMockFetch(responses: Map<string, Response | Error>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()

    for (const [pattern, response] of responses) {
      if (url.includes(pattern)) {
        if (response instanceof Error) {
          throw response
        }
        return response.clone()
      }
    }

    // Default: 404 response
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  }) as unknown as typeof fetch
}

// ============================================================================
// Polling Helpers
// ============================================================================

export interface PollOptions {
  timeout?: number
  interval?: number
  baseUrl?: string
}

/**
 * Poll job status until completion or timeout
 */
export async function pollJobStatus(
  jobId: string,
  options: PollOptions = {}
): Promise<JobStatus> {
  const { timeout = 30000, interval = 1000, baseUrl = 'http://localhost:8787' } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${baseUrl}/v1/jobs/${jobId}/status`)
    const status = await response.json() as { data: JobStatus }

    if (status.data.status === 'completed' || status.data.status === 'failed') {
      return status.data
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms timeout`)
}

/**
 * Wait for specific job progress percentage
 */
export async function waitForProgress(
  jobId: string,
  targetProgress: number,
  options: PollOptions = {}
): Promise<JobStatus> {
  const { timeout = 30000, interval = 500, baseUrl = 'http://localhost:8787' } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${baseUrl}/v1/jobs/${jobId}/status`)
    const status = await response.json() as { data: JobStatus }

    if (status.data.progress >= targetProgress) {
      return status.data
    }

    if (status.data.status === 'failed') {
      throw new Error(`Job failed before reaching ${targetProgress}% progress: ${status.data.error?.message}`)
    }

    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error(`Job ${jobId} did not reach ${targetProgress}% within ${timeout}ms`)
}

// ============================================================================
// WebSocket Helpers
// ============================================================================

export interface WebSocketMessage {
  type: string
  jobId?: string
  status?: string
  progress?: number
  data?: unknown
}

/**
 * Create a mock WebSocket client for testing
 */
export function createMockWebSocket(): {
  messages: WebSocketMessage[]
  send: Mock
  close: Mock
  addEventListener: Mock
  receiveMessage: (msg: WebSocketMessage) => void
} {
  const messages: WebSocketMessage[] = []
  const listeners: Map<string, ((event: unknown) => void)[]> = new Map()

  return {
    messages,
    send: vi.fn((data: string) => {
      try {
        messages.push(JSON.parse(data))
      } catch {
        messages.push({ type: 'raw', data })
      }
    }),
    close: vi.fn(),
    addEventListener: vi.fn((event: string, handler: (event: unknown) => void) => {
      const existing = listeners.get(event) || []
      existing.push(handler)
      listeners.set(event, existing)
    }),
    receiveMessage: (msg: WebSocketMessage) => {
      const handlers = listeners.get('message') || []
      handlers.forEach(handler => handler({ data: JSON.stringify(msg) }))
    },
  }
}

/**
 * Collect WebSocket messages until condition is met
 */
export async function collectWebSocketMessages(
  ws: WebSocket,
  condition: (messages: WebSocketMessage[]) => boolean,
  timeout = 10000
): Promise<WebSocketMessage[]> {
  const messages: WebSocketMessage[] = []

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`WebSocket message collection timed out after ${timeout}ms`))
    }, timeout)

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WebSocketMessage
        messages.push(msg)

        if (condition(messages)) {
          clearTimeout(timer)
          resolve(messages)
        }
      } catch {
        // Ignore non-JSON messages
      }
    })
  })
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that workflow step was called with expected name
 */
export function assertStepCalled(mockStep: MockWorkflowStep, stepName: string): void {
  const calls = mockStep.do.mock.calls
  const found = calls.some((call: unknown[]) => call[0] === stepName)

  if (!found) {
    const calledSteps = calls.map((call: unknown[]) => call[0]).join(', ')
    throw new Error(`Expected step "${stepName}" to be called, but only these steps were called: ${calledSteps}`)
  }
}

/**
 * Assert workflow step order
 */
export function assertStepOrder(mockStep: MockWorkflowStep, expectedOrder: string[]): void {
  const calls = mockStep.do.mock.calls
  const actualOrder = calls.map((call: unknown[]) => call[0])

  for (let i = 0; i < expectedOrder.length; i++) {
    if (actualOrder[i] !== expectedOrder[i]) {
      throw new Error(
        `Step order mismatch at index ${i}. Expected "${expectedOrder[i]}", got "${actualOrder[i]}"\n` +
        `Expected order: ${expectedOrder.join(' -> ')}\n` +
        `Actual order: ${actualOrder.join(' -> ')}`
      )
    }
  }
}

/**
 * Assert job completed successfully
 */
export function assertJobSuccess(status: JobStatus): void {
  if (status.status !== 'completed') {
    throw new Error(
      `Expected job to complete successfully, but status was "${status.status}"` +
      (status.error ? `: ${status.error.message}` : '')
    )
  }
  if (status.progress !== 1.0) {
    throw new Error(`Expected progress to be 1.0, but was ${status.progress}`)
  }
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a valid ISBN-13
 */
export function generateISBN13(): string {
  const prefix = '978'
  const group = Math.floor(Math.random() * 10).toString()
  const publisher = Math.floor(Math.random() * 100000).toString().padStart(5, '0')
  const title = Math.floor(Math.random() * 1000).toString().padStart(3, '0')

  const base = prefix + group + publisher + title
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]!) * (i % 2 === 0 ? 1 : 3)
  }
  const checkDigit = (10 - (sum % 10)) % 10

  return base + checkDigit.toString()
}

/**
 * Generate test job ID
 */
export function generateJobId(): string {
  return `test-job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
