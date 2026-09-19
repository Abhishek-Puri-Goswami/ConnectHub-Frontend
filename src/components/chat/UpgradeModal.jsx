import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Zap, X, Check, Loader2, CreditCard, ShieldCheck } from 'lucide-react'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import { PRO_PLAN, featureList } from '../../utils/plans'
import './UpgradeModal.css'

// One paid plan is sold. Its id is the plan key payment-service expects (Premium, ₹100/month); the limits are the
// ones the backend enforces for every paid subscriber (utils/plans.js).
const PLANS = [
  {
    id: PRO_PLAN.checkoutPlan,
    name: PRO_PLAN.name,
    price: PRO_PLAN.price,
    period: PRO_PLAN.period,
    badge: null,
    color: '#7C3AED',
    features: featureList('PRO'),
  },
]

export default function UpgradeModal({ isOpen, onClose, message }) {
  const { user } = useAuthStore()
  const {
    initiateCheckout, loading, error, subscription, fetchSubscription, upgradeModalPlan,
  } = usePaymentStore()

  const [selectedPlan, setSelectedPlan] = useState(PRO_PLAN.checkoutPlan)

  /* Sync the selected plan card whenever the modal is opened with a specific plan */
  useEffect(() => {
    if (isOpen) setSelectedPlan(PLANS.some(p => p.id === upgradeModalPlan) ? upgradeModalPlan : PRO_PLAN.checkoutPlan)
  }, [isOpen, upgradeModalPlan])
  const [step, setStep] = useState('idle')
  const [localError, setLocalError] = useState(null)
  const [activating, setActivating] = useState(true)
  const [planConfirmed, setPlanConfirmed] = useState(false)
  const pollRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    if (window.Razorpay) return
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) fetchSubscription()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [isOpen])

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // Poll fetchSubscription after payment until backend confirms paid plan (webhook lag)
  useEffect(() => {
    if (step !== 'success') return
    setActivating(true)
    setPlanConfirmed(false)
    let attempts = 0
    const maxAttempts = 12  // 24 seconds max poll window

    const check = async () => {
      await fetchSubscription()
      attempts++
      const sub = usePaymentStore.getState().subscription
      const isPaidNow = sub?.plan && sub.plan !== 'FREE'
        && !['EXPIRED', 'PENDING'].includes((sub?.status || '').toUpperCase())
      if (isPaidNow) {
        setPlanConfirmed(true)
        setActivating(false)
        if (pollRef.current) clearInterval(pollRef.current)
      } else if (attempts >= maxAttempts) {
        // Poll timed out — payment captured but webhook hasn't arrived yet
        setActivating(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }

    check()
    pollRef.current = setInterval(check, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step])

  if (!isOpen) return null

  const subscriptionStatus = (subscription?.status || '').toUpperCase()
  const userRole = (user?.role || '').toUpperCase()
  const hasSubscription = userRole === 'ADMIN' || userRole === 'PLATFORM_ADMIN'
    || (subscriptionStatus === 'ACTIVE' && subscription?.plan !== 'FREE')

  // Already-subscribed view (but not during success animation)
  if (hasSubscription && step !== 'success') {
    const planName = PRO_PLAN.name
    return createPortal(
      <div className="upgrade-overlay" onClick={onClose}>
        <div role="dialog" className="upgrade-card" onClick={e => e.stopPropagation()}>
          <button className="upgrade-close" onClick={onClose}><X size={18}/></button>
          <div className="upgrade-pro-badge">
            <Zap size={20}/> {planName}
          </div>
          <h2 className="upgrade-title">You're on {planName}! 🎉</h2>
          <p className="upgrade-sub">
            {userRole === 'PLATFORM_ADMIN'
              ? 'Platform Admins have Pro access included — no payment needed.'
              : 'Enjoy higher limits, expanded storage, and more groups.'}
          </p>
        </div>
      </div>,
      document.body
    )
  }

  const handleUpgrade = async () => {
    setStep('processing')
    setLocalError(null)
    try {
      await initiateCheckout({
        razorpayKeyId: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
        userEmail: user?.email,
        userName: user?.fullName || user?.username,
        plan: selectedPlan,
      })
      setStep('success')
    } catch (e) {
      if (e.message === 'Payment cancelled') {
        setStep('idle')
      } else {
        setStep('error')
        setLocalError(e.message)
      }
    }
  }

  const activePlan = PLANS.find(p => p.id === selectedPlan) || PLANS[0]

  return createPortal(
    <div className="upgrade-overlay" onClick={step === 'success' ? undefined : onClose}>
      <div className="upgrade-card upgrade-card--wide" onClick={e => e.stopPropagation()}>

        {/* Success state — full-card takeover */}
        {step === 'success' ? (
          <div className="upgrade-success-full">
            <div className="upgrade-success-orb">
              <div className="upgrade-success-ring r1"/>
              <div className="upgrade-success-ring r2"/>
              <div className="upgrade-success-glow"/>
              <ShieldCheck size={34} className="upgrade-success-icon"/>
            </div>

            <h2 className="upgrade-success-title">Payment Successful!</h2>
            <p className="upgrade-success-sub">
              {activating
                ? `Activating your ${activePlan.name} plan…`
                : planConfirmed
                  ? `Welcome to ConnectHub ${activePlan.name}! 🎉`
                  : `Payment confirmed! Your plan is being activated.`}
            </p>

            {activating ? (
              <div className="upgrade-activating-pill">
                <Loader2 size={13} className="spin"/>
                <span>Confirming with payment gateway…</span>
              </div>
            ) : planConfirmed ? (
              <button className="upgrade-btn upgrade-done-btn" onClick={() => { fetchSubscription(); onClose() }}>
                <Zap size={15}/> Start using {activePlan.name}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 280 }}>
                  Your payment was received. Plan activation may take a moment — refresh the page in a few seconds.
                </p>
                <button className="upgrade-btn upgrade-done-btn" onClick={() => { fetchSubscription(); onClose() }}>
                  Done
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Default / idle / error state */
          <>
            <button className="upgrade-close" onClick={onClose}><X size={18}/></button>

            <div className="upgrade-hero">
              <h2 className="upgrade-title">Choose Your Plan</h2>
              {message && <p className="upgrade-reason">{message}</p>}
              <p className="upgrade-subtitle">Higher limits for groups, members and storage</p>
            </div>

            {/* Plan cards */}
            <div className="upgrade-plans">
              {PLANS.map(plan => (
                <button
                  key={plan.id}
                  className={`upgrade-plan-card ${selectedPlan === plan.id ? 'selected' : ''} ${plan.id.toLowerCase()}`}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {plan.badge && <span className="upgrade-plan-badge">{plan.badge}</span>}
                  <div className="upgrade-plan-header">
                    <Zap size={20}/>
                    <span className="upgrade-plan-name">{plan.name}</span>
                  </div>
                  <div className="upgrade-plan-price">
                    <span className="upgrade-plan-amount">{plan.price}</span>
                    <span className="upgrade-plan-period">{plan.period}</span>
                  </div>
                  <ul className="upgrade-plan-features">
                    {plan.features.map(f => (
                      <li key={f}><Check size={12}/> {f}</li>
                    ))}
                  </ul>
                  {selectedPlan === plan.id && (
                    <div className="upgrade-plan-selected-indicator">
                      <Check size={14}/> Selected
                    </div>
                  )}
                </button>
              ))}
            </div>

            {(localError || error) && (
              <div className="upgrade-error">⚠ {localError || error}</div>
            )}

            <button
              className="upgrade-btn"
              onClick={handleUpgrade}
              disabled={step === 'processing' || loading}
            >
              {(step === 'processing' || loading)
                ? <><Loader2 size={16} className="spin"/> Processing…</>
                : <><Zap size={15}/> Unlock {activePlan.name} · {activePlan.price}/mo</>
              }
            </button>

            <p className="upgrade-secure">
              <ShieldCheck size={12}/> Secured by Razorpay
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
