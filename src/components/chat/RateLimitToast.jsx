/*
 * RateLimitToast.jsx — Rate Limit Notification Toast
 *
 * Purpose:
 *   A non-blocking notification system that shows toast alerts when the user hits
 *   a rate limit. Rendered once in ChatLayout and listens to two types of events:
 *
 *   1. "guestLimitExceeded" (CustomEvent) — dispatched by websocket.js when the
 *      WebSocket server rejects a message frame with reason LIMIT_EXCEEDED.
 *      Indicates the user has hit the message rate limit for their tier.
 *
 *   2. "rateLimitHit" (CustomEvent) — dispatched by patchFetchFor429 (global fetch patch)
 *      or useRateLimit hook when any REST API call returns HTTP 429.
 *      Includes an action label (messages, uploads, otp, global) from the backend header.
 *
 * Toast behavior:
 *   - Shown at bottom-right as a slide-in card.
 *   - Auto-dismisses after 6 seconds (progress bar drains to indicate time remaining).
 *   - Debounced: the same action type can only trigger a new toast every 10 seconds,
 *     preventing spam when many requests are rejected in quick succession.
 *   - Up to 3 toasts visible at once; oldest are removed when the limit is exceeded.
 *   - Each toast includes an "Upgrade to PRO" button that opens the UpgradeModal,
 *     giving the user an immediate path to increase their rate limits.
 *
 * Sub-component:
 *   RateLimitToastItem — renders a single toast with its countdown progress bar.
 *   Uses a 50ms interval to update the progress percentage from 100% to 0%.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { AlertTriangle, Zap, X } from 'lucide-react'
import { usePaymentStore } from '../../store/paymentStore'
import UpgradeModal from './UpgradeModal'
import './RateLimitToast.css'

const TOAST_DURATION_MS = 6000
const DEBOUNCE_MS = 10_000

/*
 * Human-readable labels for each rate-limited action bucket.
 * These correspond to the X-RateLimit-Action header values set by RateLimitFilter.
 */
const ACTION_LABELS = {
  messages: 'message',
  uploads: 'file upload',
  otp: 'OTP request',
  global: 'request',
}

export default function RateLimitToast() {
  const [toasts, setToasts] = useState([])
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [upgradeMsg, setUpgradeMsg] = useState('')
  const lastFired = useRef({})

  /*
   * addToast — creates a new toast entry with deduplication via debounce.
   * Uses a per-action key so messaging rate limits don't suppress upload rate limits.
   * Keeps the toasts array at max 3 by slicing off the oldest entries.
   */
  const addToast = useCallback((action, limit, message) => {
    const now = Date.now()
    const key = action || 'global'
    if (lastFired.current[key] && now - lastFired.current[key] < DEBOUNCE_MS) return
    lastFired.current[key] = now

    const id = now + Math.random()
    setToasts(prev => [...prev.slice(-2), { id, action, limit, message }])

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  /*
   * Listen for WebSocket rate limit events.
   * The "guestLimitExceeded" event is fired by websocket.js when the backend
   * sends an error frame with reason LIMIT_EXCEEDED on the personal error queue.
   */
  useEffect(() => {
    const handler = (e) => {
      const { action, limit, reason } = e.detail || {}
      const msg = reason === 'LIMIT_EXCEEDED'
        ? `You're sending messages too fast.`
        : `${ACTION_LABELS[action] || 'Your request'} was rate-limited.`
      addToast(action || 'messages', limit, msg)
    }
    window.addEventListener('guestLimitExceeded', handler)
    return () => window.removeEventListener('guestLimitExceeded', handler)
  }, [addToast])

  /*
   * Listen for REST API 429 events.
   * The "rateLimitHit" event is fired by patchFetchFor429() (global) and
   * useRateLimit() (component-level) whenever a 429 response is received.
   */
  useEffect(() => {
    const handler = (e) => {
      const { action, limit } = e.detail || {}
      addToast(action || 'global', limit, `Too many ${ACTION_LABELS[action] || 'requests'}. Please slow down.`)
    }
    window.addEventListener('rateLimitHit', handler)
    return () => window.removeEventListener('rateLimitHit', handler)
  }, [addToast])

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  /* Opens the UpgradeModal with the toast's message as context for the user */
  const handleUpgrade = (message) => {
    setUpgradeMsg(message)
    setUpgradeOpen(true)
  }

  return (
    <>
      <div className="rate-toast-stack" role="region" aria-label="Rate limit notifications">
        {toasts.map(toast => (
          <RateLimitToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
            onUpgrade={() => handleUpgrade(toast.message)}
          />
        ))}
      </div>

      <UpgradeModal
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        message={upgradeMsg}
      />
    </>
  )
}

/*
 * RateLimitToastItem — a single toast card with countdown progress bar.
 *
 * Renders the alert icon, message text, "Upgrade to PRO" button, and a dismiss button.
 * The progress bar drains from 100% to 0% over TOAST_DURATION_MS using a 50ms interval,
 * giving the user a visual countdown so they know when the toast will disappear.
 *
 * Props:
 *   toast     — { id, action, limit, message }
 *   onDismiss — called when the X button is clicked
 *   onUpgrade — called when "Upgrade to PRO" is clicked
 */
function RateLimitToastItem({ toast, onDismiss, onUpgrade }) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / TOAST_DURATION_MS) * 100)
      setProgress(remaining)
      if (remaining === 0) clearInterval(interval)
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const actionLabel = ACTION_LABELS[toast.action] || 'request'

  return (
    <div className="rate-toast slide-in" role="alert">
      <div className="rate-toast-body">
        <div className="rate-toast-icon">
          <AlertTriangle size={16} />
        </div>
        <div className="rate-toast-content">
          <div className="rate-toast-title">
            Rate limit reached
            {/* Shows the backend-reported limit number, e.g. "60/message/min" */}
            {toast.limit && (
              <span className="rate-toast-badge">
                {toast.limit}/{actionLabel}/min
              </span>
            )}
          </div>
          <div className="rate-toast-msg">{toast.message}</div>
        </div>
        <button className="rate-toast-close" onClick={onDismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      {/* Upgrade CTA — opens UpgradeModal to let the user subscribe to PRO */}
      <button className="rate-toast-upgrade" onClick={onUpgrade}>
        <Zap size={12} /> Upgrade to PRO for higher limits
      </button>
      {/* Countdown progress bar */}
      <div className="rate-toast-progress">
        <div className="rate-toast-progress-bar" style={{ width: progress + '%' }} />
      </div>
    </div>
  )
}
