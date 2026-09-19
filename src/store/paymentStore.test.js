/*
 * paymentStore.test.js — Unit Tests for usePaymentStore (Zustand)
 *
 * Coverage target: 80%+ branch coverage
 *
 * MOCKING STRATEGY:
 *   - paymentApi: mocked to control API responses without HTTP.
 *   - api: mocked to control refreshSession().
 *   - useAuthStore: imported directly so we can assert setState calls.
 *   - localStorage: jsdom provides a real implementation; we clear it in beforeEach.
 *
 * HOW TO RUN:
 *   npm run test:unit
 */

vi.mock('../services/paymentApi.js', () => ({
  paymentApi: {
    getSubscriptionStatus: vi.fn(),
    getPaymentHistory: vi.fn(),
    cancelSubscription: vi.fn(),
    createOrder: vi.fn(),
    createSubscription: vi.fn(),
    getConfig: vi.fn(),
  }
}))

vi.mock('../services/api.js', () => ({
  api: {
    refreshSession: vi.fn(),
  }
}))

// authStore is a real Zustand store — no mock needed, we manipulate state directly.
import { usePaymentStore } from './paymentStore.js'
import { useAuthStore } from './authStore.js'
import { paymentApi } from '../services/paymentApi.js'
import { api } from '../services/api.js'

// ── helpers ──────────────────────────────────────────────────────────────────

const getState = () => usePaymentStore.getState()

const INITIAL_STATE = {
  subscription: null,
  payments: [],
  loading: false,
  error: null,
  upgradeModalOpen: false,
  upgradeModalPlan: 'PREMIUM',
  razorpayReady: false,
}

// ── reset before each test ────────────────────────────────────────────────────

