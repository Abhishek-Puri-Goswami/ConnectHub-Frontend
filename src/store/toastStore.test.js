/*
 * toastStore.test.js — Unit Tests for useToastStore (Zustand)
 *
 * WHAT IS BEING TESTED:
 *   The useToastStore in src/store/toastStore.js — a Zustand store that manages
 *   in-app toast notifications. Key behaviours:
 *     - addToast()    → adds a toast and returns its ID
 *     - removeToast() → immediately removes a toast by ID
 *     - Deduplication → same message+variant within 4s window is silently dropped
 *     - Auto-remove   → toast is automatically removed after the given duration
 *
 * WHY TEST A ZUSTAND STORE DIRECTLY?
 *   Zustand stores are plain JavaScript objects — you can call their actions and
 *   read their state without rendering any React component. This makes them ideal
 *   for unit testing: fast, isolated, no DOM needed.
 *
 *   We access the store via useToastStore.getState() (Zustand's vanilla API) which
 *   returns the current state and all actions synchronously.
 *
 * IMPORTANT — STATE ISOLATION BETWEEN TESTS:
 *   Zustand stores are singletons — the same instance persists across tests in the
 *   same file. We reset the store state before each test to prevent bleeding.
 *   We also use vi.useFakeTimers() to control setTimeout behaviour deterministically
 *   (so we don't have to wait real milliseconds for auto-removal).
 *
 * HOW TO RUN:
 *   npm run test:unit
 */

import { useToastStore } from '../store/toastStore.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Direct state access — no React hook needed for unit tests */
const getState = () => useToastStore.getState()

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  /*
   * Reset store state to empty before each test.
   * Zustand exposes setState() which merges — we overwrite toasts with [].
   */
  useToastStore.setState({ toasts: [] })

  /*
   * Use fake timers so setTimeout (used for auto-remove) is controlled by
   * vi.advanceTimersByTime() instead of real wall-clock time.
   */
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ════════════════════════════════════════════════════════════════════════════
// addToast
// ════════════════════════════════════════════════════════════════════════════

describe('addToast', () => {
  it('adds a toast to the store and returns its ID', () => {
    /*
     * Arrange + Act: call addToast with a message and variant.
     * Assert: the store now contains one toast and the returned ID is a number.
     */
    const id = getState().addToast('Hello world', 'success')

    const { toasts } = getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Hello world')
    expect(toasts[0].variant).toBe('success')
    expect(typeof id).toBe('number')
  })

  it('uses "info" as default variant', () => {
    getState().addToast('Default variant')

    const { toasts } = getState()
    expect(toasts[0].variant).toBe('info')
  })

  it('assigns a unique incrementing ID to each toast', () => {
    const id1 = getState().addToast('First', 'info')
    const id2 = getState().addToast('Second', 'error')

    expect(id2).toBeGreaterThan(id1)
    expect(id1).not.toBe(id2)
  })

  it('can add multiple toasts with different messages', () => {
    getState().addToast('Toast A', 'info')
    getState().addToast('Toast B', 'error')
    getState().addToast('Toast C', 'success')

    expect(getState().toasts).toHaveLength(3)
  })

  it('stores the correct message and variant on each toast object', () => {
    getState().addToast('Important warning', 'warning')

    const toast = getState().toasts[0]
    expect(toast.message).toBe('Important warning')
    expect(toast.variant).toBe('warning')
    expect(typeof toast.id).toBe('number')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// removeToast
// ════════════════════════════════════════════════════════════════════════════

describe('removeToast', () => {
  it('removes the toast with the matching ID', () => {
    const id = getState().addToast('To be removed', 'error')
    expect(getState().toasts).toHaveLength(1)

    getState().removeToast(id)

    expect(getState().toasts).toHaveLength(0)
  })

  it('only removes the toast with the given ID, leaving others intact', () => {
    const id1 = getState().addToast('Keep me', 'info')
    const id2 = getState().addToast('Remove me', 'error')

    getState().removeToast(id2)

    const { toasts } = getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].id).toBe(id1)
  })

  it('does nothing when the ID does not exist', () => {
    getState().addToast('Existing toast', 'info')

    // Removing a non-existent ID should not throw or crash
    expect(() => getState().removeToast(99999)).not.toThrow()
    expect(getState().toasts).toHaveLength(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Auto-removal (setTimeout)
// ════════════════════════════════════════════════════════════════════════════

describe('auto-remove after duration', () => {
  it('removes the toast automatically after the given duration', () => {
    getState().addToast('Auto-remove me', 'info', 3000)
    expect(getState().toasts).toHaveLength(1)

    /*
     * Advance fake timers by the full duration.
     * The setTimeout callback inside addToast fires and removes the toast.
     */
    vi.advanceTimersByTime(3000)

    expect(getState().toasts).toHaveLength(0)
  })

  it('does NOT remove the toast before the duration elapses', () => {
    getState().addToast('Still here', 'info', 5000)

    vi.advanceTimersByTime(4999)   // just before auto-remove

    expect(getState().toasts).toHaveLength(1)
  })

  it('does NOT auto-remove when duration is 0 (persistent toast)', () => {
    /*
     * duration=0 is the "sticky" toast mode — it stays until manually dismissed.
     * The addToast implementation skips setTimeout when duration <= 0.
     */
    getState().addToast('Sticky toast', 'error', 0)

    vi.advanceTimersByTime(60_000)   // advance 1 full minute

    expect(getState().toasts).toHaveLength(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Deduplication (same message+variant within 4 seconds)
// ════════════════════════════════════════════════════════════════════════════

describe('deduplication', () => {
  it('silently drops a duplicate toast within the 4-second dedup window', () => {
    /*
     * The store tracks when each (variant::message) combo was last shown.
     * A second addToast with the same pair within 4000ms returns null and
     * does NOT add a second toast.
     */
    getState().addToast('Connection lost', 'error')
    const id2 = getState().addToast('Connection lost', 'error')

    expect(id2).toBeNull()
    expect(getState().toasts).toHaveLength(1)
  })

  it('allows the same message with a DIFFERENT variant', () => {
    /*
     * The dedup key is `variant::message`. Different variant = different key.
     */
    getState().addToast('Update available', 'info')
    const id2 = getState().addToast('Update available', 'success')

    expect(id2).not.toBeNull()
    expect(getState().toasts).toHaveLength(2)
  })

  it('allows the same message+variant after the 4-second window expires', () => {
    getState().addToast('Rate limit hit', 'warning')

    // Advance past the 4000ms dedup window
    vi.advanceTimersByTime(4001)

    const id2 = getState().addToast('Rate limit hit', 'warning')

    expect(id2).not.toBeNull()
  })

  it('allows different messages with the same variant', () => {
    getState().addToast('Error A', 'error')
    const id2 = getState().addToast('Error B', 'error')

    expect(id2).not.toBeNull()
    expect(getState().toasts).toHaveLength(2)
  })
})
