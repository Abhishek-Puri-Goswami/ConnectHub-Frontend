/*
 * roomMembers.test.js — Unit Tests for Room Member Enrichment Utilities
 *
 * WHAT IS BEING TESTED:
 *   - enrichRoomMembers(rawMembers) — fetches profile data for each member and
 *     merges it with the raw member record from the room-service.
 *   - getMemberDisplay(member) — formats a member object for display in the UI.
 *
 * WHY ENRICHMENT EXISTS:
 *   The room-service stores only lightweight member records: { userId, role }.
 *   To show member names and avatars in the sidebar we must fetch each user's
 *   profile from the auth-service. enrichRoomMembers() does this in parallel
 *   (Promise.all) and merges the results.
 *
 * HOW WE TEST ASYNC FUNCTIONS IN VITEST:
 *   Vitest (like Jest) supports async tests natively. Just add "async" before
 *   the callback and use "await" inside:
 *     it('should ...', async () => { const result = await enrichRoomMembers(...)})
 *
 * MOCKING api.getProfile:
 *   enrichRoomMembers() calls api.getProfile(userId) which makes an HTTP request.
 *   In unit tests we NEVER make real HTTP requests — they're slow, require a running
 *   server, and produce non-deterministic results.
 *
 *   Instead we use "vi.mock()" (Vitest's mock utility) to replace the entire
 *   '../services/api' module with a fake version. Then we use "vi.mocked()" to
 *   configure what the fake api.getProfile() should return for each test.
 *
 *   BEGINNER NOTE — vi.mock() hoisting:
 *   Vitest hoists vi.mock() calls to the top of the file automatically. This means
 *   the mock is applied BEFORE the imports, so every file that imports '../services/api'
 *   during this test run gets the mocked version.
 */

import { enrichRoomMembers, getMemberDisplay } from './roomMembers.js'
import { api } from '../services/api.js'

/*
 * vi.mock('../services/api.js') replaces the entire module with auto-mocked stubs.
 * After this line, api.getProfile is a vi.fn() (a Vitest mock function) that
 * does nothing and returns undefined by default — until we configure it per-test.
 */
vi.mock('../services/api.js', () => ({
  api: {
    getProfile: vi.fn(),
  },
}))

/*
 * beforeEach runs before every test. We clear all mock call history and return
 * values so tests don't accidentally share state.
 *
 * vi.clearAllMocks() resets:
 *   - how many times each mock was called
 *   - what arguments were passed
 *   - mock return values set with mockResolvedValue / mockReturnValue
 */
beforeEach(() => {
  vi.clearAllMocks()
})

// ════════════════════════════════════════════════════════════════════════════
// enrichRoomMembers
// ════════════════════════════════════════════════════════════════════════════

