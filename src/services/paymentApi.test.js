import { paymentApi } from './paymentApi'

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

describe('PaymentApiService.req()', () => {
  it('attaches Authorization header when token is in localStorage', async () => {
    localStorage.setItem('accessToken', 'payment-token-abc')
    fetch.mockResolvedValueOnce(mockResponse({ config: {} }))

    await paymentApi.req('GET', '/payments/subscription/config')

    const [, config] = fetch.mock.calls[0]
    expect(config.headers['Authorization']).toBe('Bearer payment-token-abc')
  })

  it('omits Authorization header when no token in localStorage', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ config: {} }))

    await paymentApi.req('GET', '/payments/subscription/config')

    const [, config] = fetch.mock.calls[0]
    expect(config.headers['Authorization']).toBeUndefined()
  })

  it('sets Content-Type: application/json header', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}))

    await paymentApi.req('GET', '/payments/subscription/config')

    const [, config] = fetch.mock.calls[0]
    expect(config.headers['Content-Type']).toBe('application/json')
  })

  it('sends JSON-serialized body when body is provided', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ subscriptionId: 'sub_123' }))

    await paymentApi.req('POST', '/payments/subscription/create', { plan: 'PREMIUM' })

    const [, config] = fetch.mock.calls[0]
    expect(config.body).toBe(JSON.stringify({ plan: 'PREMIUM' }))
  })

  it('does not set body when no body provided', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}))

    await paymentApi.req('GET', '/payments/subscription/status')

    const [, config] = fetch.mock.calls[0]
    expect(config.body).toBeUndefined()
  })

  it('returns null for 204 No Content responses', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => null }, json: () => Promise.resolve(null) })

    const result = await paymentApi.req('POST', '/payments/subscription/cancel')

    expect(result).toBeNull()
  })

  it('parses and returns JSON on a successful response', async () => {
    const payload = { plan: 'PREMIUM', active: true }
    fetch.mockResolvedValueOnce(mockResponse(payload))

    const result = await paymentApi.req('GET', '/payments/subscription/status')

    expect(result).toEqual(payload)
  })

  it('returns null when response has no JSON content-type', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    })

    const result = await paymentApi.req('GET', '/payments/subscription/status')

    expect(result).toBeNull()
  })

  it('throws Error with status and data.message on HTTP error', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ message: 'Subscription not found' }, 404))

    await expect(paymentApi.req('GET', '/payments/subscription/status')).rejects.toMatchObject({
      message: 'Subscription not found',
      status: 404,
    })
  })

  it('throws Error with data.error when data.message is absent', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ error: 'Unauthorized' }, 401))

    await expect(paymentApi.req('GET', '/payments/subscription/status')).rejects.toMatchObject({
      message: 'Unauthorized',
      status: 401,
    })
  })

  it('throws Error with fallback message when neither data.message nor data.error exist', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}, 500))

    await expect(paymentApi.req('GET', '/payments/subscription/status')).rejects.toMatchObject({
      message: 'Payment request failed',
      status: 500,
    })
  })

  it('throws Error with fallback message when error response has no JSON', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: () => Promise.resolve(null),
    })

    await expect(paymentApi.req('POST', '/payments/subscription/create', { plan: 'PREMIUM' })).rejects.toMatchObject({
      message: 'Payment request failed',
      status: 503,
    })
  })

  it('calls fetch with a URL containing the path /payments/subscription/config', async () => {
    fetch.mockResolvedValueOnce(mockResponse({}))

    await paymentApi.req('GET', '/payments/subscription/config')

    const [url] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/config')
  })
})

describe('PaymentApiService.getConfig()', () => {
  it('calls GET /payments/subscription/config', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ key: 'rzp_test_key' }))

    await paymentApi.getConfig()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/config')
    expect(config.method).toBe('GET')
  })
})

describe('PaymentApiService.createSubscription()', () => {
  it('calls POST /payments/subscription/create with default plan PREMIUM', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ subscriptionId: 'sub_abc' }))

    await paymentApi.createSubscription()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/create')
    expect(config.method).toBe('POST')
    expect(JSON.parse(config.body)).toEqual({ plan: 'PREMIUM' })
  })

  it('calls POST with the specified plan when provided', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ subscriptionId: 'sub_plat' }))

    await paymentApi.createSubscription('PLATINUM')

    const [url, config] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/create')
    expect(JSON.parse(config.body)).toEqual({ plan: 'PLATINUM' })
  })
})

describe('PaymentApiService.cancelSubscription()', () => {
  it('calls POST /payments/subscription/cancel', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ cancelled: true }))

    await paymentApi.cancelSubscription()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/cancel')
    expect(config.method).toBe('POST')
  })
})

describe('PaymentApiService.getSubscriptionStatus()', () => {
  it('calls GET /payments/subscription/status', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ plan: 'FREE' }))

    await paymentApi.getSubscriptionStatus()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/status')
    expect(config.method).toBe('GET')
  })

  it('propagates 404 error for FREE tier users (no subscription record)', async () => {
    fetch.mockResolvedValueOnce(mockResponse({ message: 'No subscription found' }, 404))

    await expect(paymentApi.getSubscriptionStatus()).rejects.toMatchObject({
      status: 404,
      message: 'No subscription found',
    })
  })
})

describe('PaymentApiService.getPaymentHistory()', () => {
  it('calls GET /payments/subscription/payments', async () => {
    fetch.mockResolvedValueOnce(mockResponse([{ id: 'pay_1', amount: 999 }]))

    await paymentApi.getPaymentHistory()

    const [url, config] = fetch.mock.calls[0]
    expect(url).toContain('/payments/subscription/payments')
    expect(config.method).toBe('GET')
  })
})
