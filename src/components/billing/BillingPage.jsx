/*
 * BillingPage.jsx — Subscription & Payment History Page
 *
 * Purpose:
 *   A dedicated full-page view (accessed via /billing route) that shows the user
 *   their current subscription plan, a plan comparison widget, subscription details,
 *   and a full table of past payments. It also lets FREE users upgrade by opening
 *   the UpgradeModal via the paymentStore.
 *
 * Plan tiers: FREE | PREMIUM (₹100) | PLATINUM (₹149)
 *
 * Layout (2-col on wide screens):
 *   Left   — active plan card + plan comparison row
 *   Right  — subscription detail cards + payment history table
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import UpgradeModal from '../chat/UpgradeModal'
import {
  CreditCard, ArrowLeft, Zap, Check, Loader2,
  Receipt, Calendar, Clock, Star, Shield, Package, Crown, XCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import './BillingPage.css'

/* ─── Plan tier definitions ─────────────────────────────────── */
const TIERS = [
  {
    key: 'FREE',
    label: 'Free',
    price: '₹0',
    period: 'forever',
    icon: <Package size={14} />,
    features: ['5 messages/min', '100 MB storage', '5 group chats'],
  },
  {
    key: 'PREMIUM',
    label: 'Premium',
    price: '₹100',
    period: '/month',
    icon: <Zap size={14} />,
    features: ['10 messages/min', '4 GB storage', '10 group chats', '90-day history'],
  },
  {
    key: 'PLATINUM',
    label: 'Platinum',
    price: '₹149',
    period: '/month',
    icon: <Crown size={14} />,
    features: ['25 messages/min', '8 GB storage', '25 group chats', '90-day history'],
  },
]

