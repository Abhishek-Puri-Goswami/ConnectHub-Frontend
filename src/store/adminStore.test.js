/*
 * adminStore.test.js — Unit Tests for useAdminStore (Zustand)
 *
 * Coverage target: 80%+ branch coverage
 *
 * MOCKING STRATEGY:
 *   adminApi is mocked so no HTTP requests are made.
 *   Each test controls exactly what the API returns / throws.
 *
 * HOW TO RUN:
 *   npm run test:unit
 */

vi.mock('../services/adminApi.js', () => ({
  adminApi: {
    getAllUsers: vi.fn(),
    suspendUser: vi.fn(),
    reactivateUser: vi.fn(),
    deleteUser: vi.fn(),
    getAuditLogs: vi.fn(),
    changeRole: vi.fn(),
    getOnlineCount: vi.fn(),
  }
}))

import { useAdminStore } from './adminStore.js'
import { adminApi } from '../services/adminApi.js'

// ── helpers ──────────────────────────────────────────────────────────────────

const getState = () => useAdminStore.getState()

const INITIAL_STATE = {
  users: [],
  auditLogs: [],
  auditPage: { number: 0, totalPages: 0, totalElements: 0 },
  loading: false,
  error: null,
  searchQuery: '',
  onlineCount: null,
}

const SAMPLE_USERS = [
  { userId: 1, username: 'alice', email: 'alice@test.com', phoneNumber: '1111111111', fullName: 'Alice Smith', active: true, role: 'USER' },
  { userId: 2, username: 'bob',   email: 'bob@test.com',   phoneNumber: '2222222222', fullName: 'Bob Jones',   active: true, role: 'USER' },
  { userId: 3, username: 'carol', email: 'carol@org.com',  phoneNumber: '3333333333', fullName: 'Carol White', active: false, role: 'USER' },
]

// ── reset before each test ────────────────────────────────────────────────────

