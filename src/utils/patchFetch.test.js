/*
 * patchFetch.test.js — Unit Tests for patchFetchFor429 (Rate Limit Detection)
 *
 * WHAT IS BEING TESTED:
 *   patchFetchFor429() in useRateLimit.js — a global fetch wrapper that detects
 *   HTTP 429 (Too Many Requests) responses and fires a "rateLimitHit" CustomEvent
 *   on the window object.
 *
 * WHY THIS EXISTS:
 *   The backend's API Gateway enforces rate limits per user (e.g., 60 messages/minute
 *   for FREE tier). When a limit is hit, the backend returns HTTP 429 with headers:
 *     X-RateLimit-Action: "messages"    (which bucket was exhausted)
 *     X-RateLimit-Limit: "60"           (the limit value)
 *
 *   Instead of every component having to check for 429 individually, patchFetchFor429()
 *   is called ONCE in main.jsx and wraps window.fetch globally. Any 429 response from
 *   anywhere in the app automatically fires the "rateLimitHit" event, which the
 *   RateLimitToast component listens for to show a non-blocking toast notification.
 *
 * HOW WE TEST window.fetch IN VITEST / JSDOM:
 *   jsdom provides window.fetch but it doesn't actually make HTTP requests.
 *   We replace window.fetch with a mock function (vi.fn()) that returns a
 *   pre-configured fake Response. This lets us test the patch behavior in isolation
 *   without a running server.
 *
 * IMPORTANT — RESTORING window.fetch:
 *   patchFetchFor429() replaces window.fetch with a new function. After each test
 *   we must restore the original fetch (saved in beforeEach) so tests don't pollute
 *   each other. If we don't restore it, the second test would see the patched version
 *   of window.fetch from the first test — causing double-patching bugs.
 *
 * KEY CONCEPTS:
 *   CustomEvent   — a browser event you can create with a custom name and data payload.
 *   addEventListener — registers a callback that fires when a named event occurs.
 *   vi.fn()       — creates a Vitest mock function that records calls and returns
 *                   whatever value you configure with mockResolvedValue().
 */

import { patchFetchFor429 } from './useRateLimit.js'

/*
 * Helper: creates a minimal Response-like object that patchFetchFor429 reads.
 *
 * The Headers class from the browser (and jsdom) stores key-value pairs.
 * Response.headers.get('X-RateLimit-Action') returns the header value or null.
 *
 * @param {number} status  - HTTP status code (e.g., 200, 429)
 * @param {Object} headers - header key-value pairs to include in the response
 */
function fakeResponse(status, headers = {}) {
  return {
    status,
    headers: {
      /*
       * We use a Map to simulate Headers.get().
       * In real fetch, response.headers.get(name) is case-insensitive,
       * but for our tests we match the exact casing used in patchFetchFor429.
       */
      get: (name) => headers[name] ?? null,
    },
  }
}

