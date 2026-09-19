/*
 * BillingPage.jsx — Subscription & Payment History Page
 *
 * Purpose:
 *   A dedicated full-page view (accessed via /billing route) that shows the user
 *   their current subscription plan, a plan comparison widget, subscription details,
 *   and a full table of past payments. It also lets FREE users upgrade by opening
 *   the UpgradeModal via the paymentStore.
 *
 * Plans: Free and Pro (₹100/month). The backend still reports PREMIUM / PLATINUM for paid users
 * (billing history, admin-granted roles); both have the same limits, shown here as "Pro".
 * Limits come from utils/plans.js, which mirrors what the backend enforces.
 *
 * Layout:
 *   Top 2-col — Left: active plan card + plan comparison row
 *               Right: subscription detail cards
 *   Full-width — Transaction history table
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import UpgradeModal from '../chat/UpgradeModal'
import {
  CreditCard, ArrowLeft, Zap, Check, Loader2,
  Receipt, Calendar, Clock, Star, Shield, Package, XCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { PRO_PLAN, featureList, isPaidPlan } from '../../utils/plans'
import './BillingPage.css'

/* ─── Plan definitions (limits: utils/plans.js) ─────────────── */
const TIERS = [
  {
    key: 'FREE',
    css: 'free',
    label: 'Free',
    price: '₹0',
    period: 'forever',
    icon: <Package size={14} />,
    features: featureList('FREE'),
  },
  {
    key: 'PRO',
    css: 'premium',
    label: PRO_PLAN.name,
    price: PRO_PLAN.price,
    period: PRO_PLAN.period,
    icon: <Zap size={14} />,
    features: featureList('PRO'),
  },
]

/* Feature tag variants for the active plan card */
const VARIANTS = ['', 'secondary', 'accent', 'secondary', '', '']
const tagsFor = (tier) => featureList(tier).map((label, i) => ({ label, variant: VARIANTS[i] || '' }))
const FREE_FEATURES = tagsFor('FREE')
const PRO_FEATURES  = tagsFor('PRO')

