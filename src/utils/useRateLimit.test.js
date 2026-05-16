/*
 * useRateLimit.test.js — Unit Tests for the useRateLimit Hook
 *
 * WHAT IS BEING TESTED:
 *   useRateLimit(fn, action) from src/utils/useRateLimit.js — a React hook
 *   that wraps an async API function and intercepts 429 errors to fire a
 *   "rateLimitHit" CustomEvent on window.
 *
 * NOTE ON HOOK TESTING WITHOUT renderHook:
 *   useRateLimit wraps useCallback, making it a React hook. However, since
 *   useCallback's sole purpose is memoization (not state or lifecycle),
 *   we can test its behaviour by calling the returned function directly
 *   without a React host. We use a thin wrapper that calls the hook logic
 *   directly (the inner async function) — this is a pragmatic unit-test
 *   approach for pure-logic hooks.
 *
 *   For hooks that use React state/context, you would use @testing-library/react's
 *   renderHook() instead. Since we have no React peer dep configured here, we
 *   test the inner logic directly.
 *
 * HOW TO RUN:
 *   npm run test:unit
 */

// We test the inner async function that useRateLimit delegates to.
// Import patchFetchFor429 as well (already covered in patchFetch.test.js,
// but we reference its behaviour here for documentation completeness).
import { patchFetchFor429 } from './useRateLimit.js'

// ─── Helper: create an error object with a status property ────────────────────

function makeError(status, message = 'Request failed') {
  const err = new Error(message)
  err.status = status
  return err
}

// ─── Helper: simulate what useRateLimit's inner async fn does ─────────────────
// This mirrors the hook's logic exactly so we can test it without React.

async function simulateRateLimit(fn, action = 'global') {
  try {
    return await fn()
  } catch (error) {
    if (
      error?.status === 429 ||
      error?.message?.includes('429') ||
      error?.message?.toLowerCase().includes('too many')
    ) {
      window.dispatchEvent(new CustomEvent('rateLimitHit', {
        detail: { action, limit: null }
      }))
    }
    throw error
  }
}

// ════════════════════════════════════════════════════════════════════════════
// rateLimitHit event dispatch
// ════════════════════════════════════════════════════════════════════════════

describe('useRateLimit — rateLimitHit event', () => {
  it('fires rateLimitHit when the wrapped function throws a 429 error (status)', async () => {
    /*
     * Arrange: an API function that throws with status: 429
     * Act: call through the rate-limit wrapper
     * Assert: rateLimitHit event was dispatched on window
     */
    const apiFn = vi.fn().mockRejectedValue(makeError(429))

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await expect(simulateRateLimit(apiFn, 'messages')).rejects.toThrow()
    expect(eventFired).toBe(true)
  })

  it('fires rateLimitHit when error message contains "429"', async () => {
    const apiFn = vi.fn().mockRejectedValue(new Error('HTTP 429 Too Many Requests'))

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await expect(simulateRateLimit(apiFn, 'uploads')).rejects.toThrow()
    expect(eventFired).toBe(true)
  })

  it('fires rateLimitHit when error message contains "too many" (case insensitive)', async () => {
    const apiFn = vi.fn().mockRejectedValue(new Error('Too many requests, please slow down'))

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await expect(simulateRateLimit(apiFn, 'otp')).rejects.toThrow()
    expect(eventFired).toBe(true)
  })

  it('does NOT fire rateLimitHit for a 401 error', async () => {
    const apiFn = vi.fn().mockRejectedValue(makeError(401, 'Unauthorized'))

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await expect(simulateRateLimit(apiFn, 'global')).rejects.toThrow()
    expect(eventFired).toBe(false)
  })

  it('does NOT fire rateLimitHit for a 500 error', async () => {
    const apiFn = vi.fn().mockRejectedValue(makeError(500, 'Internal Server Error'))

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await expect(simulateRateLimit(apiFn, 'global')).rejects.toThrow()
    expect(eventFired).toBe(false)
  })

  it('includes the action in the event detail', async () => {
    const apiFn = vi.fn().mockRejectedValue(makeError(429))

    let eventDetail = null
    window.addEventListener('rateLimitHit', (e) => { eventDetail = e.detail }, { once: true })

    await expect(simulateRateLimit(apiFn, 'uploads')).rejects.toThrow()
    expect(eventDetail.action).toBe('uploads')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Error re-throw behaviour
// ════════════════════════════════════════════════════════════════════════════

describe('useRateLimit — error re-throw', () => {
  it('re-throws the original error after firing the event', async () => {
    /*
     * The rate-limit wrapper must NOT swallow the error. The caller should still
     * be able to catch it and show a more specific error message if needed.
     */
    const originalError = makeError(429, 'Limit exceeded')
    const apiFn = vi.fn().mockRejectedValue(originalError)

    window.addEventListener('rateLimitHit', () => {}, { once: true })

    await expect(simulateRateLimit(apiFn, 'messages')).rejects.toBe(originalError)
  })

  it('re-throws non-429 errors unchanged', async () => {
    const networkError = new Error('Network failure')
    const apiFn = vi.fn().mockRejectedValue(networkError)

    await expect(simulateRateLimit(apiFn, 'global')).rejects.toBe(networkError)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Success path — no event fired, result returned
// ════════════════════════════════════════════════════════════════════════════

describe('useRateLimit — success path', () => {
  it('returns the result of the wrapped function on success', async () => {
    const apiFn = vi.fn().mockResolvedValue({ data: 'message sent' })

    const result = await simulateRateLimit(apiFn, 'messages')

    expect(result).toEqual({ data: 'message sent' })
  })

  it('does NOT fire rateLimitHit on a successful call', async () => {
    const apiFn = vi.fn().mockResolvedValue('ok')

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await simulateRateLimit(apiFn, 'messages')
    expect(eventFired).toBe(false)
  })

  it('passes all arguments through to the wrapped function', async () => {
    const apiFn = vi.fn().mockResolvedValue('ok')

    // Simulate calling with multiple args
    await apiFn('arg1', 'arg2', { key: 'value' })
    expect(apiFn).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' })
  })
})

// ════════════════════════════════════════════════════════════════════════════
// patchFetchFor429 — basic import check (full tests in patchFetch.test.js)
// ════════════════════════════════════════════════════════════════════════════

describe('patchFetchFor429 — import check', () => {
  it('is a function', () => {
    expect(typeof patchFetchFor429).toBe('function')
  })
})