/* Feature tag variants for the active plan card */
const FREE_FEATURES    = [
  { label: '5 messages/min', variant: '' },
  { label: '100MB media storage', variant: 'secondary' },
  { label: 'Up to 5 group chats', variant: 'accent' },
]
const PREMIUM_FEATURES = [
  { label: '10 messages/min', variant: '' },
  { label: '4GB media storage', variant: 'secondary' },
  { label: '10 group chats', variant: 'accent' },
  { label: '10 media uploads/min', variant: 'secondary' },
  { label: '90-day message history', variant: '' },
  { label: 'Priority support', variant: '' },
]
const PLATINUM_FEATURES = [
  { label: '25 messages/min', variant: '' },
  { label: '8GB media storage', variant: 'secondary' },
  { label: '25 group chats', variant: 'accent' },
  { label: '25 media uploads/min', variant: 'secondary' },
  { label: '90-day message history', variant: '' },
  { label: 'Priority support', variant: '' },
]

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
  const plan         = subscription?.plan || 'FREE'
  const status       = (subscription?.status || 'ACTIVE').toUpperCase()
  const isCancelled  = status === 'CANCELLED'
  const isHalted     = status === 'HALTED'
  const isPlatinum   = plan === 'PLATINUM'
  const isPremium    = plan === 'PREMIUM'
  const isRecurring  = !!subscription?.razorpaySubscriptionId

  const planDisplayName = isPlatinum ? 'Platinum' : isPremium ? 'Premium' : 'Free Plan'
  const planPrice       = isPlatinum ? '₹149' : isPremium ? '₹100' : '₹0'
  const features        = isPlatinum ? PLATINUM_FEATURES : isPremium ? PREMIUM_FEATURES : FREE_FEATURES

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

      {/* ── Two-column body ─────────────────────────────────────── */}
      <div className="billing-body">

        {/* LEFT column — plan info */}
        <div className="billing-left">

          {/* Active plan card */}
          <div className={`billing-plan-card ${isPlatinum ? 'platinum' : isProUser ? 'pro' : ''}`}>
            <div className="billing-plan-card-top">
              {/* Left: name + price stacked */}
              <div className="billing-plan-card-left">
                <div className="billing-plan-name">
                  {isPlatinum ? <Crown size={16}/> : isProUser ? <Zap size={16}/> : <Package size={16}/>}
                  {planDisplayName}
                  {/* Only show plan tier badge for actually paid plans */}
                  {(isPremium || isPlatinum) && (
                    <span className={`billing-plan-badge ${isPlatinum ? 'platinum' : 'pro'}`}>
                      {isPlatinum ? 'Platinum' : 'Premium'}
                    </span>
                  )}
                  {/* Status badge only makes sense when on a paid plan */}
                  {(isPremium || isPlatinum) && (
                    <span className={`billing-plan-badge ${status === 'ACTIVE' ? 'active' : status === 'CANCELLED' ? 'cancelled' : status === 'HALTED' ? 'halted' : 'pending-badge'}`}>
                      {status === 'ACTIVE' ? 'Active' : status === 'CANCELLED' ? 'Cancelled' : status === 'HALTED' ? 'Payment failed' : status}
                    </span>
                  )}
                </div>
                <div className="billing-plan-price">
                  <strong>{planPrice}</strong>
                  {isProUser
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

              {/* Right: upgrade / resubscribe button */}
              <div className="billing-plan-actions">
                {!isProUser && (
                  <button className="billing-upgrade-btn" onClick={() => openUpgradeModal('PLATINUM')}>
                    <Zap size={14}/> Upgrade Plan
                  </button>
                )}
                {isCancelled && (
                  <button className="billing-upgrade-btn" onClick={() => openUpgradeModal(plan)}>
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

            {/* Cancel / confirm actions (separate row, below features) */}
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

          {/* ── Plan comparison row ──────────────────────────────── */}
          <div className="billing-tiers">
            {TIERS.map(tier => {
              const isActive = plan === tier.key
              return (
                <div key={tier.key} className={`billing-tier-card ${isActive ? 'active' : ''} ${tier.key.toLowerCase()}`}>
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
                  {/* Only show the upgrade CTA for paid tiers the user isn't already on */}
                  {!isActive && tier.key !== 'FREE' && (
                    <button
                      className={`billing-tier-btn ${tier.key.toLowerCase()}`}
                      onClick={() => openUpgradeModal(tier.key)}
                    >
                      Get {tier.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT column — subscription details + payment history */}
        <div className="billing-right">

          {/* Subscription detail cards — only for paid users */}
          {isProUser && subscription && (
            <div className="billing-details-grid">
              <div className="billing-detail-card">
                <div className="billing-detail-label">Subscription ID</div>
                <div className="billing-detail-value mono">
                  {subscription.razorpaySubscriptionId || subscription.razorpayOrderId || subscription.id || '—'}
                </div>
              </div>
              <div className="billing-detail-card">
                <div className="billing-detail-label"><Calendar size={11} style={{ display:'inline', verticalAlign:'-1px' }}/> Start Date</div>
                <div className="billing-detail-value">
                  {subscription.startDate ? format(new Date(subscription.startDate), 'MMM d, yyyy') : '—'}
                </div>
              </div>
              <div className="billing-detail-card">
                <div className="billing-detail-label"><Clock size={11} style={{ display:'inline', verticalAlign:'-1px' }}/> {isCancelled ? 'Access Until' : 'Next Billing'}</div>
                <div className="billing-detail-value">
                  {subscription.endDate ? format(new Date(subscription.endDate), 'MMM d, yyyy') : '—'}
                </div>
              </div>
              <div className="billing-detail-card">
                <div className="billing-detail-label"><Shield size={11} style={{ display:'inline', verticalAlign:'-1px' }}/> Status</div>
                <div className="billing-detail-value">{subscription.status || 'ACTIVE'}</div>
              </div>
            </div>
          )}

          {/* Payment history */}
          <div className="billing-section-title">
            <Receipt size={15}/> Transaction History
          </div>

          {loading && payments.length === 0 ? (
            <div className="billing-empty-inline">
              <Loader2 size={16} className="spin"/>
              <span>Loading payment history…</span>
            </div>
          ) : payments.length === 0 ? (
            <div className="billing-empty-inline">
              <Receipt size={15} style={{ opacity: 0.4 }}/>
              <span>No transactions yet
                {!isProUser && <> — <button onClick={openUpgradeModal} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--primary)', fontWeight:600, fontSize:'inherit', padding:0 }}>upgrade</button> to start your billing history</>}
              </span>
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
                  {payments.map((p, i) => (
                    <tr key={p.id || i}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {p.createdAt ? format(new Date(p.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td>{p.description || 'ConnectHub Upgrade'}</td>
                      <td style={{ fontWeight: 700 }}>
                        {p.currency === 'INR' ? '₹' : (p.currency || '₹')}{(p.amount || 0) / 100}
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
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