export default function BillingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    subscription, payments, loading,
    fetchSubscription, fetchPaymentHistory,
    openUpgradeModal, closeUpgradeModal, upgradeModalOpen, isPro, cancelSubscription,
  } = usePaymentStore()

  const [cancelling, setCancelling]             = useState(false)
  const [cancelError, setCancelError]           = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    fetchSubscription()
    fetchPaymentHistory()
  }, [])

  const isProUser    = isPro()
  const userRole     = (user?.role || '').toUpperCase()

  // PLATFORM_ADMIN / ADMIN always have the paid limits, free of charge. Everyone else: the subscription record
  // (PREMIUM / PLATINUM / legacy PRO are all the paid plan; only FREE is not).
  const isStaff      = userRole === 'PLATFORM_ADMIN' || userRole === 'ADMIN'
  const plan         = isStaff ? 'PRO' : (isPaidPlan(subscription?.plan) ? 'PRO' : 'FREE')
  const status       = isStaff ? 'ACTIVE' : (subscription?.status || 'ACTIVE').toUpperCase()
  const isCancelled  = status === 'CANCELLED'
  const isHalted     = status === 'HALTED'
  const isPaid       = plan === 'PRO'
  const isRecurring  = !!(subscription?.razorpaySubscriptionId || subscription?.razorpayOrderId)

  const planDisplayName = isPaid ? PRO_PLAN.name : 'Free Plan'
  // Show what this user actually pays (a legacy Platinum subscriber still pays ₹149)
  const planPrice       = isStaff
    ? '₹0'
    : isPaid
      ? ((subscription?.plan || '').toUpperCase() === 'PLATINUM' ? '₹149' : PRO_PLAN.price)
      : '₹0'
  const features        = isPaid ? PRO_FEATURES : FREE_FEATURES

  const handleCancel = async () => {
    setCancelling(true); setCancelError(null)
    try {
      await cancelSubscription()
      setShowCancelConfirm(false)
    } catch (e) { setCancelError(e.message) }
    finally { setCancelling(false) }
  }

  return (
    <div className="billing-page">
      <UpgradeModal isOpen={upgradeModalOpen} onClose={closeUpgradeModal} />

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="billing-header">
        <div className="billing-header-left">
          <div className="billing-header-icon"><CreditCard size={22} /></div>
          <div className="billing-header-text">
            <h1>Plans &amp; Billing</h1>
            <p>Your subscription plan and billing records</p>
          </div>
        </div>
        <button className="billing-back-btn" onClick={() => navigate('/chat')}>
          <ArrowLeft size={13} /> Back to Chat
        </button>
      </div>

      {/* ── Two-column top section: plan info + subscription details ── */}
      <div className="billing-body">

        {/* LEFT column — active plan + tier comparison */}
        <div className="billing-left">

          {/* Active plan card */}
          <div className={`billing-plan-card ${isPaid ? 'pro' : ''}`}>
            <div className="billing-plan-card-top">
              <div className="billing-plan-card-left">
                <div className="billing-plan-name">
                  {isPaid ? <Zap size={16}/> : <Package size={16}/>}
                  {planDisplayName}
                  <span className="billing-plan-badge current-badge">Current</span>
                  {isPaid && (
                    <span className={`billing-plan-badge ${status === 'ACTIVE' ? 'active' : status === 'CANCELLED' ? 'cancelled' : status === 'HALTED' ? 'halted' : 'pending-badge'}`}>
                      {status === 'ACTIVE' ? 'Active' : status === 'CANCELLED' ? 'Cancelled' : status === 'HALTED' ? 'Payment failed' : status}
                    </span>
                  )}
                </div>
                <div className="billing-plan-price">
                  <strong>{planPrice}</strong>
                  {isStaff
                    ? <span className="billing-price-sub"> · complimentary — included with your role</span>
                    : isProUser
                      ? <span className="billing-price-sub">/month · auto-renews</span>
                      : <span className="billing-price-sub">— yours for life, no card needed</span>
                  }
                  {isCancelled && subscription?.endDate && (
                    <span className="billing-plan-note muted">
                      · Access until {format(new Date(subscription.endDate), 'MMM d, yyyy')}
                    </span>
                  )}
                  {isHalted && (
                    <span className="billing-plan-note danger">
                      · Payment failed — update payment method in Razorpay
                    </span>
                  )}
                </div>
              </div>

              <div className="billing-plan-actions">
                {!isProUser && (
                  <button className="billing-upgrade-btn" onClick={() => openUpgradeModal(PRO_PLAN.checkoutPlan)}>
                    <Zap size={14}/> Upgrade Plan
                  </button>
                )}
                {isCancelled && (
                  <button className="billing-upgrade-btn" onClick={() => openUpgradeModal(PRO_PLAN.checkoutPlan)}>
                    <Zap size={14}/> Resubscribe
                  </button>
                )}
              </div>
            </div>

            {/* Feature tags */}
            <div className="billing-plan-features">
              {features.map(f => (
                <span key={f.label} className={`billing-feature-tag ${f.variant}`}>
                  <Check size={9}/> {f.label}
                </span>
              ))}
            </div>

            {/* Cancel / confirm */}
            <div className="billing-plan-actions">
              {isProUser && isRecurring && !isCancelled && (
                !showCancelConfirm ? (
                  <button
                    className="btn btn-ghost billing-cancel-btn"
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    <XCircle size={13}/> Cancel subscription
                  </button>
                ) : (
                  <div className="billing-cancel-confirm">
                    <p>
                      You'll keep access until <strong>
                        {subscription?.endDate ? format(new Date(subscription.endDate), 'MMM d, yyyy') : 'end of billing period'}
                      </strong>. Cancel anyway?
                    </p>
                    {cancelError && <span className="billing-plan-note danger">{cancelError}</span>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost billing-cancel-btn danger" onClick={handleCancel} disabled={cancelling}>
                        {cancelling ? <Loader2 size={12} className="spin"/> : <XCircle size={12}/>} Yes, cancel
                      </button>
                      <button className="btn btn-ghost billing-cancel-btn" onClick={() => { setShowCancelConfirm(false); setCancelError(null) }}>
                        Keep subscription
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Plan comparison row */}
          <div className="billing-tiers">
            {TIERS.map(tier => {
              const isActive = plan === tier.key
              return (
                <div key={tier.key} className={`billing-tier-card ${isActive ? 'active' : ''} ${tier.css}`}>
                  <div className="billing-tier-header">
                    <span className="billing-tier-icon">{tier.icon}</span>
                    <span className="billing-tier-name">{tier.label}</span>
                    {isActive && <span className="billing-tier-badge">Current</span>}
                  </div>
                  <div className="billing-tier-price">
                    {tier.price}
                    <span className="billing-tier-period">{tier.period}</span>
                  </div>
                  <ul className="billing-tier-features">
                    {tier.features.map(f => (
                      <li key={f}><Check size={10}/> {f}</li>
                    ))}
                  </ul>
                  {!isActive && tier.key !== 'FREE' && (
                    <button
                      className={`billing-tier-btn ${tier.css}`}
                      onClick={() => openUpgradeModal(PRO_PLAN.checkoutPlan)}
                    >
                      Get {tier.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT column — subscription detail cards */}
        <div className="billing-right">
          <div className="billing-details-grid">
            <div className="billing-detail-card">
              <div className="billing-detail-label">Subscription ID</div>
              <div className="billing-detail-value mono">
                {subscription?.razorpaySubscriptionId || subscription?.razorpayOrderId || subscription?.id || '—'}
              </div>
            </div>
            <div className="billing-detail-card">
              <div className="billing-detail-label">
                <Calendar size={11} style={{ display: 'inline', verticalAlign: '-1px' }}/> Start Date
              </div>
              <div className="billing-detail-value">
                {subscription?.startDate ? format(new Date(subscription.startDate), 'MMM d, yyyy') : '—'}
              </div>
            </div>
            <div className="billing-detail-card">
              <div className="billing-detail-label">
                <Clock size={11} style={{ display: 'inline', verticalAlign: '-1px' }}/> {isCancelled ? 'Access Until' : 'Next Billing'}
              </div>
              <div className="billing-detail-value">
                {subscription?.endDate ? format(new Date(subscription.endDate), 'MMM d, yyyy') : '—'}
              </div>
            </div>
            <div className="billing-detail-card">
              <div className="billing-detail-label">
                <Shield size={11} style={{ display: 'inline', verticalAlign: '-1px' }}/> Status
              </div>
              <div className={`billing-detail-value billing-detail-status ${status.toLowerCase()}`}>
                {subscription?.status || 'ACTIVE'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Full-width Transaction History ───────────────────────── */}
      <div className="billing-history-section">
        <div className="billing-section-title">
          <Receipt size={15}/> Transaction History
        </div>

        {loading && payments.length === 0 ? (
          <div className="billing-empty-inline">
            <Loader2 size={16} className="spin"/>
            <span>Loading payment history…</span>
          </div>
        ) : (
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
                {/* Paid plan activation row — only for paid (Pro) users */}
                {isProUser && (
                  <tr className={`billing-plan-activation-row premium`}>
                    <td>
                      {subscription?.startDate
                        ? format(new Date(subscription.startDate), 'MMM d, yyyy')
                        : '—'}
                    </td>
                    <td>
                      <span className={`billing-desc-plan premium`}>
                        <Zap size={11}/>
                        {planDisplayName}
                      </span>
                    </td>
                    <td><span className="billing-amount-cell">{planPrice}/mo</span></td>
                    <td><span className="billing-payment-status captured">Active</span></td>
                    <td className="billing-txn-id">
                      {subscription?.razorpayOrderId || '—'}
                    </td>
                  </tr>
                )}
                {/* Real payment transactions */}
                {payments.map((p, i) => (
                  <tr key={p.id || i}>
                    <td>{p.createdAt ? format(new Date(p.createdAt), 'MMM d, yyyy') : '—'}</td>
                    <td>{p.description || `${planDisplayName} renewal`}</td>
                    <td>
                      <span className="billing-amount-cell">₹{(p.amount || 0) / 100}</span>
                    </td>
                    <td>
                      <span className={`billing-payment-status ${(p.status || '').toLowerCase()}`}>
                        {p.status || '—'}
                      </span>
                    </td>
                    <td className="billing-txn-id">
                      {p.razorpayPaymentId || p.transactionId || '—'}
                    </td>
                  </tr>
                ))}
                {/* Empty state for free users */}
                {!isProUser && payments.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 14px', fontStyle: 'italic', fontSize: '0.8rem' }}>
                      No transactions yet — upgrade to a paid plan to see billing history.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