describe('enrichRoomMembers', () => {

  // ── happy path ─────────────────────────────────────────────���──────────────

  it('merges profile data into member records', async () => {
    /*
     * Arrange: configure api.getProfile to return a profile for userId 1.
     * mockResolvedValue() makes the mock return a resolved Promise — simulating
     * a successful async API call.
     */
    api.getProfile.mockResolvedValue({
      username: 'alice',
      fullName: 'Alice Smith',
      avatarUrl: 'https://cdn.example.com/alice.jpg',
      status: 'ONLINE',
    })

    const rawMembers = [{ userId: 1, role: 'ADMIN' }]

    // Act
    const result = await enrichRoomMembers(rawMembers)

    // Assert: the profile fields are merged in
    expect(result).toHaveLength(1)
    expect(result[0].username).toBe('alice')
    expect(result[0].fullName).toBe('Alice Smith')
    expect(result[0].avatarUrl).toBe('https://cdn.example.com/alice.jpg')
    expect(result[0].status).toBe('ONLINE')
    // Original field preserved
    expect(result[0].role).toBe('ADMIN')
  })

  it('fetches profiles for all members in parallel', async () => {
    /*
     * Promise.all sends all fetches concurrently. Here we verify that
     * api.getProfile is called exactly once per unique userId.
     *
     * mockResolvedValue() always returns the same value regardless of args.
     * We just need any non-null profile to exercise the merge logic.
     */
    api.getProfile.mockResolvedValue({ username: 'user', fullName: 'User Name' })

    const rawMembers = [
      { userId: 1, role: 'ADMIN' },
      { userId: 2, role: 'MEMBER' },
      { userId: 3, role: 'MEMBER' },
    ]

    await enrichRoomMembers(rawMembers)

    /*
     * expect(fn).toHaveBeenCalledTimes(n) checks the mock call count.
     * Each unique userId should produce exactly one getProfile() call.
     */
    expect(api.getProfile).toHaveBeenCalledTimes(3)
  })

  it('deduplicates requests for the same userId', async () => {
    /*
     * If the same userId appears twice in the member list (which shouldn't happen
     * in practice but defensive coding is good), we fetch the profile only once.
     * The enrichRoomMembers() uses a Set to deduplicate userId before fetching.
     */
    api.getProfile.mockResolvedValue({ username: 'alice', fullName: 'Alice' })

    const rawMembers = [
      { userId: 1, role: 'ADMIN' },
      { userId: 1, role: 'MEMBER' }, // duplicate
    ]

    await enrichRoomMembers(rawMembers)

    expect(api.getProfile).toHaveBeenCalledTimes(1)
  })

  // ── error resilience ──────────────────────────────────────────────────────

  it('returns original member if getProfile throws', async () => {
    /*
     * Scenario: one user was deleted from the auth-service (account closed).
     * The profile fetch returns a 404 which causes the Feign client to throw.
     *
     * Expected: enrichRoomMembers() catches the error and returns the original
     * raw member object unchanged rather than crashing or removing the member
     * from the list.
     *
     * mockRejectedValue() makes the mock return a rejected Promise — simulating
     * a failed async API call (network error, 404, 500, etc.)
     */
    api.getProfile.mockRejectedValue(new Error('User not found'))

    const rawMembers = [{ userId: 99, role: 'MEMBER', username: 'ghost_user' }]

    const result = await enrichRoomMembers(rawMembers)

    // Member still appears in the result
    expect(result).toHaveLength(1)
    // Original username is preserved (no merge since profile was null)
    expect(result[0].username).toBe('ghost_user')
    expect(result[0].role).toBe('MEMBER')
  })

  it('enriches successful members even when one profile fetch fails', async () => {
    /*
     * Mixed scenario: user 1 has a valid profile, user 2 is deleted.
     * User 1 should be enriched normally; user 2 should appear with original data.
     *
     * mockImplementation() lets us return different values per call based on args.
     */
    api.getProfile.mockImplementation((userId) => {
      if (userId === 1) return Promise.resolve({ username: 'alice', fullName: 'Alice' })
      return Promise.reject(new Error('Not found'))
    })

    const rawMembers = [
      { userId: 1, role: 'ADMIN', username: 'old_alice' },
      { userId: 2, role: 'MEMBER', username: 'ghost' },
    ]

    const result = await enrichRoomMembers(rawMembers)

    expect(result).toHaveLength(2)
    // User 1 enriched
    expect(result[0].username).toBe('alice')
    // User 2 untouched
    expect(result[1].username).toBe('ghost')
  })

  // ── empty / null input guards ─────────────────────────────────────────────

  it('returns empty array for empty input', async () => {
    const result = await enrichRoomMembers([])
    expect(result).toEqual([])
    expect(api.getProfile).not.toHaveBeenCalled()
  })

  it('returns empty array for null input', async () => {
    const result = await enrichRoomMembers(null)
    expect(result).toEqual([])
  })

  it('returns empty array for non-array input', async () => {
    const result = await enrichRoomMembers('not-an-array')
    expect(result).toEqual([])
  })

  it('filters out members with null userId before fetching', async () => {
    /*
     * Members with a null userId cannot have a profile fetched.
     * The Set deduplication step filters these out.
     */
    api.getProfile.mockResolvedValue({ username: 'valid' })

    const rawMembers = [
      { userId: null, role: 'MEMBER' },
      { userId: 1, role: 'ADMIN' },
    ]

    await enrichRoomMembers(rawMembers)

    // Only one real fetch for the non-null userId
    expect(api.getProfile).toHaveBeenCalledTimes(1)
    expect(api.getProfile).toHaveBeenCalledWith(1)
  })

  // ── profile field precedence ──────────────────────────────────────────────

  it('prefers profile values over stale member record values', async () => {
    /*
     * The member record in room-service may have a cached/stale username.
     * The profile from auth-service has the up-to-date value.
     * The merge should prefer the fresh profile data.
     */
    api.getProfile.mockResolvedValue({
      username: 'new_username',
      fullName: 'New Name',
      avatarUrl: 'new_avatar.jpg',
    })

    const rawMembers = [{
      userId: 1,
      role: 'MEMBER',
      username: 'old_username',  // stale value
      fullName: 'Old Name',      // stale value
    }]

    const result = await enrichRoomMembers(rawMembers)

    expect(result[0].username).toBe('new_username')
    expect(result[0].fullName).toBe('New Name')
  })

  it('falls back to member record values when profile field is null/undefined', async () => {
    /*
     * The profile from auth-service may not have an avatarUrl set yet.
     * In that case we keep the value already in the member record.
     */
    api.getProfile.mockResolvedValue({
      username: 'alice',
      fullName: null,   // null → fall back to member's fullName
      avatarUrl: null,  // null → fall back to member's avatarUrl
    })

    const rawMembers = [{
      userId: 1,
      role: 'MEMBER',
      fullName: 'Alice Fallback',
      avatarUrl: 'fallback_avatar.jpg',
    }]

    const result = await enrichRoomMembers(rawMembers)

    /*
     * The merge uses "profile.fullName || member.fullName".
     * null || 'Alice Fallback' → 'Alice Fallback'
     */
    expect(result[0].fullName).toBe('Alice Fallback')
    expect(result[0].avatarUrl).toBe('fallback_avatar.jpg')
  })
})

