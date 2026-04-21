/*
 * paymentApi.js — Payment & Subscription API Service
 *
 * Purpose:
 *   Handles all communication with the payment-service backend for managing
 *   user subscriptions via the Razorpay payment gateway.
 *
 * How subscriptions work in ConnectHub:
 *   There are two tiers: FREE and PRO.
 *   - FREE users: limited messages per hour, smaller file upload limit.
 *   - PRO users: higher limits, unlocked after a successful Razorpay subscription.
 *
 *   The subscription flow works as follows:
 *   1. The frontend calls createSubscription() to ask the backend to create a
 *      Razorpay subscription object. The backend returns a razorpaySubId.
 *   2. The frontend opens the Razorpay checkout widget using that ID.
 *   3. After payment, Razorpay sends a webhook to the backend (payment-service),
 *      which upgrades the user's subscriptionTier to PRO in the database.
 *   4. The frontend calls getSubscriptionStatus() to confirm the upgrade and
 *      update the user object stored in localStorage/authStore.
 *
 * This service follows the same pattern as adminApi.js — a minimal req() helper
 * that attaches the JWT token. Kept separate from the main api.js to isolate
 * all payment-related calls in one place for clarity.
 */
const API = '/api/v1'

class PaymentApiService {
  /*
   * req(method, path, body) — internal authenticated HTTP helper.
   * Reads the JWT from localStorage and attaches it as Authorization: Bearer.
   * Attaches a numeric status to errors so UpgradeModal and BillingPage can
   * distinguish between different failure types (e.g., 409 = already subscribed).
   */
  async req(method, path, body) {
    const token = localStorage.getItem('accessToken')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = 'Bearer ' + token

    const config = { method, headers }
    if (body) config.body = JSON.stringify(body)

    const res = await fetch(API + path, config)
    if (res.status === 204) return null
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
    if (!res.ok) {
      const msg = data?.message || data?.error || 'Payment request failed'
      const err = new Error(msg)
      err.status = res.status
      throw err
    }
    return data
  }

  /*
   * createSubscription(planId, totalCount) — initiates the PRO subscription process.
   *
   * Sends a request to the payment-service to create (or return an existing) Razorpay
   * subscription. The backend registers the plan with Razorpay's API and returns the
   * subscription details including the razorpaySubId needed to open the payment widget.
   *
   * planId     — the Razorpay plan ID for the PRO tier (configured on the backend).
   * totalCount — number of billing cycles (default 12 = 1 year of monthly payments).
   *
   * Returns: { id, userId, plan, status, razorpaySubId, startDate }
   */
  createSubscription(planId, totalCount = 12) {
    return this.req('POST', '/payments/subscription/create', { planId, totalCount })
  }

  /*
   * getSubscriptionStatus() — fetches the current subscription state for the logged-in user.
   *
   * Called after the Razorpay payment flow completes to check if the backend has processed
   * the webhook and upgraded the user. Also used by BillingPage to show the current plan,
   * billing dates, and renewal status.
   *
   * Returns the subscription object with status (ACTIVE, CANCELLED, EXPIRED, etc.).
   */
  getSubscriptionStatus() {
    return this.req('GET', '/payments/subscription/status')
  }

  /*
   * getPaymentHistory() — fetches all past payment transactions for the logged-in user.
   *
   * Returns a list of payment records (amount, date, status, Razorpay payment ID) so the
   * user can see their billing history on the BillingPage.
   */
  getPaymentHistory() {
    return this.req('GET', '/payments/subscription/payments')
  }
}

export const paymentApi = new PaymentApiService()