beforeEach(() => {
  usePaymentStore.setState({ ...INITIAL_STATE })
  useAuthStore.setState({ token: null, user: null })
  localStorage.clear()
  vi.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════════════════
// openUpgradeModal / closeUpgradeModal
// ═══════════════════════════════════════════════════════════════════════════════

describe('openUpgradeModal', () => {
  it('sets upgradeModalOpen to true', () => {
    getState().openUpgradeModal()
    expect(getState().upgradeModalOpen).toBe(true)
  })

  it('defaults to the one paid plan (PREMIUM checkout key, shown as Pro) when no plan is specified', () => {
    getState().openUpgradeModal()
    expect(getState().upgradeModalPlan).toBe('PREMIUM')
  })

  it('uses the specified plan when provided', () => {
    getState().openUpgradeModal('PREMIUM')
    expect(getState().upgradeModalPlan).toBe('PREMIUM')
  })

  it('can open with PLATINUM explicitly', () => {
    getState().openUpgradeModal('PLATINUM')
    expect(getState().upgradeModalPlan).toBe('PLATINUM')
  })
})

describe('closeUpgradeModal', () => {
  it('sets upgradeModalOpen to false', () => {
    usePaymentStore.setState({ upgradeModalOpen: true })
    getState().closeUpgradeModal()
    expect(getState().upgradeModalOpen).toBe(false)
  })

  it('is safe to call when modal is already closed', () => {
    expect(() => getState().closeUpgradeModal()).not.toThrow()
    expect(getState().upgradeModalOpen).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// setRazorpayReady
// ═══════════════════════════════════════════════════════════════════════════════

describe('setRazorpayReady', () => {
  it('sets razorpayReady to true', () => {
    getState().setRazorpayReady(true)
    expect(getState().razorpayReady).toBe(true)
  })

  it('sets razorpayReady to false', () => {
    usePaymentStore.setState({ razorpayReady: true })
    getState().setRazorpayReady(false)
    expect(getState().razorpayReady).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// fetchSubscription
// ═══════════════════════════════════════════════════════════════════════════════

describe('fetchSubscription', () => {
  it('sets subscription from successful API response', async () => {
    const sub = { id: 1, plan: 'PREMIUM', status: 'ACTIVE' }
    paymentApi.getSubscriptionStatus.mockResolvedValue(sub)

    await getState().fetchSubscription()

    expect(getState().subscription).toEqual(sub)
    expect(getState().loading).toBe(false)
    expect(getState().error).toBeNull()
  })

  it('sets loading=true during the fetch', async () => {
    let capturedLoading = false
    paymentApi.getSubscriptionStatus.mockImplementation(() => {
      capturedLoading = usePaymentStore.getState().loading
      return Promise.resolve({ plan: 'FREE' })
    })

    await getState().fetchSubscription()

    expect(capturedLoading).toBe(true)
  })

  it('defaults to FREE plan on 404', async () => {
    const err = new Error('Not Found')
    err.status = 404
    paymentApi.getSubscriptionStatus.mockRejectedValue(err)

    await getState().fetchSubscription()

    expect(getState().subscription).toEqual({ plan: 'FREE', status: 'ACTIVE' })
    expect(getState().loading).toBe(false)
    expect(getState().error).toBeNull()
  })

  it('sets error state on non-404 errors', async () => {
    const err = new Error('Server Error')
    err.status = 500
    paymentApi.getSubscriptionStatus.mockRejectedValue(err)

    await getState().fetchSubscription()

    expect(getState().error).toBe('Server Error')
    expect(getState().subscription).toBeNull()
    expect(getState().loading).toBe(false)
  })

  it('sets error for network errors (no status property)', async () => {
    paymentApi.getSubscriptionStatus.mockRejectedValue(new Error('Network failure'))

    await getState().fetchSubscription()

    expect(getState().error).toBe('Network failure')
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// refreshAuthAfterPayment
// ═══════════════════════════════════════════════════════════════════════════════

describe('refreshAuthAfterPayment', () => {
  it('calls api.refreshSession()', async () => {
    api.refreshSession.mockResolvedValue({})
    await getState().refreshAuthAfterPayment()
    expect(api.refreshSession).toHaveBeenCalledOnce()
  })

  it('reads token from localStorage and pushes to authStore', async () => {
    api.refreshSession.mockResolvedValue({})
    localStorage.setItem('accessToken', 'new-token')
    localStorage.setItem('user', JSON.stringify({ userId: 5 }))

    await getState().refreshAuthAfterPayment()

    expect(useAuthStore.getState().token).toBe('new-token')
    expect(useAuthStore.getState().user?.userId).toBe(5)
  })

  it('sets user to null in authStore when localStorage user is missing', async () => {
    api.refreshSession.mockResolvedValue({})
    // No user in localStorage

    await getState().refreshAuthAfterPayment()

    expect(useAuthStore.getState().user).toBeNull()
  })

  it('propagates errors thrown by api.refreshSession()', async () => {
    api.refreshSession.mockRejectedValue(new Error('Refresh failed'))

    await expect(getState().refreshAuthAfterPayment()).rejects.toThrow('Refresh failed')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// fetchPaymentHistory
// ═══════════════════════════════════════════════════════════════════════════════

describe('fetchPaymentHistory', () => {
  it('sets payments array on success', async () => {
    const history = [{ id: 1, amount: 10000 }, { id: 2, amount: 14900 }]
    paymentApi.getPaymentHistory.mockResolvedValue(history)

    await getState().fetchPaymentHistory()

    expect(getState().payments).toEqual(history)
    expect(getState().loading).toBe(false)
  })

  it('defaults to empty array when API returns null', async () => {
    paymentApi.getPaymentHistory.mockResolvedValue(null)

    await getState().fetchPaymentHistory()

    expect(getState().payments).toEqual([])
  })

  it('sets error on failure', async () => {
    paymentApi.getPaymentHistory.mockRejectedValue(new Error('Failed to fetch history'))

    await getState().fetchPaymentHistory()

    expect(getState().error).toBe('Failed to fetch history')
    expect(getState().loading).toBe(false)
  })

  it('sets loading=true during the call', async () => {
    let capturedLoading = false
    paymentApi.getPaymentHistory.mockImplementation(() => {
      capturedLoading = usePaymentStore.getState().loading
      return Promise.resolve([])
    })

    await getState().fetchPaymentHistory()

    expect(capturedLoading).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// cancelSubscription
// ═══════════════════════════════════════════════════════════════════════════════

describe('cancelSubscription', () => {
  it('calls paymentApi.cancelSubscription()', async () => {
    paymentApi.cancelSubscription.mockResolvedValue({})
    paymentApi.getSubscriptionStatus.mockResolvedValue({ plan: 'PREMIUM', status: 'CANCELLED' })

    await getState().cancelSubscription()

    expect(paymentApi.cancelSubscription).toHaveBeenCalledOnce()
  })

  it('calls fetchSubscription after successful cancellation', async () => {
    paymentApi.cancelSubscription.mockResolvedValue({})
    const sub = { plan: 'PREMIUM', status: 'CANCELLED' }
    paymentApi.getSubscriptionStatus.mockResolvedValue(sub)

    await getState().cancelSubscription()

    // fetchSubscription was called, so subscription should be updated
    expect(getState().subscription).toEqual(sub)
  })

  it('sets loading=false after success', async () => {
    paymentApi.cancelSubscription.mockResolvedValue({})
    paymentApi.getSubscriptionStatus.mockResolvedValue({ plan: 'FREE' })

    await getState().cancelSubscription()

    expect(getState().loading).toBe(false)
  })

  it('sets error and rethrows on failure', async () => {
    const err = new Error('Cancel failed')
    paymentApi.cancelSubscription.mockRejectedValue(err)

    await expect(getState().cancelSubscription()).rejects.toThrow('Cancel failed')
    expect(getState().error).toBe('Cancel failed')
    expect(getState().loading).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// isPro
// ═══════════════════════════════════════════════════════════════════════════════

describe('isPro', () => {
  it('returns false when subscription is null', () => {
    usePaymentStore.setState({ subscription: null })
    expect(getState().isPro()).toBe(false)
  })

  it('returns false for FREE plan', () => {
    usePaymentStore.setState({ subscription: { plan: 'FREE', status: 'ACTIVE' } })
    expect(getState().isPro()).toBe(false)
  })

  it('returns true for PREMIUM plan with ACTIVE status', () => {
    usePaymentStore.setState({ subscription: { plan: 'PREMIUM', status: 'ACTIVE' } })
    expect(getState().isPro()).toBe(true)
  })

  it('returns true for PLATINUM plan with ACTIVE status', () => {
    usePaymentStore.setState({ subscription: { plan: 'PLATINUM', status: 'ACTIVE' } })
    expect(getState().isPro()).toBe(true)
  })

  it('returns false for CANCELLED subscription', () => {
    usePaymentStore.setState({ subscription: { plan: 'PREMIUM', status: 'CANCELLED' } })
    expect(getState().isPro()).toBe(false)
  })

  it('returns false for EXPIRED subscription', () => {
    usePaymentStore.setState({ subscription: { plan: 'PREMIUM', status: 'EXPIRED' } })
    expect(getState().isPro()).toBe(false)
  })

  it('returns false for PENDING subscription', () => {
    usePaymentStore.setState({ subscription: { plan: 'PREMIUM', status: 'PENDING' } })
    expect(getState().isPro()).toBe(false)
  })

  it('returns false when endDate is in the past', () => {
    usePaymentStore.setState({
      subscription: { plan: 'PREMIUM', status: 'ACTIVE', endDate: '2020-01-01T00:00:00Z' }
    })
    expect(getState().isPro()).toBe(false)
  })

  it('returns true when endDate is in the future', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    usePaymentStore.setState({
      subscription: { plan: 'PREMIUM', status: 'ACTIVE', endDate: future }
    })
    expect(getState().isPro()).toBe(true)
  })

  it('returns true for ADMIN role regardless of subscription', () => {
    useAuthStore.setState({ user: { role: 'ADMIN' } })
    usePaymentStore.setState({ subscription: null })
    expect(getState().isPro()).toBe(true)
  })

  it('returns true for PLATFORM_ADMIN role regardless of subscription', () => {
    useAuthStore.setState({ user: { role: 'PLATFORM_ADMIN' } })
    usePaymentStore.setState({ subscription: { plan: 'FREE', status: 'ACTIVE' } })
    expect(getState().isPro()).toBe(true)
  })

  it('returns true for lowercase admin role (case-insensitive)', () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    usePaymentStore.setState({ subscription: null })
    expect(getState().isPro()).toBe(true)
  })

  it('returns false for regular USER role with FREE subscription', () => {
    useAuthStore.setState({ user: { role: 'USER' } })
    usePaymentStore.setState({ subscription: { plan: 'FREE', status: 'ACTIVE' } })
    expect(getState().isPro()).toBe(false)
  })

  it('returns false when user is null and subscription is null', () => {
    useAuthStore.setState({ user: null })
    usePaymentStore.setState({ subscription: null })
    expect(getState().isPro()).toBe(false)
  })
})
