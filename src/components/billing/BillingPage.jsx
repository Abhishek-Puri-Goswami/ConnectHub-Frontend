/*
 * BillingPage.jsx — Subscription & Payment History Page
 *
 * Purpose:
 *   A dedicated full-page view (accessed via /billing route) that shows the user
 *   their current subscription plan, subscription details, and a full table of
 *   past payments. It also lets FREE users upgrade to PRO by opening the
 *   UpgradeModal via the paymentStore.
 *
 * Data loading:
 *   On mount, two API calls are made in parallel:
 *     - fetchSubscription() — loads the current plan, status, and dates
 *     - fetchPaymentHistory() — loads the list of past payment records
 *   Both are stored in paymentStore so the UpgradeModal can also read them.
 *
 * Plan card:
 *   The top card shows the current plan name (FREE or PRO) with a badge.
 *   For PRO users, the card gets a special "pro" CSS class for a highlighted border.
 *   For FREE users, an "Upgrade to PRO" button opens the UpgradeModal.
 *   PRO_FEATURES and FREE_FEATURES are hardcoded feature lists shown as
 *   colored tags so users can compare what they currently have.
 *
 * Subscription details grid (PRO only):
 *   Four small detail cards show: Subscription ID (Razorpay sub ID for support),
 *   Start Date, Plan name, and Status. These are only rendered for PRO users
 *   because FREE plans don't have a Razorpay subscription record.
 *
 * Payment history table:
 *   Fetched from the backend's payment-service. Each row shows:
 *   - Date (formatted with date-fns)
 *   - Description (e.g., "ConnectHub PRO subscription")
 *   - Amount (stored in paise on backend, divided by 100 for display in rupees)
 *   - Status badge (CAPTURED = success, FAILED = error, etc.)
 *   - Transaction ID (Razorpay payment ID, displayed in monospace for readability)
 *
 * Amount conversion:
 *   Razorpay stores amounts in the smallest currency unit (paise for INR).
 *   So ₹199 is stored as 19900. We divide by 100 before displaying.
 *
 * isPro() vs plan field:
 *   isPro() from the store returns false for CANCELLED/EXPIRED subscriptions even
 *   if plan is "PRO". We use isPro() for the upgrade button and card style
 *   but show the raw plan/status for informational display.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import {
  CreditCard, ArrowLeft, Zap, Check, Loader2,
  Receipt, Calendar, Clock, Star, Shield, Package
} from 'lucide-react'
import { format } from 'date-fns'
import './BillingPage.css'

/*
 * FREE_FEATURES / PRO_FEATURES — feature lists shown inside the plan card.
 * Each entry has a label (what the feature is) and a variant (which color CSS
 * class to apply to the tag: '' = primary, 'secondary', 'accent').
 */
const FREE_FEATURES = [
  { label: '5 messages/min', variant: '' },
  { label: '100MB media storage', variant: 'secondary' },
  { label: 'Up to 5 group chats', variant: 'accent' },
]

const PREMIUM_FEATURES = [
  { label: '30 messages/min', variant: '' },
  { label: '10GB media storage', variant: 'secondary' },
  { label: 'Unlimited groups', variant: 'accent' },
  { label: '30 media uploads/min', variant: 'secondary' },
  { label: 'Priority support', variant: '' },
]

