/*
 * UpgradeModal.jsx — PRO Subscription Upgrade Modal with Razorpay Checkout
 *
 * Purpose:
 *   A full-screen modal that presents the PRO plan features and pricing,
 *   then initiates the Razorpay subscription checkout flow when the user clicks Pay.
 *
 * When is it shown?
 *   - Rate limit hit: when a "guestLimitExceeded" or "rateLimitHit" event fires,
 *     RateLimitToast shows a toast with an "Upgrade to PRO" button that opens this modal.
 *   - Manual: the Sidebar "Upgrade to PRO" button calls paymentStore.openUpgradeModal().
 *   - Programmatically via paymentStore.openUpgradeModal().
 *
 * PRO features list:
 *   Hardcoded list of what PRO users get: higher message rate, more storage, etc.
 *   Shown as a checklist to make the value proposition clear.
 *
 * Already-PRO state:
 *   If the user opens this modal but is already subscribed (checked via paymentStore),
 *   a simplified "You're already on PRO!" card is shown instead of the upgrade form.
 *
 * Razorpay integration flow:
 *   1. When modal opens: dynamically loads the Razorpay checkout.js SDK script
 *      (if not already loaded) so it's ready when the user clicks Pay.
 *   2. On "Pay ₹199" click: handleUpgrade() calls paymentStore.initiateCheckout()
 *      which creates a Razorpay subscription on the backend, opens the payment widget,
 *      and returns a Promise.
 *   3. On payment success: shows a "Payment successful! Activating..." banner and
 *      polls subscription status once more after 3 seconds to confirm upgrade.
 *   4. On cancellation (user closes Razorpay widget): returns to idle state silently.
 *   5. On payment error: shows an error message in the modal.
 *
 * Scroll lock:
 *   While the modal is open, document.body overflow is set to hidden to prevent
 *   the background from scrolling. Restored on modal close via useEffect cleanup.
 *
 * Props:
 *   isOpen  — boolean controlling modal visibility (controlled by parent)
 *   onClose — callback to close the modal
 *   message — optional context string explaining WHY the upgrade modal opened
 *             (e.g., "You're sending messages too fast" from RateLimitToast)
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Zap, X, Check, Loader2, CreditCard, ShieldCheck } from 'lucide-react'
import { usePaymentStore } from '../../store/paymentStore'
import { useAuthStore } from '../../store/authStore'
import './UpgradeModal.css'

const PRO_FEATURES = [
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

  /*
   * Lazily load the Razorpay checkout.js script when the modal first opens.
   * This avoids loading the third-party script on every page load — it's only
   * needed when the user actually wants to pay.
   */
  useEffect(() => {
    if (!isOpen) return
    if (window.Razorpay) return
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
  }, [isOpen])

  /* Refresh subscription status when the modal opens to show the most current state */
  useEffect(() => {
    if (isOpen) fetchSubscription()
  }, [isOpen])

  /*
   * Prevent background scrolling while the modal is open.
   * Restores the previous overflow value on cleanup.
   */
  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isOpen])

  if (!isOpen) return null

  const subscriptionStatus = (subscription?.status || '').toUpperCase()
  const hasProSubscription = subscription?.plan !== 'FREE' && !['CANCELLED', 'EXPIRED'].includes(subscriptionStatus)

  /*
   * Already-PRO view: shown when the user opens the modal but is already subscribed.
   * The PENDING status message handles the brief window between payment webhook
   * receipt and full activation where the backend has upgraded the user but the
   * client may not yet have the updated JWT.
   */
  if (hasProSubscription) {
    return createPortal(
      <div className="upgrade-overlay" onClick={onClose}>
        <div className="upgrade-card" onClick={e => e.stopPropagation()}>
          <button className="upgrade-close" onClick={onClose}><X size={18}/></button>
          <div className="upgrade-pro-badge"><Zap size={20}/> PRO</div>
          <h2 className="upgrade-title">You're already on PRO! 🎉</h2>
          <p className="upgrade-sub">
            {subscriptionStatus === 'PENDING'
              ? 'Your PRO subscription is being activated. Benefits are already enabled.'
              : 'Enjoy higher limits, 10GB storage, and unlimited groups.'}
          </p>
        </div>
      </div>,
      document.body
    )
  }

  /*
   * handleUpgrade — initiates the Razorpay payment flow.
   * Reads the Razorpay plan ID and key from environment variables (set in .env.local).
   * On success: shows the success banner and re-polls subscription after 3 seconds
   *   to account for the async webhook delay.
   * On payment cancelled (user closed the Razorpay widget): silently resets to idle.
   * On error: shows the error message in the modal.
   */
  const handleUpgrade = async () => {
    setStep('processing')
    setLocalError(null)
    try {
      await initiateCheckout({
        planId: import.meta.env.VITE_RAZORPAY_PLAN_ID || 'plan_pro',
        razorpayKeyId: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
        userEmail: user?.email,
        userName: user?.fullName || user?.username,
      })
      setStep('success')
      setTimeout(() => fetchSubscription(), 3000)
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
    <div className="upgrade-overlay" onClick={onClose}>
      <div className="upgrade-card" onClick={e => e.stopPropagation()}>
        <button className="upgrade-close" onClick={onClose}><X size={18}/></button>

        {/* Hero section: icon, headline, optional reason message, price */}
        <div className="upgrade-hero">
          <div className="upgrade-icon-wrap">
            <Zap size={28} className="upgrade-icon"/>
          </div>
          <h2 className="upgrade-title">Upgrade to ConnectHub PRO</h2>
          {/* Context message explaining why upgrade was triggered (from rate limit toast) */}
          {message && <p className="upgrade-reason">{message}</p>}
          <p className="upgrade-price">
            <span className="upgrade-amount">₹199</span>
            <span className="upgrade-period">/month</span>
          </p>
        </div>

        {/* Checklist of PRO features */}
        <ul className="upgrade-features">
          {PRO_FEATURES.map(f => (
            <li key={f.label}>
              <Check size={14} className="upgrade-check"/>
              {f.label}
            </li>
          ))}
        </ul>

        {/* Error message from payment failure */}
        {(localError || error) && (
          <div className="upgrade-error">⚠ {localError || error}</div>
        )}

        {/* CTA: either success banner or Pay button */}
        {step === 'success' ? (
          <div className="upgrade-success">
            <ShieldCheck size={22}/>
            <span>Payment successful! Activating your PRO plan…</span>
          </div>
        ) : (
          <button
            className="upgrade-btn"
            onClick={handleUpgrade}
            disabled={step === 'processing' || loading}
          >
            {(step === 'processing' || loading)
              ? <><Loader2 size={16} className="spin"/> Processing…</>
              : <><CreditCard size={16}/> Pay ₹199 with Razorpay</>
            }
          </button>
        )}

        {/* Security assurance text */}
        <p className="upgrade-secure">
          <ShieldCheck size={12}/> Secured by Razorpay · Cancel anytime
        </p>
      </div>
    </div>,
    document.body
  )
}