// ════════════════════════════════════════════════════════════════════════════
// getMemberDisplay
// ════════════════════════════════════════════════════════════════════════════

describe('getMemberDisplay', () => {
  /*
   * getMemberDisplay() formats a member for display in the member list panel.
   * It returns { primary, secondary } where:
   *   primary   — the main display line (fullName, or @username, or fallback)
   *   secondary — "@username • ROLE"
   */

  it('uses fullName as the primary display when available', () => {
    const result = getMemberDisplay({ fullName: 'Alice Smith', username: 'alice', role: 'ADMIN' })
    expect(result.primary).toBe('Alice Smith')
  })

  it('falls back to username as primary when fullName is absent', () => {
    const result = getMemberDisplay({ username: 'alice', role: 'MEMBER' })
    expect(result.primary).toBe('alice')
  })

  it('falls back to "User {userId}" when both fullName and username are absent', () => {
    /*
     * This handles freshly-created members whose profile hasn't loaded yet.
     * The member list still shows something instead of blank.
     */
    const result = getMemberDisplay({ userId: 42, role: 'MEMBER' })
    expect(result.primary).toBe('User 42')
  })

  it('falls back to "User ?" when userId is also absent', () => {
    const result = getMemberDisplay({ role: 'MEMBER' })
    expect(result.primary).toBe('User ?')
  })

  it('includes @username in the secondary line', () => {
    const result = getMemberDisplay({ username: 'alice', role: 'ADMIN' })
    expect(result.secondary).toContain('@alice')
  })

  it('includes the role in the secondary line', () => {
    const result = getMemberDisplay({ username: 'alice', role: 'ADMIN' })
    expect(result.secondary).toContain('ADMIN')
  })

  it('secondary line format is "@username • ROLE"', () => {
    const result = getMemberDisplay({ username: 'bob', role: 'MEMBER' })
    expect(result.secondary).toBe('@bob • MEMBER')
  })

  it('defaults role to "MEMBER" when role is absent', () => {
    /*
     * If the role field is missing (shouldn't happen in production but defensive),
     * the secondary line uses "MEMBER" as the default role label.
     */
    const result = getMemberDisplay({ username: 'charlie' })
    expect(result.secondary).toContain('MEMBER')
  })

  it('shows only the role when username is absent', () => {
    /*
     * Without a username there's no "@username" to show.
     * The secondary line should just be the role.
     */
    const result = getMemberDisplay({ userId: 7, role: 'GUEST' })
    expect(result.secondary).toBe('GUEST')
  })

  it('trims whitespace from fullName and username', () => {
    /*
     * The trim() calls prevent "  Alice  " from appearing as a primary value
     * with leading/trailing spaces, which would look wrong in the UI.
     */
    const result = getMemberDisplay({ fullName: '  Bob  ', username: '  bob  ', role: 'MEMBER' })
    expect(result.primary).toBe('Bob')
  })
})
