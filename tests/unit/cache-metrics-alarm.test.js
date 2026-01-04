import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DurableObject base class for testing
class MockDurableObject {
  constructor(state, env) {
    this.ctx = state
    this.state = state
    this.env = env

    // Mimic the blockConcurrencyWhile method from real DO
    if (!this.ctx.blockConcurrencyWhile) {
      this.ctx.blockConcurrencyWhile = async (callback) => {
        await callback()
      }
    }
  }
}

// Mock the cloudflare:workers module
vi.mock('cloudflare:workers', () => ({
  DurableObject: MockDurableObject,
}))

// Import after mocking
const { CacheMetricsDO } = await import('../../src/durable-objects/cache-metrics')

describe('CacheMetricsDO Alarm', () => {
  let state
  let env
  let cacheMetricsDO
  let storageMap
  let alarmTime

  beforeEach(() => {
    storageMap = new Map()
    alarmTime = null

    // Mock storage
    const storage = {
      get: vi.fn((key) => {
        return Promise.resolve(storageMap.get(key) || null)
      }),
      put: vi.fn((key, value) => {
        storageMap.set(key, value)
        return Promise.resolve()
      }),
      delete: vi.fn((key) => {
        storageMap.delete(key)
        return Promise.resolve()
      }),
      getAlarm: vi.fn(() => Promise.resolve(alarmTime)),
      setAlarm: vi.fn((time) => {
        alarmTime = time
        return Promise.resolve()
      }),
    }

    // Mock state
    state = {
      storage,
      blockConcurrencyWhile: vi.fn(async (callback) => {
        await callback()
      }),
    }

    env = {}

    // Instantiate Durable Object
    cacheMetricsDO = new CacheMetricsDO(state, env)
  })

  it('should reschedule alarm even if alarm handler throws an error', async () => {
    // 1. Setup initial state
    const now = Date.now()

    // Spy on console.error to avoid cluttering output and verify error logging
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // 2. Force an error during the alarm execution.
    // We can do this by mocking persistStats (if we could access it)
    // or by making storage.put fail, since alarm calls persistStats -> storage.put

    // Let's modify the storage.put to throw an error
    state.storage.put.mockRejectedValue(new Error('Storage failure'))

    // 3. Trigger alarm
    // We need to set lastPersisted to force a persistStats call
    // alarm() logic: if (now - this.lastPersisted > STATE_PERSIST_INTERVAL_MS)
    // STATE_PERSIST_INTERVAL_MS is 10 * 60 * 1000
    // We need to access private property lastPersisted, or wait?
    // In JS we can access private properties sometimes if not strictly compiled,
    // but here it is TS compiled to JS?
    // Actually we are importing the module which is TS but run via vitest with TS support.

    // Let's rely on `this.stats.lastUpdated` accessing logic which might not throw.
    // But `persistStats` is called at the end of `alarm`.

    // Let's just mock a method on the instance to throw.
    // Since `alarm` is async, we can replace `aggregateWindow` or something used inside.
    // But `aggregateWindow` is private.

    // Easier way: `this.stats` is private but maybe accessible in test?
    // Or we can mock `initializeStats` on the prototype?

    // Let's try to mock `storage.put` as planned.
    // We need to ensure `persistStats` is called.
    // `this.lastPersisted` is initialized to `Date.now()` in constructor.
    // We need to advance time or modify `lastPersisted`.

    // Since we can't easily modify `lastPersisted` (private), we can mock Date.now()
    // to be far in the future?

    const futureTime = now + 11 * 60 * 1000 // 11 minutes later

    // We can't easily mock Date.now() inside the module unless we use vi.useFakeTimers()
    // but that affects the whole test.
    vi.useFakeTimers()
    vi.setSystemTime(futureTime)

    // Trigger alarm
    await cacheMetricsDO.alarm()

    // 4. Verify that error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[CacheMetricsDO] Alarm failed:',
      expect.any(Error)
    )

    // 5. Verify that setAlarm was called despite the error
    // ALARM_INTERVAL_MS is 60 * 1000
    const expectedAlarmTime = futureTime + 60 * 1000
    expect(state.storage.setAlarm).toHaveBeenCalledWith(expectedAlarmTime)

    vi.useRealTimers()
    consoleErrorSpy.mockRestore()
  })

  it('should reschedule alarm on successful execution', async () => {
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    await cacheMetricsDO.alarm()

    const expectedAlarmTime = now + 60 * 1000
    expect(state.storage.setAlarm).toHaveBeenCalledWith(expectedAlarmTime)

    vi.useRealTimers()
  })

  it('should continue rescheduling after multiple consecutive failures', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.storage.put.mockRejectedValue(new Error('Storage failure'))

    // Advance time past persist interval to ensure put is called (and fails)
    const initialTime = Date.now() + 11 * 60 * 1000
    vi.useFakeTimers()
    vi.setSystemTime(initialTime)

    // Simulate 5 consecutive failures
    for (let i = 0; i < 5; i++) {
      const currentTime = initialTime + (i * 60 * 1000)
      vi.setSystemTime(currentTime)

      await cacheMetricsDO.alarm()

      // Verify alarm was rescheduled for next minute
      expect(state.storage.setAlarm).toHaveBeenLastCalledWith(currentTime + 60 * 1000)
    }

    expect(consoleErrorSpy).toHaveBeenCalledTimes(5)

    vi.useRealTimers()
    consoleErrorSpy.mockRestore()
  })

  it('should handle setAlarm failure gracefully without crashing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Make setAlarm throw an error
    state.storage.setAlarm.mockRejectedValue(new Error('Alarm scheduling failed'))

    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    // Should not throw
    await expect(cacheMetricsDO.alarm()).resolves.not.toThrow()

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[CacheMetricsDO] Failed to reschedule alarm:',
      expect.any(Error)
    )

    vi.useRealTimers()
    consoleErrorSpy.mockRestore()
  })
})
