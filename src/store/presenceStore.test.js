/*
 * presenceStore.test.js — Unit Tests for usePresenceStore (Zustand)
 *
 * WHAT IS BEING TESTED:
 *   usePresenceStore in src/store/presenceStore.js — tracks the current user's
 *   presence status: ONLINE / AWAY / DND / INVISIBLE.
 *
 *   Key behaviours tested:
 *     - Initial state defaults (ONLINE, not auto-away)
 *     - setStatus()      → updates userStatus + prevStatus, clears isAutoAway
 *     - setAutoAway()    → only triggers from ONLINE, saves prevStatus
 *     - clearAutoAway()  → restores prevStatus, clears the flag
 *     - initStatus()     → hydrates store from API response
 *     - API calls are mocked — we test state logic only, not network behaviour
 *
 * WHY MOCK THE API?
 *   The store calls api.setPresenceStatus() and api.getPresence() on every action.
 *   These functions make HTTP requests. In unit tests we mock them with vi.fn()
 *   so the tests are fast, deterministic, and don't need a running server.
 *
 * HOW TO RUN:
 *   npm run test:unit
 */

import { usePresenceStore } from '../store/presenceStore.js'

// ── Mock the api module so no real HTTP requests are made ──────────────────────
vi.mock('../services/api.js', () => ({
  api: {
    setPresenceStatus: vi.fn().mockResolvedValue({}),
    getPresence: vi.fn().mockResolvedValue({ status: 'ONLINE' }),
  }
}))

// ─── helpers ──────────────────────────────────────────────────────────────────

const getState = () => usePresenceStore.getState()

// ─── reset state before each test ────────────────────────────────────────────