beforeEach(() => {
  useAdminStore.setState({ ...INITIAL_STATE })
  vi.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// setSearchQuery
// ═══════════════════════════════════════════════════════════════════════════════

describe('setSearchQuery', () => {
  it('updates searchQuery', () => {
    getState().setSearchQuery('alice')
    expect(getState().searchQuery).toBe('alice')
  })

  it('can be set to an empty string', () => {
    getState().setSearchQuery('bob')
    getState().setSearchQuery('')
    expect(getState().searchQuery).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// fetchUsers
// ═══════════════════════════════════════════════════════════════════════════════

describe('fetchUsers', () => {
  it('sets users array on success', async () => {
    adminApi.getAllUsers.mockResolvedValue(SAMPLE_USERS)

    await getState().fetchUsers()

    expect(getState().users).toEqual(SAMPLE_USERS)
    expect(getState().loading).toBe(false)
    expect(getState().error).toBeNull()
  })

  it('sets loading=true while fetching', async () => {
    let capturedLoading = false
    adminApi.getAllUsers.mockImplementation(() => {
      capturedLoading = useAdminStore.getState().loading
      return Promise.resolve([])
    })

    await getState().fetchUsers()

    expect(capturedLoading).toBe(true)
  })

  it('defaults users to empty array when API returns non-array', async () => {
    adminApi.getAllUsers.mockResolvedValue({ message: 'unexpected object' })

    await getState().fetchUsers()

    expect(getState().users).toEqual([])
  })

  it('defaults users to empty array when API returns null', async () => {
    adminApi.getAllUsers.mockResolvedValue(null)

    await getState().fetchUsers()

    expect(getState().users).toEqual([])
  })

  it('sets error on failure', async () => {
    adminApi.getAllUsers.mockRejectedValue(new Error('Forbidden'))

    await getState().fetchUsers()

    expect(getState().error).toBe('Forbidden')
    expect(getState().users).toEqual([])
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// suspendUser
// ═══════════════════════════════════════════════════════════════════════════════

describe('suspendUser', () => {
  beforeEach(() => {
    useAdminStore.setState({ users: SAMPLE_USERS.map(u => ({ ...u })) })
  })

  it('marks the user as inactive by userId', async () => {
    adminApi.suspendUser.mockResolvedValue({})

    await getState().suspendUser(1)

    expect(getState().users.find(u => u.userId === 1).active).toBe(false)
  })

  it('marks the user as inactive by id (alternate key)', async () => {
    useAdminStore.setState({
      users: [{ id: 99, username: 'dave', active: true }]
    })
    adminApi.suspendUser.mockResolvedValue({})

    await getState().suspendUser(99)

    expect(getState().users.find(u => u.id === 99).active).toBe(false)
  })

  it('does not affect other users', async () => {
    adminApi.suspendUser.mockResolvedValue({})

    await getState().suspendUser(1)

    expect(getState().users.find(u => u.userId === 2).active).toBe(true)
  })

  it('sets loading=false after success', async () => {
    adminApi.suspendUser.mockResolvedValue({})

    await getState().suspendUser(1)

    expect(getState().loading).toBe(false)
  })

  it('sets error and rethrows on failure', async () => {
    adminApi.suspendUser.mockRejectedValue(new Error('Suspend failed'))

    await expect(getState().suspendUser(1)).rejects.toThrow('Suspend failed')
    expect(getState().error).toBe('Suspend failed')
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// reactivateUser
// ═══════════════════════════════════════════════════════════════════════════════

describe('reactivateUser', () => {
  beforeEach(() => {
    // Start with carol suspended
    useAdminStore.setState({
      users: SAMPLE_USERS.map(u => ({ ...u }))
    })
  })

  it('marks the user as active by userId', async () => {
    adminApi.reactivateUser.mockResolvedValue({})

    await getState().reactivateUser(3) // carol is inactive

    expect(getState().users.find(u => u.userId === 3).active).toBe(true)
  })

  it('marks the user as active by id (alternate key)', async () => {
    useAdminStore.setState({
      users: [{ id: 55, username: 'eve', active: false }]
    })
    adminApi.reactivateUser.mockResolvedValue({})

    await getState().reactivateUser(55)

    expect(getState().users.find(u => u.id === 55).active).toBe(true)
  })

  it('does not affect other users', async () => {
    adminApi.reactivateUser.mockResolvedValue({})

    await getState().reactivateUser(3)

    expect(getState().users.find(u => u.userId === 1).active).toBe(true)
  })

  it('sets loading=false after success', async () => {
    adminApi.reactivateUser.mockResolvedValue({})

    await getState().reactivateUser(3)

    expect(getState().loading).toBe(false)
  })

  it('sets error and rethrows on failure', async () => {
    adminApi.reactivateUser.mockRejectedValue(new Error('Reactivate failed'))

    await expect(getState().reactivateUser(3)).rejects.toThrow('Reactivate failed')
    expect(getState().error).toBe('Reactivate failed')
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// deleteUser
// ═══════════════════════════════════════════════════════════════════════════════

describe('deleteUser', () => {
  beforeEach(() => {
    useAdminStore.setState({ users: SAMPLE_USERS.map(u => ({ ...u })) })
  })

  it('removes the user from the users array by userId', async () => {
    adminApi.deleteUser.mockResolvedValue({})

    await getState().deleteUser(2)

    expect(getState().users.find(u => u.userId === 2)).toBeUndefined()
    expect(getState().users).toHaveLength(2)
  })

  it('removes the user by id (alternate key)', async () => {
    useAdminStore.setState({
      users: [{ id: 77, username: 'frank' }, { id: 88, username: 'grace' }]
    })
    adminApi.deleteUser.mockResolvedValue({})

    await getState().deleteUser(77)

    expect(getState().users.find(u => u.id === 77)).toBeUndefined()
    expect(getState().users).toHaveLength(1)
  })

  it('does not remove other users', async () => {
    adminApi.deleteUser.mockResolvedValue({})

    await getState().deleteUser(2)

    expect(getState().users.map(u => u.userId)).toContain(1)
    expect(getState().users.map(u => u.userId)).toContain(3)
  })

  it('sets loading=false after success', async () => {
    adminApi.deleteUser.mockResolvedValue({})

    await getState().deleteUser(1)

    expect(getState().loading).toBe(false)
  })

  it('sets error and rethrows on failure', async () => {
    adminApi.deleteUser.mockRejectedValue(new Error('Delete failed'))

    await expect(getState().deleteUser(1)).rejects.toThrow('Delete failed')
    expect(getState().error).toBe('Delete failed')
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// fetchAuditLogs
// ═══════════════════════════════════════════════════════════════════════════════

describe('fetchAuditLogs', () => {
  const paginatedResponse = {
    content: [{ id: 1, action: 'LOGIN' }, { id: 2, action: 'SUSPEND' }],
    number: 0,
    totalPages: 3,
    totalElements: 25,
  }

  it('sets auditLogs from paginated response (data.content)', async () => {
    adminApi.getAuditLogs.mockResolvedValue(paginatedResponse)

    await getState().fetchAuditLogs(0)

    expect(getState().auditLogs).toEqual(paginatedResponse.content)
  })

  it('sets auditPage metadata from paginated response', async () => {
    adminApi.getAuditLogs.mockResolvedValue(paginatedResponse)

    await getState().fetchAuditLogs(0)

    expect(getState().auditPage).toEqual({
      number: 0,
      totalPages: 3,
      totalElements: 25,
    })
  })

  it('handles a plain array response (no .content wrapper)', async () => {
    const plainArray = [{ id: 1 }, { id: 2 }, { id: 3 }]
    adminApi.getAuditLogs.mockResolvedValue(plainArray)

    await getState().fetchAuditLogs(1)

    expect(getState().auditLogs).toEqual(plainArray)
  })

  it('uses fallback pagination for plain array response', async () => {
    adminApi.getAuditLogs.mockResolvedValue([{ id: 1 }])

    await getState().fetchAuditLogs(2)

    expect(getState().auditPage.number).toBe(2)
    expect(getState().auditPage.totalPages).toBe(1)
    expect(getState().auditPage.totalElements).toBe(0)
  })

  it('defaults to page 0 when no argument is provided', async () => {
    adminApi.getAuditLogs.mockResolvedValue([])

    await getState().fetchAuditLogs()

    expect(adminApi.getAuditLogs).toHaveBeenCalledWith(0)
  })

  it('sets loading=false after success', async () => {
    adminApi.getAuditLogs.mockResolvedValue([])

    await getState().fetchAuditLogs()

    expect(getState().loading).toBe(false)
  })

  it('sets error on failure', async () => {
    adminApi.getAuditLogs.mockRejectedValue(new Error('Audit fetch error'))

    await getState().fetchAuditLogs()

    expect(getState().error).toBe('Audit fetch error')
    expect(getState().loading).toBe(false)
  })

  it('handles null/undefined response gracefully', async () => {
    adminApi.getAuditLogs.mockResolvedValue(null)

    await getState().fetchAuditLogs()

    expect(getState().auditLogs).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// changeRole
// ═══════════════════════════════════════════════════════════════════════════════

describe('changeRole', () => {
  beforeEach(() => {
    useAdminStore.setState({ users: SAMPLE_USERS.map(u => ({ ...u })) })
  })

  it('updates the user role in the users array', async () => {
    adminApi.changeRole.mockResolvedValue({ role: 'ADMIN' })

    await getState().changeRole(1, 'ADMIN')

    expect(getState().users.find(u => u.userId === 1).role).toBe('ADMIN')
  })

  it('updates by id (alternate key)', async () => {
    useAdminStore.setState({
      users: [{ id: 50, username: 'henry', role: 'USER' }]
    })
    adminApi.changeRole.mockResolvedValue({ role: 'MODERATOR' })

    await getState().changeRole(50, 'MODERATOR')

    expect(getState().users.find(u => u.id === 50).role).toBe('MODERATOR')
  })

  it('does not affect other users', async () => {
    adminApi.changeRole.mockResolvedValue({ role: 'ADMIN' })

    await getState().changeRole(1, 'ADMIN')

    expect(getState().users.find(u => u.userId === 2).role).toBe('USER')
  })

  it('sets loading=false after success', async () => {
    adminApi.changeRole.mockResolvedValue({ role: 'ADMIN' })

    await getState().changeRole(1, 'ADMIN')

    expect(getState().loading).toBe(false)
  })

  it('sets error and rethrows on failure', async () => {
    adminApi.changeRole.mockRejectedValue(new Error('Role change failed'))

    await expect(getState().changeRole(1, 'ADMIN')).rejects.toThrow('Role change failed')
    expect(getState().error).toBe('Role change failed')
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// fetchOnlineCount
// ═══════════════════════════════════════════════════════════════════════════════

describe('fetchOnlineCount', () => {
  it('sets onlineCount when API returns a number', async () => {
    adminApi.getOnlineCount.mockResolvedValue(42)

    await getState().fetchOnlineCount()

    expect(getState().onlineCount).toBe(42)
  })

  it('sets onlineCount to null when API returns a non-number', async () => {
    adminApi.getOnlineCount.mockResolvedValue('invalid')

    await getState().fetchOnlineCount()

    expect(getState().onlineCount).toBeNull()
  })

  it('leaves onlineCount as null and does NOT throw on error', async () => {
    adminApi.getOnlineCount.mockRejectedValue(new Error('Service unavailable'))

    await expect(getState().fetchOnlineCount()).resolves.not.toThrow()
    expect(getState().onlineCount).toBeNull()
  })

  it('sets onlineCount to 0 when API returns 0', async () => {
    adminApi.getOnlineCount.mockResolvedValue(0)

    await getState().fetchOnlineCount()

    expect(getState().onlineCount).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// filteredUsers
// ═══════════════════════════════════════════════════════════════════════════════

describe('filteredUsers', () => {
  beforeEach(() => {
    useAdminStore.setState({ users: SAMPLE_USERS.map(u => ({ ...u })), searchQuery: '' })
  })

  it('returns all users when searchQuery is empty', () => {
    expect(getState().filteredUsers()).toHaveLength(3)
  })

  it('filters by username (case-insensitive)', () => {
    getState().setSearchQuery('alice')
    expect(getState().filteredUsers()).toHaveLength(1)
    expect(getState().filteredUsers()[0].username).toBe('alice')
  })

  it('filters by email', () => {
    getState().setSearchQuery('bob@test.com')
    const result = getState().filteredUsers()
    expect(result).toHaveLength(1)
    expect(result[0].username).toBe('bob')
  })

  it('filters by phoneNumber', () => {
    getState().setSearchQuery('3333')
    const result = getState().filteredUsers()
    expect(result).toHaveLength(1)
    expect(result[0].username).toBe('carol')
  })

  it('filters by fullName', () => {
    getState().setSearchQuery('jones')
    const result = getState().filteredUsers()
    expect(result).toHaveLength(1)
    expect(result[0].username).toBe('bob')
  })

  it('is case-insensitive for all fields', () => {
    getState().setSearchQuery('ALICE')
    expect(getState().filteredUsers()).toHaveLength(1)
  })

  it('returns multiple matches when query matches several users', () => {
    getState().setSearchQuery('test.com')
    // alice@test.com and bob@test.com both match
    expect(getState().filteredUsers()).toHaveLength(2)
  })

  it('returns empty array when no users match', () => {
    getState().setSearchQuery('zzznomatch')
    expect(getState().filteredUsers()).toHaveLength(0)
  })

  it('handles missing fields gracefully (no throw)', () => {
    useAdminStore.setState({
      users: [{ userId: 99 }], // no username/email/phoneNumber/fullName
      searchQuery: ''
    })
    expect(() => getState().filteredUsers()).not.toThrow()
  })

  it('handles partial match at start of field value', () => {
    getState().setSearchQuery('ali')
    expect(getState().filteredUsers()?.find(u => u.username === 'alice')).toBeDefined()
  })

  it('matches by domain in email', () => {
    getState().setSearchQuery('org.com')
    const result = getState().filteredUsers()
    expect(result).toHaveLength(1)
    expect(result[0].username).toBe('carol')
  })
})
