/*
 * VerifyEmailPage.jsx — Email OTP Verification after Registration
 *
 * Purpose:
 *   After a user registers (or when their email is found to be unverified during
 *   login), they are redirected here to confirm their email address by entering
 *   a 6-digit OTP that was sent to their inbox.
 *   On successful verification the backend returns JWT tokens, so the user is
 *   immediately logged in and redirected to /chat — no separate login step needed.
 *
 * How it gets the email address:
 *   React Router's useLocation() reads the `state` object that was passed when
 *   navigate('/verify-email', { state: { email } }) was called from RegisterPage
 *   or LoginPage. If no email is in state (direct URL access), the user is
 *   redirected back to /login because we have nothing to verify.
 *
 * Two countdown timers run in parallel:
 *   1. cooldown (60s) — prevents the user from requesting a new OTP too quickly.
 *      The Resend button is hidden while this counts down.
 *   2. expiresIn (300s = 5 min) — counts down to show the OTP expiry time.
 *      Displayed as a MM:SS formatted timer. After 0, the user must request a new code.
 *   Both timers use the same pattern: setInterval that decrements by 1 each second,
 *   with a cleanup in the useEffect return to stop the interval when the component
 *   unmounts or the value reaches 0.
 *
 * Auto-verify on 6th digit:
 *   A useEffect watches the `otp` state. As soon as it reaches 6 characters,
 *   verify() is called automatically so the user doesn't need to click a button.
 *
 * Resend OTP:
 *   resend() calls api.resendOtp(email) and restarts both timers with fresh values.
 *   The backend responds with a cooldownSeconds field, which is used instead of
 *   a hardcoded 60 to respect any server-side cooldown configuration.
 */
import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { ArrowLeft, Loader2, Check, X, Mail, ShieldCheck } from 'lucide-react'
import AuthLayout from './AuthLayout'
import OtpInput from './OtpInput'
import { maskEmail } from '../../utils/validators'
import './AuthStyles.css'

export default function VerifyEmailPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  /*
   * email — read from React Router location state. This avoids putting the
   * email in the URL (which would be visible and bookmarkable) while still
   * sharing it from the previous page.
   */
  const email = location.state?.email || ''

  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /*
   * cooldown — seconds until the user can request a new OTP.
   * Starts at 60 to prevent the first resend from being immediate.
   */
  const [cooldown, setCooldown] = useState(60)
  const [cooldownKey, setCooldownKey] = useState(0)

  /*
   * expiresIn — countdown for OTP expiry (5 minutes = 300 seconds).
   * Purely for UI feedback; the actual expiry is enforced by the backend.
   */
  const [expiresIn, setExpiresIn] = useState(300)

  /* Guard: if no email was passed in state, we can't show this page meaningfully */
  useEffect(() => { if (!email) navigate('/login', { replace: true }) }, [email])

  /*
   * Cooldown timer — single setInterval per lifecycle to avoid recreating on
   * each tick (which breaks Playwright's page.clock.fastForward in tests).
   * cooldownKey increments on resend to restart the interval fresh.
   */
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(id); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [cooldownKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* expiresIn countdown timer — single interval on mount */
  useEffect(() => {
    const id = setInterval(() => {
      setExpiresIn(c => {
        if (c <= 1) { clearInterval(id); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  /*
   * verify — submits the 6-digit OTP to the backend's email verification endpoint.
   * On success, the backend returns { accessToken, refreshToken, user } just like
   * a regular login — so we call setAuth() and navigate to /chat immediately.
   * On failure, the OTP is cleared so the user can re-enter cleanly.
   */
  const verify = async () => {
    if (otp.length !== 6 || loading) return
    setError(''); setLoading(true)
    try {
      const data = await api.verifyOtp({ email, otp })
      setAuth(data.accessToken, data.refreshToken, data.user)
      navigate('/chat', { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid code')
      setOtp('')
    } finally { setLoading(false) }
  }

  /*
   * Auto-verify effect — fires whenever the OTP value changes.
   * When the user types the 6th digit, `otp.length === 6` becomes true and
   * verify() is called automatically so there's no need to click a button.
   */
  useEffect(() => { if (otp.length === 6 && !loading) verify() /* eslint-disable-next-line */ }, [otp])

  /*
   * resend — requests a fresh OTP from the backend.
   * The backend's response may include a cooldownSeconds field that overrides
   * our default 60s cooldown, so we use it if available.
   * expiresIn is reset to the full 5 minutes because a new OTP was just issued.
   */
  const resend = async () => {
    if (cooldown > 0) return
    setError('')
    try {
      const res = await api.resendOtp(email)
      setCooldown(res?.cooldownSeconds || 60)
      setCooldownKey(k => k + 1)
      setExpiresIn(300)
    } catch (err) { setError(err.message || 'Could not resend') }
  }

  if (!email) return null

  return (
    <AuthLayout tagline="Just one more step">
      {/* Back button returns to login without losing state */}
      <button className="auth-back-btn" onClick={() => navigate('/login')}>
        <ArrowLeft size={14}/> Back to sign in
      </button>

      {/* Hero icon and heading */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 'var(--r-xl)',
          background: 'var(--primary-soft)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--clay-shadow)',
          marginBottom: 12,
        }}>
          <Mail size={28}/>
        </div>
        <h2 className="auth-title">Verify your email</h2>
        {/* maskEmail shows a privacy-safe version like "jo***@gmail.com" */}
        <p className="auth-subtitle" style={{ marginBottom: 0 }}>
          We sent a 6-digit code to<br/>
          <strong style={{ color: 'var(--text)' }}>{maskEmail(email)}</strong>
        </p>
      </div>

      {/* 6-box OTP input — auto-focuses the first box, moves focus forward on each digit */}
      <OtpInput value={otp} onChange={setOtp} />

      {/* Live countdown showing how long until the OTP expires (MM:SS format) */}
      {expiresIn > 0 && (
        <div className="otp-timer">
          Expires in <strong>{Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2,'0')}</strong>
        </div>
      )}

      {error && (
        <p className="error-text" style={{ justifyContent: 'center', marginTop: 10 }}>
          <X size={14}/> {error}
        </p>
      )}

      {/* Manual verify button as a fallback (auto-verify fires on 6th digit) */}
      <button
        className="btn btn-primary btn-block"
        onClick={verify}
        disabled={otp.length !== 6}
        style={{ marginTop: 16 }}
      >
        {loading ? <Loader2 size={18} className="spin"/> : <ShieldCheck size={18}/>}
        {loading ? 'Verifying…' : 'Verify email'}
      </button>

      {/* Resend section — shows countdown while cooling down, then a Resend link */}
      <div className="otp-timer" style={{ marginTop: 16 }}>
        {cooldown > 0 ? (
          <>Didn't get it? Resend in <strong>{cooldown}s</strong></>
        ) : (
          <button className="auth-link" onClick={resend}>Resend code</button>
        )}
      </div>
    </AuthLayout>
  )
}