describe('patchFetchFor429', () => {
  /*
   * originalFetch stores the real window.fetch (or the mock from a previous test).
   * We restore it after each test to prevent test-to-test interference.
   */
  let originalFetch

  beforeEach(() => {
    originalFetch = window.fetch
  })

  afterEach(() => {
    /*
     * CRITICAL: restore window.fetch after every test.
     * Without this, the next test starts with a patched fetch from the previous test.
     */
    window.fetch = originalFetch
  })

  // ── basic 429 detection ───────────────────────────────────────────────────

  it('fires rateLimitHit event when fetch returns 429', async () => {
    /*
     * Arrange:
     *   - Mock fetch to return a 429 response with no rate limit headers.
     *   - Listen for the "rateLimitHit" event on window.
     *   - Apply the patch.
     *
     * Act: call the patched window.fetch().
     *
     * Assert: the event was fired with the expected detail object.
     */
    window.fetch = vi.fn().mockResolvedValue(fakeResponse(429))
    patchFetchFor429()

    let capturedEvent = null
    window.addEventListener('rateLimitHit', (e) => { capturedEvent = e }, { once: true })

    await window.fetch('/api/messages')

    expect(capturedEvent).not.toBeNull()
    expect(capturedEvent.type).toBe('rateLimitHit')
  })

  it('does NOT fire rateLimitHit for a 200 response', async () => {
    /*
     * Normal successful requests must not trigger the rate limit toast.
     */
    window.fetch = vi.fn().mockResolvedValue(fakeResponse(200))
    patchFetchFor429()

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await window.fetch('/api/rooms')

    expect(eventFired).toBe(false)
  })

  it('does NOT fire rateLimitHit for a 401 response', async () => {
    window.fetch = vi.fn().mockResolvedValue(fakeResponse(401))
    patchFetchFor429()

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await window.fetch('/api/auth/profile')

    expect(eventFired).toBe(false)
  })

  it('does NOT fire rateLimitHit for a 500 response', async () => {
    window.fetch = vi.fn().mockResolvedValue(fakeResponse(500))
    patchFetchFor429()

    let eventFired = false
    window.addEventListener('rateLimitHit', () => { eventFired = true }, { once: true })

    await window.fetch('/api/upload')

    expect(eventFired).toBe(false)
  })

  // ── event detail: action and limit headers ────────────────────────────────

  it('includes the X-RateLimit-Action header value in the event detail', async () => {
    /*
     * When the backend sends X-RateLimit-Action: "messages", the event detail
     * should carry action: "messages" so the toast can display the right message.
     */
    window.fetch = vi.fn().mockResolvedValue(
      fakeResponse(429, { 'X-RateLimit-Action': 'messages' })
    )
    patchFetchFor429()

    let eventDetail = null
    window.addEventListener('rateLimitHit', (e) => { eventDetail = e.detail }, { once: true })

    await window.fetch('/api/messages/send')

    expect(eventDetail.action).toBe('messages')
  })

  it('defaults action to "global" when X-RateLimit-Action header is absent', async () => {
    /*
     * Not all 429 responses include the action header. The patch falls back to "global"
     * so the toast still shows instead of crashing or showing "null".
     */
    window.fetch = vi.fn().mockResolvedValue(fakeResponse(429, {}))
    patchFetchFor429()

    let eventDetail = null
    window.addEventListener('rateLimitHit', (e) => { eventDetail = e.detail }, { once: true })

    await window.fetch('/api/unknown')

    expect(eventDetail.action).toBe('global')
  })

  it('parses the X-RateLimit-Limit header as an integer', async () => {
    /*
     * The limit header is a string like "60". The event detail should carry it
     * as a number (60) so the UI can format it cleanly: "You hit the 60/min limit".
     */
    window.fetch = vi.fn().mockResolvedValue(
      fakeResponse(429, {
        'X-RateLimit-Action': 'uploads',
        'X-RateLimit-Limit': '10',
      })
    )
    patchFetchFor429()

    let eventDetail = null
    window.addEventListener('rateLimitHit', (e) => { eventDetail = e.detail }, { once: true })

    await window.fetch('/api/media/upload')

    expect(eventDetail.limit).toBe(10)
    expect(typeof eventDetail.limit).toBe('number')
  })

  it('sets limit to null when X-RateLimit-Limit header is absent', async () => {
    window.fetch = vi.fn().mockResolvedValue(
      fakeResponse(429, { 'X-RateLimit-Action': 'otp' })
    )
    patchFetchFor429()

    let eventDetail = null
    window.addEventListener('rateLimitHit', (e) => { eventDetail = e.detail }, { once: true })

    await window.fetch('/api/auth/otp/request')

    expect(eventDetail.limit).toBeNull()
  })

  // ── response passthrough ──────────────────────────────────────────────────

  it('returns the original response object unchanged after firing the event', async () => {
    /*
     * IMPORTANT: the patch must NOT swallow the response. The caller (e.g., an API
     * function) still needs to receive the 429 response so it can handle it in its
     * own error flow (show a more specific error, retry, etc.).
     *
     * patchFetchFor429() is a non-destructive interceptor — it observes and emits
     * an event, then passes the response through unchanged.
     */
    const originalResponse = fakeResponse(429, { 'X-RateLimit-Action': 'messages' })
    window.fetch = vi.fn().mockResolvedValue(originalResponse)
    patchFetchFor429()

    window.addEventListener('rateLimitHit', () => {}, { once: true })

    const returnedResponse = await window.fetch('/api/test')

    /*
     * The response returned to the caller must be the SAME object that the
     * original fetch returned — not a copy, not undefined, not a modified version.
     */
    expect(returnedResponse).toBe(originalResponse)
    expect(returnedResponse.status).toBe(429)
  })

  it('returns a 200 response unchanged (no modification to non-429)', async () => {
    const successResponse = fakeResponse(200)
    window.fetch = vi.fn().mockResolvedValue(successResponse)
    patchFetchFor429()

    const returnedResponse = await window.fetch('/api/rooms')

    expect(returnedResponse).toBe(successResponse)
    expect(returnedResponse.status).toBe(200)
  })

  // ── delegation to original fetch ─────────────────────────────────────────

  it('delegates all arguments to the original fetch', async () => {
    /*
     * The patch wraps window.fetch but must forward the request URL, method,
     * body, headers etc. to the original. If it doesn't, the request is lost.
     */
    const mockOriginalFetch = vi.fn().mockResolvedValue(fakeResponse(200))
    window.fetch = mockOriginalFetch
    patchFetchFor429()

    const fetchOptions = { method: 'POST', body: JSON.stringify({ text: 'hello' }) }
    await window.fetch('/api/messages', fetchOptions)

    /*
     * toHaveBeenCalledWith() asserts the mock was called with these exact arguments.
     * This verifies the patch passes through both the URL and the options object.
     */
    expect(mockOriginalFetch).toHaveBeenCalledWith('/api/messages', fetchOptions)
  })

  it('calls the underlying fetch exactly once per request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse(200))
    window.fetch = mockFetch
    patchFetchFor429()

    await window.fetch('/api/rooms')

    /*
     * The patch must not call the original fetch multiple times (e.g., for retry).
     * Retrying is the responsibility of the API layer, not the global patch.
     */
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