export default function BillingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    subscription, payments, loading,
    fetchSubscription, fetchPaymentHistory,
    openUpgradeModal, isPro,
  } = usePaymentStore()

  /*
   * Load subscription and payment data on mount.
   * Both calls are independent so they fire concurrently via the store.
   */
  useEffect(() => {
    fetchSubscription()
    fetchPaymentHistory()
  }, [])

  /*
   * isProUser — uses isPro() selector which accounts for cancelled/expired status.
   * plan and status are the raw values from the subscription record for display.
   */
  const isProUser = isPro()
  const plan = subscription?.plan || 'FREE'
  const status = subscription?.status || 'ACTIVE'

  return (
    <div className="billing-page">
      {/* Page header with title and Back to Chat navigation */}
      <div className="billing-header">
        <div className="billing-header-left">
          <div className="billing-header-icon">
            <CreditCard size={24} />
          </div>
          <div>
            <h1>Billing & Subscription</h1>
            <p>Manage your plan and view payment history</p>
          </div>
        </div>
        <button className="admin-back-btn" onClick={() => navigate('/chat')}>
          <ArrowLeft size={15} /> Back to Chat
        </button>
      </div>

      {/* Current plan card — highlighted with "pro" class for PRO users */}
      <div className={`billing-plan-card ${isProUser ? 'pro' : ''}`}>
        <div className="billing-plan-info">
          <div className="billing-plan-name">
            {isProUser ? <><Zap size={20} /> ConnectHub Premium</> : <><Package size={20} /> Free Plan</>}
            <span className={`billing-plan-badge ${isProUser ? 'pro' : 'free'}`}>
              {plan}
            </span>
            <span className={`billing-plan-badge active`}>
              {status}
            </span>
          </div>
          <div className="billing-plan-price">
            {isProUser
              ? <><strong>₹99</strong> one-time</>
              : <><strong>₹0</strong> — Free forever</>
            }
          </div>
          {/* Feature tags — shows Premium or FREE features depending on current plan */}
          <div className="billing-plan-features">
            {(isProUser ? PREMIUM_FEATURES : FREE_FEATURES).map(f => (
              <span key={f.label} className={`billing-feature-tag ${f.variant}`}>
                <Check size={10} /> {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Upgrade button only shown for FREE users */}
        {!isProUser && (
          <button className="billing-upgrade-btn" onClick={openUpgradeModal}>
            <Zap size={16} /> Upgrade to PRO
          </button>
        )}
      </div>

      {/* Subscription detail cards — shown only for active PRO users */}
      {isProUser && subscription && (
        <div className="billing-details-grid">
          <div className="billing-detail-card">
            <div className="billing-detail-label">Order ID</div>
            <div className="billing-detail-value" style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
              {subscription.razorpayOrderId || subscription.id || '—'}
            </div>
          </div>
          <div className="billing-detail-card">
            <div className="billing-detail-label"><Calendar size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Start Date</div>
            <div className="billing-detail-value">
              {subscription.startDate ? format(new Date(subscription.startDate), 'MMM d, yyyy') : '—'}
            </div>
          </div>
          <div className="billing-detail-card">
            <div className="billing-detail-label"><Star size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Plan</div>
            <div className="billing-detail-value">{subscription.plan || 'PRO'}</div>
          </div>
          <div className="billing-detail-card">
            <div className="billing-detail-label"><Shield size={12} style={{ display: 'inline', verticalAlign: '-1px' }} /> Status</div>
            <div className="billing-detail-value">{subscription.status || 'ACTIVE'}</div>
          </div>
        </div>
      )}

      {/* Payment history section */}
      <h2 className="billing-section-title">
        <Receipt size={18} /> Payment History
      </h2>

      {/* Loading spinner shown only when we have no data yet */}
      {loading && payments.length === 0 ? (
        <div className="billing-empty">
          <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem' }}>Loading payment history…</p>
        </div>
      ) : payments.length === 0 ? (
        /* Empty state — different message for PRO (no payments yet) vs FREE (prompt to upgrade) */
        <div className="billing-empty">
          <div className="billing-empty-icon"><Receipt size={24} /></div>
          <h3>No payments yet</h3>
          <p>{isProUser ? 'Your payment records will appear here' : 'Upgrade to Premium to start your billing history'}</p>
        </div>
      ) : (
        /*
         * Payment history table — each row is one transaction record from the backend.
         * Amounts are in paise (smallest INR unit), so we divide by 100 to get rupees.
         * The currency field defaults to ₹ if not present or if it's "INR".
         */
        <div className="billing-history-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Transaction ID</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id || i}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Clock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />
                    {p.createdAt ? format(new Date(p.createdAt), 'MMM d, yyyy') : '—'}
                  </td>
                  <td>{p.description || 'ConnectHub PRO'}</td>
                  <td style={{ fontWeight: 700 }}>
                    {p.currency === 'INR' ? '₹' : (p.currency || '₹')}{(p.amount || 0) / 100}
                  </td>
                  <td>
                    <span className={`billing-payment-status ${(p.status || '').toLowerCase()}`}>
                      {p.status || '—'}
                    </span>
                  </td>
                  {/* Razorpay payment ID in monospace — useful for support and refund requests */}
                  <td style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {p.razorpayPaymentId || p.transactionId || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
