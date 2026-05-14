import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Zap, X, Check, Loader2, CreditCard, ShieldCheck, Crown } from 'lucide-react'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import './UpgradeModal.css'

const PLANS = [
  {
    id: 'PREMIUM',
    name: 'Premium',
    price: '₹100',
    period: '/month',
    badge: null,
    color: '#7C3AED',
    features: [
      '10 messages/min',
      '4 GB media storage',
      '10 group chats',
      '10 media uploads/min',
      '90-day message history',
      'Priority support',
    ],
  },
  {
    id: 'PLATINUM',
    name: 'Platinum',
    price: '₹149',
    period: '/month',
    badge: 'POPULAR',
    color: '#D97706',
    features: [
      '25 messages/min',
      '8 GB media storage',
      '25 group chats',
      '25 media uploads/min',
      '90-day message history',
      'Priority support',
    ],
  },
]

export default function UpgradeModal({ isOpen, onClose, message }) {
  const { user } = useAuthStore()
  const {
    initiateCheckout, loading, error, subscription, fetchSubscription, upgradeModalPlan,
  } = usePaymentStore()

  const [selectedPlan, setSelectedPlan] = useState('PLATINUM')

  /* Sync the selected plan card whenever the modal is opened with a specific plan */
  useEffect(() => {
    if (isOpen && upgradeModalPlan) setSelectedPlan(upgradeModalPlan)
  }, [isOpen, upgradeModalPlan])
  const [step, setStep] = useState('idle')
  const [localError, setLocalError] = useState(null)
  const [activating, setActivating] = useState(true)
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

  // Poll fetchSubscription after payment until backend confirms paid plan
  useEffect(() => {
    if (step !== 'success') return
    setActivating(true)
    let attempts = 0
    const maxAttempts = 10

    const check = async () => {
      await fetchSubscription()
      attempts++
      const sub = usePaymentStore.getState().subscription
      const isPaidNow = sub?.plan !== 'FREE' && (sub?.status || '').toUpperCase() !== 'EXPIRED'
      if (isPaidNow || attempts >= maxAttempts) {
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
    const planName = subscription?.plan === 'PLATINUM' ? 'Platinum' : 'Premium'
    return createPortal(
      <div className="upgrade-overlay" onClick={onClose}>
        <div role="dialog" className="upgrade-card" onClick={e => e.stopPropagation()}>
          <button className="upgrade-close" onClick={onClose}><X size={18}/></button>
          <div className={`upgrade-pro-badge ${subscription?.plan === 'PLATINUM' ? 'platinum' : ''}`}>
            {subscription?.plan === 'PLATINUM' ? <Crown size={20}/> : <Zap size={20}/>} {planName}
          </div>
          <h2 className="upgrade-title">You're on {planName}! 🎉</h2>
          <p className="upgrade-sub">Enjoy higher limits, expanded storage, and more groups.</p>
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
                : `Welcome to ConnectHub ${activePlan.name}! 🎉`}
            </p>

            {activating ? (
              <div className="upgrade-activating-pill">
                <Loader2 size={13} className="spin"/>
                <span>Setting up your account</span>
              </div>
            ) : (
              <button className="upgrade-btn upgrade-done-btn" onClick={onClose}>
                <Zap size={15}/> Start using {activePlan.name}
              </button>
            )}
          </div>
        ) : (
          /* Default / idle / error state */
          <>
            <button className="upgrade-close" onClick={onClose}><X size={18}/></button>

            <div className="upgrade-hero">
              <h2 className="upgrade-title">Choose Your Plan</h2>
              {message && <p className="upgrade-reason">{message}</p>}
              <p className="upgrade-subtitle">Unlock premium features and higher limits</p>
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
                    {plan.id === 'PLATINUM' ? <Crown size={20}/> : <Zap size={20}/>}
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
              className={`upgrade-btn ${selectedPlan === 'PLATINUM' ? 'platinum' : ''}`}
              onClick={handleUpgrade}
              disabled={step === 'processing' || loading}
            >
              {(step === 'processing' || loading)
                ? <><Loader2 size={16} className="spin"/> Processing…</>
                : <>{selectedPlan === 'PLATINUM' ? <Crown size={15}/> : <Zap size={15}/>} Unlock {activePlan.name} · {activePlan.price}/mo</>
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
