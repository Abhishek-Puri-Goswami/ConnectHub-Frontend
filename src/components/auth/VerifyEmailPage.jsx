/*
 * VerifyEmailPage.jsx — Combined Email + Phone OTP Verification after Registration
 *
 * Purpose:
 *   After a user registers they land here to confirm both their email address and
 *   their phone number before being logged in. Two independent OTP sections are
 *   shown side-by-side (or stacked on mobile):
 *
 *   Email section
 *     The OTP was already sent by the backend during registration.
 *     Auto-verify fires as soon as 6 digits are entered.
 *     A 300-second expiry countdown and a 60-second resend cooldown are shown.
 *
 *   Phone section
 *     The OTP must be explicitly requested (SMS is not sent automatically on
 *     registration). A "Send code" button triggers POST /auth/phone/request-otp.
 *     After the code is sent, the 6-digit input appears with its own cooldown.
 *     Auto-verify fires on the 6th digit.
 *
 * Token handling:
 *   Email verification (POST /auth/verify-registration-otp) returns JWT tokens.
 *   We hold those tokens in state without logging in immediately. Once BOTH email
 *   and phone are verified we call setAuth() and navigate to /chat. If the user
 *   provided no phone number during registration, only the email section is shown
 *   and we navigate as soon as email is verified (backward-compatible with the
 *   LoginPage redirect which only passes { email } in state).
 *
 * State received via React Router location.state:
 *   email  — required; if absent, redirect to /login
 *   phone  — optional (full international, e.g. "+919876543210"); omit to skip
 *            the phone section entirely
 *
 * Cooldown timers:
 *   Each section has an independent cooldown key (emailCooldownKey / phoneCooldownKey).
 *   Incrementing the key restarts the corresponding useEffect-based interval from 0.
 */
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import {
  ArrowLeft, Loader2, Check, X, Mail, Phone, ShieldCheck, Send,
} from 'lucide-react'
import AuthLayout from './AuthLayout'
import OtpInput from './OtpInput'
import { maskEmail, maskPhone } from '../../utils/validators'
import './AuthStyles.css'