beforeEach(() => {
  usePresenceStore.setState({
    userStatus: 'ONLINE',
    isAutoAway: false,
    prevStatus: 'ONLINE',
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Initial state
// ════════════════════════════════════════════════════════════════════════════

describe('presenceStore — initial state', () => {
  it('starts with userStatus ONLINE', () => {
    expect(getState().userStatus).toBe('ONLINE')
  })

  it('starts with isAutoAway false', () => {
    expect(getState().isAutoAway).toBe(false)
  })

  it('starts with prevStatus ONLINE', () => {
    expect(getState().prevStatus).toBe('ONLINE')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// setStatus — manual status change
// ════════════════════════════════════════════════════════════════════════════

describe('setStatus', () => {
  it('updates userStatus to the chosen status', async () => {
    await getState().setStatus(1, 'DND')
    expect(getState().userStatus).toBe('DND')
  })

  it('updates prevStatus to match the new status', async () => {
    /*
     * prevStatus must be updated on manual changes so clearAutoAway
     * restores the right value (not an old one).
     */
    await getState().setStatus(1, 'AWAY')
    expect(getState().prevStatus).toBe('AWAY')
  })

  it('clears the isAutoAway flag on manual status change', async () => {
    /*
     * If the user was auto-awayed and then manually changes their status,
     * the auto-away flag must be cleared to reset the idle timer.
     */
    usePresenceStore.setState({ isAutoAway: true })
    await getState().setStatus(1, 'DND')
    expect(getState().isAutoAway).toBe(false)
  })

  it('can set all four valid statuses', async () => {
    for (const status of ['ONLINE', 'AWAY', 'DND', 'INVISIBLE']) {
      await getState().setStatus(1, status)
      expect(getState().userStatus).toBe(status)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// setAutoAway — triggered by idle detector
// ════════════════════════════════════════════════════════════════════════════

describe('setAutoAway', () => {
  it('switches userStatus to AWAY when user was ONLINE', async () => {
    usePresenceStore.setState({ userStatus: 'ONLINE', isAutoAway: false })

    await getState().setAutoAway(1)

    expect(getState().userStatus).toBe('AWAY')
  })

  it('sets isAutoAway to true', async () => {
    usePresenceStore.setState({ userStatus: 'ONLINE', isAutoAway: false })

    await getState().setAutoAway(1)

    expect(getState().isAutoAway).toBe(true)
  })

  it('saves the previous status in prevStatus before switching to AWAY', async () => {
    /*
     * If the user was ONLINE before auto-away, prevStatus must be ONLINE
     * so clearAutoAway can restore it correctly.
     */
    usePresenceStore.setState({ userStatus: 'ONLINE', isAutoAway: false, prevStatus: 'ONLINE' })

    await getState().setAutoAway(1)

    expect(getState().prevStatus).toBe('ONLINE')
  })

  it('does NOT switch to AWAY if already auto-away', async () => {
    /*
     * Guard: if the idle detector fires twice, the second call should be ignored.
     */
    usePresenceStore.setState({ userStatus: 'AWAY', isAutoAway: true, prevStatus: 'ONLINE' })

    await getState().setAutoAway(1)

    // Status and flags must remain unchanged
    expect(getState().userStatus).toBe('AWAY')
    expect(getState().isAutoAway).toBe(true)
  })

  it('does NOT switch to AWAY if user is on DND (respects manual status)', async () => {
    /*
     * If the user manually set DND, auto-away must not override that.
     * This is the key "restore DND after reconnect" feature.
     */
    usePresenceStore.setState({ userStatus: 'DND', isAutoAway: false })

    await getState().setAutoAway(1)

    expect(getState().userStatus).toBe('DND')
    expect(getState().isAutoAway).toBe(false)
  })

  it('does NOT switch to AWAY if user is INVISIBLE', async () => {
    usePresenceStore.setState({ userStatus: 'INVISIBLE', isAutoAway: false })

    await getState().setAutoAway(1)

    expect(getState().userStatus).toBe('INVISIBLE')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// clearAutoAway — user becomes active again
// ════════════════════════════════════════════════════════════════════════════

describe('clearAutoAway', () => {
  it('restores userStatus to prevStatus when auto-away was active', async () => {
    /*
     * Scenario: user was on DND, idle timer fired → AWAY.
     * User moves mouse → clearAutoAway → DND restored.
     */
    usePresenceStore.setState({ userStatus: 'AWAY', isAutoAway: true, prevStatus: 'DND' })

    await getState().clearAutoAway(1)

    expect(getState().userStatus).toBe('DND')
  })

  it('clears isAutoAway flag after restore', async () => {
    usePresenceStore.setState({ userStatus: 'AWAY', isAutoAway: true, prevStatus: 'ONLINE' })

    await getState().clearAutoAway(1)

    expect(getState().isAutoAway).toBe(false)
  })

  it('does nothing if isAutoAway is false (user was not auto-awayed)', async () => {
    /*
     * Guard: if the activity event fires when we were never auto-awayed,
     * the store must remain unchanged.
     */
    usePresenceStore.setState({ userStatus: 'DND', isAutoAway: false, prevStatus: 'DND' })

    await getState().clearAutoAway(1)

    expect(getState().userStatus).toBe('DND')
  })

  it('falls back to ONLINE if prevStatus is null/undefined', async () => {
    usePresenceStore.setState({ userStatus: 'AWAY', isAutoAway: true, prevStatus: null })

    await getState().clearAutoAway(1)

    expect(getState().userStatus).toBe('ONLINE')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// initStatus — hydrate from API on login
// ════════════════════════════════════════════════════════════════════════════

describe('initStatus', () => {
  it('updates userStatus from the API response', async () => {
    const { api } = await import('../services/api.js')
    api.getPresence.mockResolvedValueOnce({ status: 'DND' })

    await getState().initStatus(1)

    expect(getState().userStatus).toBe('DND')
  })

  it('does not update state if API returns no status', async () => {
    const { api } = await import('../services/api.js')
    api.getPresence.mockResolvedValueOnce({})   // no status field

    usePresenceStore.setState({ userStatus: 'ONLINE' })
    await getState().initStatus(1)

    expect(getState().userStatus).toBe('ONLINE')  // unchanged
  })

  it('does not throw if the API call fails', async () => {
    const { api } = await import('../services/api.js')
    api.getPresence.mockRejectedValueOnce(new Error('Network error'))

    await expect(getState().initStatus(1)).resolves.not.toThrow()
  })
})
