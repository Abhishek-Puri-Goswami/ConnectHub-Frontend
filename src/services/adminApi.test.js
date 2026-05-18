import { adminApi } from './adminApi'

const mockResponse = (data, status = 200) => ({
  ok: status < 400,
  status,
  headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
  json: () => Promise.resolve(data),
})

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

describe('AdminApiService.req()', () => {
  it('attaches Authorization header when token is in localStorage', async () => {
    localStorage.setItem('accessToken', 'test-token-123')
    fetch.mockResolvedValueOnce(mockResponse({ success: true }))

    await adminApi.req('GET', '/auth/admin/users')

    const [, config] = fetch.mock.calls[0]
    expect(config.headers['Authorization']).toBe('Bearer test-token-123')
  })

  it('omits Authorization header when no token in localStorage', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ success: true }))

    await adminApi.req('GET', '/auth/admin/users')

    const [, config] = fetch.mock.calls[0]
    expect(config.headers['Authorization']).toBeUndefined()
  })

  it('sets Content-Type: application/json header', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ success: true }))

    await adminApi.req('GET', '/auth/admin/users')

    const [, config] = fetch.mock.calls[0]
    expect(config.headers['Content-Type']).toBe('application/json')
  })

  it('sends JSON-serialized body when body is provided', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ success: true }))

    await adminApi.req('PUT', '/auth/admin/users/1/role', { role: 'ADMIN' })

    const [, config] = fetch.mock.calls[0]
    expect(config.body).toBe(JSON.stringify({ role: 'ADMIN' }))
  })

  it('does not set body when no body provided', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ success: true }))

    await adminApi.req('GET', '/auth/admin/users')

    const [, config] = fetch.mock.calls[0]
    expect(config.body).toBeUndefined()
  })

  it('returns null for 204 No Content responses', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null) })

    const result = await adminApi.req('DELETE', '/auth/admin/users/1')

    expect(result).toBeNull()
  })

  it('parses and returns JSON on a successful response', async () => {
    const payload = { id: 1, name: 'Alice' }
    fetch.mockResolvedValueOnce(mockResponse(payload))

    const result = await adminApi.req('GET', '/auth/admin/users')

    expect(result).toEqual(payload)
  })

  it('returns null when response has no JSON content-type', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    })

    const result = await adminApi.req('GET', '/auth/admin/users')

    expect(result).toBeNull()
  })

  it('throws Error with status and data.message on HTTP error', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ message: 'User not found' }, 404))

    await expect(adminApi.req('GET', '/auth/admin/users/999')).rejects.toMatchObject({
      message: 'User not found',
      status: 404,
    })
  })

  it('throws Error with data.error when data.message is absent', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Forbidden' }, 403))

    await expect(adminApi.req('GET', '/auth/admin/users')).rejects.toMatchObject({
      message: 'Forbidden',
      status: 403,
    })
  })

  it('throws Error with fallback message when neither data.message nor data.error exist', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}, 500))

    await expect(adminApi.req('GET', '/auth/admin/users')).rejects.toMatchObject({
      message: 'Admin request failed',
      status: 500,
    })
  })

  it('throws Error with fallback message when error response has no JSON', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    })

    await expect(adminApi.req('GET', '/auth/admin/users')).rejects.toMatchObject({
      message: 'Admin request failed',
      status: 500,
    })
  })

  it('calls fetch with the correct URL prefix /api/v1', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}))

    await adminApi.req('GET', '/auth/admin/users')

    const [url] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/users')
  })
})

describe('AdminApiService.getAllUsers()', () => {
  it('calls GET /api/v1/auth/admin/users', async () => {
    fetch.mockResolvedValueOnce(mockResponse([]))

    await adminApi.getAllUsers()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/users')
    expect(config.method).toBe('GET')
  })
})

describe('AdminApiService.suspendUser()', () => {
  it('calls PUT /api/v1/auth/admin/users/:id/suspend', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ suspended: true }))

    await adminApi.suspendUser(42)

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/users/42/suspend')
    expect(config.method).toBe('PUT')
  })
})

describe('AdminApiService.reactivateUser()', () => {
  it('calls PUT /api/v1/auth/admin/users/:id/reactivate', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ active: true }))

    await adminApi.reactivateUser(7)

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/users/7/reactivate')
    expect(config.method).toBe('PUT')
  })
})

describe('AdminApiService.deleteUser()', () => {
  it('calls DELETE /api/v1/auth/admin/users/:id', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null) })

    const result = await adminApi.deleteUser(99)

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/users/99')
    expect(config.method).toBe('DELETE')
    expect(result).toBeNull()
  })
})

describe('AdminApiService.changeRole()', () => {
  it('calls PUT /api/v1/auth/admin/users/:id/role with role in body', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ role: 'ADMIN' }))

    await adminApi.changeRole(5, 'ADMIN')

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/users/5/role')
    expect(config.method).toBe('PUT')
    expect(JSON.parse(config.body)).toEqual({ role: 'ADMIN' })
  })
})

describe('AdminApiService.getAuditLogs()', () => {
  it('calls GET /api/v1/auth/admin/audit with default page=0 and size=50', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ content: [] }))

    await adminApi.getAuditLogs()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/audit?page=0&size=50')
    expect(config.method).toBe('GET')
  })

  it('calls GET /api/v1/auth/admin/audit with specified page', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ content: [] }))

    await adminApi.getAuditLogs(3)

    const [url] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/auth/admin/audit?page=3&size=50')
  })
})

describe('AdminApiService.getOnlineCount()', () => {
  it('calls GET /api/v1/presence/online/count', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ count: 12 }))

    await adminApi.getOnlineCount()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toBe('/api/v1/presence/online/count')
    expect(config.method).toBe('GET')
  })
})