/* ─── tiny helper: format seconds as M:SS ─────────────────────── */
function fmt(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function VerifyEmailPage() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const setAuth   = useAuthStore(s => s.setAuth)

  /* credentials passed from RegisterPage (or LoginPage for email-only redirects) */
  const email = location.state?.email || ''
  const phone = location.state?.phone || ''      // full intl format, e.g. "+919876543210"
  const hasPhone = Boolean(phone)

  /* Guard: if no email in state, bounce to login */
  useEffect(() => { if (!email) navigate('/login', { replace: true }) }, [email])

  /* ── EMAIL section state ──────────────────────────────────────── */
  const [emailOtp,      setEmailOtp]      = useState('')
  const [emailLoading,  setEmailLoading]  = useState(false)
  const [emailError,    setEmailError]    = useState('')
  const [emailVerified, setEmailVerified] = useState(false)

  const [emailCooldown,    setEmailCooldown]    = useState(
    typeof window !== 'undefined' && window.__TEST_RESEND_COOLDOWN != null
      ? window.__TEST_RESEND_COOLDOWN : 60
  )
  const [emailCooldownKey, setEmailCooldownKey] = useState(0)
  const [emailExpiresIn,   setEmailExpiresIn]   = useState(300)

  /* hold tokens returned by email verification so we can log in after phone too */
  const pendingTokens = useRef(null)

  /* ── PHONE section state ──────────────────────────────────────── */
  const [phoneCodeSent,   setPhoneCodeSent]   = useState(false)
  const [phoneOtp,        setPhoneOtp]        = useState('')
  const [phoneLoading,    setPhoneLoading]    = useState(false)
  const [phoneError,      setPhoneError]      = useState('')
  const [phoneVerified,   setPhoneVerified]   = useState(false)
  const [phoneSending,    setPhoneSending]    = useState(false)

  const [phoneCooldown,    setPhoneCooldown]    = useState(0)
  const [phoneCooldownKey, setPhoneCooldownKey] = useState(0)

  /* ── Timers ───────────────────────────────────────────────────── */

  /* email cooldown */
  useEffect(() => {
    if (emailCooldown <= 0) return
    const id = setInterval(() => {
      setEmailCooldown(c => { if (c <= 1) { clearInterval(id); return 0 } return c - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [emailCooldownKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* email expiry */
  useEffect(() => {
    if (emailVerified) return
    const id = setInterval(() => {
      setEmailExpiresIn(c => { if (c <= 1) { clearInterval(id); return 0 } return c - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [emailVerified])

  /* phone cooldown */
  useEffect(() => {
    if (phoneCooldown <= 0) return
    const id = setInterval(() => {
      setPhoneCooldown(c => { if (c <= 1) { clearInterval(id); return 0 } return c - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [phoneCooldownKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Actions ──────────────────────────────────────────────────── */

  /*
   * finishLogin — called once all required verifications are complete.
   * Uses the tokens captured from email verification to log the user in.
   */
  const finishLogin = (tokens) => {
    setAuth(tokens.accessToken, tokens.refreshToken, tokens.user)
    navigate('/chat', { replace: true })
  }

  /* verifyEmail — submits email OTP; stores tokens for later use */
  const verifyEmail = async () => {
    if (emailOtp.length !== 6 || emailLoading || emailVerified) return
    setEmailError(''); setEmailLoading(true)
    try {
      const data = await api.verifyOtp({ email, otp: emailOtp })
      pendingTokens.current = data
      setEmailVerified(true)
      /* if phone was not required, log in immediately */
      if (!hasPhone || phoneVerified) finishLogin(data)
    } catch (err) {
      setEmailError(err.message || 'Invalid code')
      setEmailOtp('')
    } finally { setEmailLoading(false) }
  }

  /* auto-verify email on 6th digit */
  useEffect(() => { if (emailOtp.length === 6) verifyEmail() }, [emailOtp]) // eslint-disable-line react-hooks/exhaustive-deps

  /* resendEmail — requests a new email OTP */
  const resendEmail = async () => {
    if (emailCooldown > 0) return
    setEmailError('')
    try {
      const res = await api.resendOtp(email)
      setEmailCooldown(res?.cooldownSeconds || 60)
      setEmailCooldownKey(k => k + 1)
      setEmailExpiresIn(300)
    } catch (err) { setEmailError(err.message || 'Could not resend') }
  }

  /* sendPhoneCode — requests the SMS OTP for the first time (or on resend) */
  const sendPhoneCode = async () => {
    if (phoneCooldown > 0 || phoneSending) return
    setPhoneError(''); setPhoneSending(true)
    try {
      const res = await api.requestPhoneOtp(phone)
      setPhoneCodeSent(true)
      setPhoneCooldown(res?.cooldownSeconds || 60)
      setPhoneCooldownKey(k => k + 1)
    } catch (err) { setPhoneError(err.message || 'Could not send SMS') }
    finally { setPhoneSending(false) }
  }

  /* verifyPhone — submits phone OTP */
  const verifyPhone = async () => {
    if (phoneOtp.length !== 6 || phoneLoading || phoneVerified) return
    setPhoneError(''); setPhoneLoading(true)
    try {
      await api.verifyPhoneOtp(phone, phoneOtp)
      setPhoneVerified(true)
      /* if email was already verified, log in now */
      if (emailVerified && pendingTokens.current) finishLogin(pendingTokens.current)
    } catch (err) {
      setPhoneError(err.message || 'Invalid code')
      setPhoneOtp('')
    } finally { setPhoneLoading(false) }
  }

  /* auto-verify phone on 6th digit */
  useEffect(() => { if (phoneOtp.length === 6) verifyPhone() }, [phoneOtp]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!email) return null

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <AuthLayout tagline="Just one more step">
      <button className="auth-back-btn" onClick={() => navigate('/login')}>
        <ArrowLeft size={14}/> Back to sign in
      </button>

      {/* Page heading */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 'var(--r-xl)',
          background: 'var(--primary-soft)', color: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--clay-shadow)', margin: '0 auto 12px',
        }}>
          <ShieldCheck size={28}/>
        </div>
        <h2 className="auth-title">Verify your account</h2>
        <p className="auth-subtitle" style={{ marginBottom: 0 }}>
          {hasPhone
            ? 'Confirm your email and phone to get started'
            : 'Confirm your email address to get started'}
        </p>
      </div>

      {/* ── EMAIL SECTION ────────────────────────────────────────── */}
      <VerifySection
        icon={<Mail size={18}/>}
        label="Email verification"
        verified={emailVerified}
        hint={<>Code sent to <strong style={{ color: 'var(--text)' }}>{maskEmail(email)}</strong></>}
      >
        {!emailVerified ? (
          <>
            <OtpInput value={emailOtp} onChange={setEmailOtp} disabled={emailLoading} />

            {emailExpiresIn > 0 && (
              <div className="otp-timer">
                Expires in <strong>{fmt(emailExpiresIn)}</strong>
              </div>
            )}

            {emailError && (
              <p className="error-text" style={{ justifyContent: 'center', marginTop: 8 }}>
                <X size={14}/> {emailError}
              </p>
            )}

            <button
              className="btn btn-primary btn-block"
              onClick={verifyEmail}
              disabled={emailOtp.length !== 6 || emailLoading}
              style={{ marginTop: 12 }}
            >
              {emailLoading ? <Loader2 size={16} className="spin"/> : <Check size={16}/>}
              {emailLoading ? 'Verifying…' : 'Verify email'}
            </button>

            <div className="otp-timer" style={{ marginTop: 10 }}>
              {emailCooldown > 0
                ? <>Resend in <strong>{emailCooldown}s</strong></>
                : <button className="auth-link" onClick={resendEmail}>Resend code</button>
              }
            </div>
          </>
        ) : (
          <VerifiedBadge label="Email verified" />
        )}
      </VerifySection>

      {/* ── PHONE SECTION (only when phone was provided) ─────────── */}
      {hasPhone && (
        <>
          <div style={{ margin: '20px 0', borderTop: '1px solid var(--border)', opacity: 0.5 }}/>

          <VerifySection
            icon={<Phone size={18}/>}
            label="Phone verification"
            verified={phoneVerified}
            hint={<>Code sent to <strong style={{ color: 'var(--text)' }}>+91 {maskPhone(phone)}</strong></>}
          >
            {!phoneVerified ? (
              <>
                {!phoneCodeSent ? (
                  /* Initial state: show Send Code button */
                  <>
                    {phoneError && (
                      <p className="error-text" style={{ justifyContent: 'center', marginBottom: 10 }}>
                        <X size={14}/> {phoneError}
                      </p>
                    )}
                    <button
                      className="btn btn-primary btn-block"
                      onClick={sendPhoneCode}
                      disabled={phoneSending}
                    >
                      {phoneSending ? <Loader2 size={16} className="spin"/> : <Send size={16}/>}
                      {phoneSending ? 'Sending…' : 'Send code'}
                    </button>
                  </>
                ) : (
                  /* Code sent: show OTP input */
                  <>
                    <OtpInput value={phoneOtp} onChange={setPhoneOtp} disabled={phoneLoading} autoFocus={false} />

                    {phoneError && (
                      <p className="error-text" style={{ justifyContent: 'center', marginTop: 8 }}>
                        <X size={14}/> {phoneError}
                      </p>
                    )}

                    <button
                      className="btn btn-primary btn-block"
                      onClick={verifyPhone}
                      disabled={phoneOtp.length !== 6 || phoneLoading}
                      style={{ marginTop: 12 }}
                    >
                      {phoneLoading ? <Loader2 size={16} className="spin"/> : <Check size={16}/>}
                      {phoneLoading ? 'Verifying…' : 'Verify phone'}
                    </button>

                    <div className="otp-timer" style={{ marginTop: 10 }}>
                      {phoneCooldown > 0
                        ? <>Resend in <strong>{phoneCooldown}s</strong></>
                        : <button className="auth-link" onClick={sendPhoneCode}>Resend code</button>
                      }
                    </div>
                  </>
                )}
              </>
            ) : (
              <VerifiedBadge label="Phone verified" />
            )}
          </VerifySection>

          {/* Progress indicator: shows what's still pending */}
          {(!emailVerified || !phoneVerified) && (
            <div style={{
              marginTop: 20, padding: '10px 14px',
              background: 'var(--primary-soft)', borderRadius: 'var(--r-md)',
              fontSize: 13, color: 'var(--primary)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Loader2 size={14} className={emailVerified && phoneVerified ? '' : 'spin'}/>
              {!emailVerified && !phoneVerified
                ? 'Verify both email and phone to continue'
                : !emailVerified
                  ? 'Almost there — verify your email to finish'
                  : 'Almost there — verify your phone to finish'}
            </div>
          )}
        </>
      )}
    </AuthLayout>
  )
}

/* ─── VerifySection ─────────────────────────────────────────────────
 * Wrapper that adds an icon + label header and a "verified" hint line.
 * When verified=true, the children are replaced by a green badge.
 */
function VerifySection({ icon, label, verified, hint, children }) {
  return (
    <div style={{
      border: `1px solid ${verified ? 'var(--success, #22c55e)' : 'var(--border)'}`,
      borderRadius: 'var(--r-lg)',
      padding: '16px 18px',
      transition: 'border-color 0.25s',
      background: verified ? 'color-mix(in srgb, var(--success, #22c55e) 6%, var(--surface))' : 'var(--surface)',
    }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          color: verified ? 'var(--success, #22c55e)' : 'var(--primary)',
          display: 'flex', alignItems: 'center',
        }}>
          {verified ? <Check size={18}/> : icon}
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{label}</span>
        {verified && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600,
            color: 'var(--success, #22c55e)',
            background: 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)',
            padding: '2px 8px', borderRadius: 999,
          }}>✓ Done</span>
        )}
      </div>

      {/* destination hint (only while unverified) */}
      {!verified && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, letterSpacing: '0.5px' }}>{hint}</p>
      )}

      {children}
    </div>
  )
}

/* ─── VerifiedBadge ─────────────────────────────────────────────────
 * Shown inside a section after it's been verified successfully.
 */
function VerifiedBadge({ label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: 'var(--success, #22c55e)', fontSize: 14, fontWeight: 500,
      padding: '4px 0',
    }}>
      <Check size={18} strokeWidth={2.5}/>
      {label} — confirmed!
    </div>
  )
}
