/*
 * useRateLimit.js — Rate Limit Detection Hook and Global Fetch Patch
 *
 * Purpose:
 *   Provides two ways to detect HTTP 429 (Too Many Requests) responses and
 *   notify the UI to show a rate-limit toast, without requiring every component
 *   to handle 429 errors individually.
 *
 * How the app handles rate limiting:
 *   The backend's RateLimitFilter (in the API Gateway) enforces per-user, per-action
 *   limits (e.g., 60 messages per minute for FREE users, 200 for PRO). When a limit
 *   is exceeded, the backend returns HTTP 429 with an "X-RateLimit-Action" header
 *   that identifies which bucket was exhausted (e.g., "messages", "uploads", "otp").
 *
 *   When a 429 is detected (either via patchFetchFor429 or useRateLimit), a
 *   "rateLimitHit" CustomEvent is dispatched on the window object. The RateLimitToast
 *   component listens for this event and shows a non-blocking toast notification
 *   to the user. This way no prop-drilling is needed — any part of the app can
 *   trigger the toast just by causing a 429 response.
 *
 * Two mechanisms:
 *   1. patchFetchFor429() — called once in main.jsx before React starts. Wraps the
 *      global window.fetch so EVERY HTTP response in the app is checked for 429.
 *      This is the safety net for code paths that don't use the hook.
 *
 *   2. useRateLimit(fn, action) — a React hook that wraps a specific API function.
 *      When the wrapped function throws a 429-related error, it fires the event.
 *      This is used in components that want explicit control (e.g., MessageInput).
 */
import { useCallback } from 'react'

/*
 * useRateLimit(fn, action) — wraps an async function to intercept 429 errors.
 *
 * Parameters:
 *   fn     — the async API function to wrap (e.g., api.uploadFile)
 *   action — a label identifying what action this is (e.g., 'uploads', 'messages')
 *            used in the toast message to tell the user what limit was hit.
 *
 * How it works:
 *   Returns a memoized wrapper function (useCallback for React performance).
 *   When called, it awaits the original function. If it throws an error with
 *   status 429 or a message containing "429" or "too many", it fires the
 *   "rateLimitHit" CustomEvent and then re-throws so the caller can also handle it.
 *
 * Usage example:
 *   const rateLimitedUpload = useRateLimit(api.uploadFile, 'uploads')
 *   await rateLimitedUpload(file, roomId)   // if 429 → toast fires, error re-thrown
 */
export function useRateLimit(fn, action = 'global') {
  return useCallback(async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.toLowerCase().includes('too many')) {
        window.dispatchEvent(new CustomEvent('rateLimitHit', {
          detail: { action, limit: null }
        }))
      }
      throw error
    }
  }, [fn, action])
}

/*
 * patchFetchFor429() — replaces window.fetch with a rate-limit-aware version.
 *
 * Called once from main.jsx before the React app renders. This ensures that even
 * code paths that do not use the useRateLimit hook (e.g., legacy API calls, third-
 * party libraries) still trigger the toast when they receive a 429 response.
 *
 * How it works:
 *   Saves the original window.fetch, then replaces it with a wrapper that:
 *   1. Calls the original fetch normally.
 *   2. If the response has status 429, reads the "X-RateLimit-Action" and
 *      "X-RateLimit-Limit" headers set by the backend's RateLimitFilter.
 *   3. Dispatches the "rateLimitHit" CustomEvent with the action and limit info.
 *   4. Returns the response unchanged so the original caller can still handle it.
 *
 *   Note: the response is returned (not thrown), so this is a non-destructive
 *   patch — the original caller's error handling still works normally.
 */
export function patchFetchFor429() {
  const origFetch = window.fetch
  window.fetch = async function (...args) {
    const res = await origFetch(...args)
    if (res.status === 429) {
      const action = res.headers.get('X-RateLimit-Action') || 'global'
      const limit  = res.headers.get('X-RateLimit-Limit')
      window.dispatchEvent(new CustomEvent('rateLimitHit', {
        detail: { action, limit: limit ? parseInt(limit, 10) : null }
      }))
    }
    return res
  }
}
