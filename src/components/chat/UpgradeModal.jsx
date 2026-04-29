import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Zap, X, Check, Loader2, CreditCard, ShieldCheck } from 'lucide-react'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import './UpgradeModal.css'

const PREMIUM_FEATURES = [
  { label: '30 messages/min (5× free limit)' },
  { label: '10 GB media storage' },
  { label: 'Unlimited group chats' },
  { label: '30 media uploads/min' },
  { label: 'Message history forever' },
  { label: 'Priority support' },
]

export default function UpgradeModal({ isOpen, onClose, message }) {
  const { user } = useAuthStore()
  const {
    initiateCheckout, loading, error, subscription, fetchSubscription,
  } = usePaymentStore()

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

  // Poll fetchSubscription after payment until backend confirms Premium
  useEffect(() => {
    if (step !== 'success') return
    setActivating(true)
    let attempts = 0
    const maxAttempts = 10

    const check = async () => {
      await fetchSubscription()
      attempts++
      const sub = usePaymentStore.getState().subscription
      const isPremiumNow = sub?.plan !== 'FREE' && (sub?.status || '').toUpperCase() !== 'EXPIRED'
      if (isPremiumNow || attempts >= maxAttempts) {
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
  const hasProSubscription = userRole === 'ADMIN' || userRole === 'PLATFORM_ADMIN'
    || (subscriptionStatus === 'ACTIVE' && subscription?.plan !== 'FREE')

  // Already-Premium view (but not during success animation)
  if (hasProSubscription && step !== 'success') {
    return createPortal(
      <div className="upgrade-overlay" onClick={onClose}>
        <div className="upgrade-card" onClick={e => e.stopPropagation()}>
          <button className="upgrade-close" onClick={onClose}><X size={18}/></button>
          <div className="upgrade-pro-badge"><Zap size={20}/> Premium</div>
          <h2 className="upgrade-title">You're already on Premium! 🎉</h2>
          <p className="upgrade-sub">Enjoy higher limits, 10GB storage, and unlimited groups.</p>
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

  return createPortal(
    <div className="upgrade-overlay" onClick={step === 'success' ? undefined : onClose}>
      <div className="upgrade-card" onClick={e => e.stopPropagation()}>

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
                ? 'Activating your Premium plan…'
                : 'Welcome to ConnectHub Premium! 🎉'}
            </p>

            {activating ? (
              <div className="upgrade-activating-pill">
                <Loader2 size={13} className="spin"/>
                <span>Setting up your account</span>
              </div>
            ) : (
              <button className="upgrade-btn upgrade-done-btn" onClick={onClose}>
                <Zap size={15}/> Start using Premium
              </button>
            )}
          </div>
        ) : (
          /* Default / idle / error state */
          <>
            <button className="upgrade-close" onClick={onClose}><X size={18}/></button>

            <div className="upgrade-hero">
              <div className="upgrade-icon-wrap">
                <Zap size={28} className="upgrade-icon"/>
              </div>
              <h2 className="upgrade-title">Upgrade to ConnectHub Premium</h2>
              {message && <p className="upgrade-reason">{message}</p>}
              <p className="upgrade-price">
                <span className="upgrade-amount">₹99</span>
                <span className="upgrade-period">one-time</span>
              </p>
            </div>

            <ul className="upgrade-features">
              {PREMIUM_FEATURES.map(f => (
                <li key={f.label}>
                  <Check size={14} className="upgrade-check"/>
                  {f.label}
                </li>
              ))}
            </ul>

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
                : <><CreditCard size={16}/> Pay ₹99 with Razorpay</>
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
