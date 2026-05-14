/*
 * ForgotPasswordPage.jsx — Password Reset via Email or Phone OTP (3-Step Flow)
 *
 * Purpose:
 *   Allows users who forgot their password to reset it securely.
 *   The user can choose to receive the reset code via email OR via SMS
 *   to their registered phone number.
 *
 * Mode toggle:
 *   A two-button selector on Step 1 lets the user pick "Email" or "Phone".
 *   Switching mode resets step back to 1 and clears all form state.
 *
 * Flow steps (identical for both modes):
 *   Step 1 — Identifier: email address or phone number input.
 *   Step 2 — OTP: 6-digit code sent to the chosen channel.
 *   Step 3 — New password: set and confirm a new strong password.
 *
 * OTP verification:
 *   Email mode — calls /auth/forgot-password    → /auth/verify-reset-otp
 *   Phone mode — calls /auth/forgot-password/phone → /auth/verify-reset-otp/phone
 *   Both return a short-lived resetToken that authorises /auth/reset-password.
 *
 * Phone input:
 *   A static "+91" prefix (matching RegisterPage) is shown beside the input.
 *   The raw 10-digit digits are stored in state; the full E.164 number
 *   (+91XXXXXXXXXX) is assembled before API calls.
 *
 * Cooldown timer, auto-verify on 6th digit, password strength meter, and
 * redirect-on-success work identically to the original email-only version.
 */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import {
  ArrowLeft, Loader2, Check, X, Eye, EyeOff,
  Mail, Phone, Lock, ShieldCheck, KeyRound,
} from 'lucide-react'
import AuthLayout from './AuthLayout'
import OtpInput from './OtpInput'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import {
  validateEmail, isPasswordValid, maskEmail,
  normalizePhone, validatePhone, maskPhone,
} from '../../utils/validators'
import './AuthStyles.css'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()

  /*
   * mode — which channel the reset code is sent through.
   * Switching between modes clears all state and resets to step 1.
   */
  const [mode, setMode] = useState('email') // 'email' | 'phone'

  /*
   * step — controls which panel is shown:
   *   1 = identifier (email or phone) input
   *   2 = OTP entry
   *   3 = new password form
   */
  const [step, setStep] = useState(1)

  /* Email mode fields */
  const [email, setEmail] = useState('')

  /* Phone mode fields — raw digits only; prefix (+91) is prepended on submission */
  const [phone, setPhone] = useState('')

  const [otp, setOtp] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  /* Switch mode — clear everything and return to step 1 */
  const switchMode = (m) => {
    if (m === mode) return
    setMode(m)
    setStep(1)
    setEmail('')
    setPhone('')
    setOtp('')
    setResetToken('')
    setError('')
    setSuccess('')
    setCooldown(0)
  }

  /* Cooldown countdown — ticks every second */
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  /*
   * sendOtp — validates the identifier, calls the appropriate backend endpoint,
   * advances to step 2, and starts a 60-second resend cooldown.
   */
  const sendOtp = async (e) => {
    e?.preventDefault()
    setError('')

    if (mode === 'email') {
      const err = validateEmail(email)
      if (err) { setError(err); return }
    } else {
      const err = validatePhone(phone)
      if (err) { setError(err); return }
    }

    setLoading(true)
    try {
      if (mode === 'email') {
        await api.forgotPassword(email)
      } else {
        await api.forgotPasswordByPhone('+91' + phone)
      }
      setStep(2); setCooldown(60); setOtp('')
    } catch (err) { setError(err.message || 'Could not send code') }
    finally { setLoading(false) }
  }

  /*
   * verifyOtp — submits the 6-digit code to the appropriate verify endpoint.
   * Both endpoints return `{ data: "<reset_token>" }` on success.
   */
  const verifyOtp = async () => {
    if (otp.length !== 6) return
    setError(''); setLoading(true)
    try {
      let res
      if (mode === 'email') {
        res = await api.verifyResetOtp({ email, otp })
      } else {
        res = await api.verifyPhoneResetOtp({ phoneNumber: '+91' + phone, otp })
      }
      const token = res?.data
      if (!token) throw new Error('No reset token received — please try again')
      setResetToken(token)
      setStep(3)
    } catch (err) { setError(err.message || 'Invalid code'); setOtp('') }
    finally { setLoading(false) }
  }

  /* Auto-verify when the user types the 6th OTP digit */
  useEffect(() => {
    if (step === 2 && otp.length === 6 && !loading) verifyOtp()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  /*
   * resetPassword — validates the new password and submits with the resetToken.
   * On success, shows a confirmation then navigates to /login.
   */
  const resetPassword = async (e) => {
    e?.preventDefault()
    if (!isPasswordValid(newPassword)) { setError('Password does not meet requirements'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setError(''); setLoading(true)
    try {
      await api.resetPassword({ resetToken, newPassword })
      setSuccess('Password reset! Redirecting to sign in…')
      setTimeout(() => navigate('/login'), 1600)
    } catch (err) { setError(err.message || 'Could not reset password') }
    finally { setLoading(false) }
  }

  const passwordsMatch = newPassword && confirmPassword === newPassword

  /* Masked display of the chosen identifier for Step 2 */
  const maskedIdentifier = mode === 'email' ? maskEmail(email) : maskPhone('+91' + phone)

  return (
    <AuthLayout tagline="Reset your password securely">
      {/* Back button */}
      <button
        className="auth-back-btn"
        onClick={() => step === 1 ? navigate('/login') : setStep(s => s - 1)}
      >
        <ArrowLeft size={14}/> Back
      </button>

      {/* ── Step 1: Identifier input ──────────────────────────────────────── */}
      {step === 1 && (
        <div className="fade-in">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 'var(--r-xl)',
              background: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--clay-shadow)', marginBottom: 12,
            }}>
              <KeyRound size={28}/>
            </div>
            <h2 className="auth-title">Forgot password?</h2>
            <p className="auth-subtitle" style={{ marginBottom: 0 }}>
              {mode === 'email'
                ? "Enter your email and we'll send you a reset code"
                : "Enter your phone number and we'll send you a reset code"}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="auth-mode-toggle" style={{ marginBottom: 18 }}>
            <button
              type="button"
              className={`auth-mode-btn ${mode === 'email' ? 'active' : ''}`}
              onClick={() => switchMode('email')}
            >
              <Mail size={14}/> Email
            </button>
            <button
              type="button"
              className={`auth-mode-btn ${mode === 'phone' ? 'active' : ''}`}
              onClick={() => switchMode('phone')}
            >
              <Phone size={14}/> Phone
            </button>
          </div>

          <form onSubmit={sendOtp}>
            {mode === 'email' ? (
              <div className="form-group">
                <label className="form-label">
                  <Mail size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
                  Email address
                </label>
                <input
                  className="form-input" type="email" placeholder="you@example.com"
                  value={email} onChange={e => setEmail(e.target.value)} autoFocus
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">
                  <Phone size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
                  Phone number
                </label>
                <div className="phone-input-wrap">
                  <span className="phone-prefix">🇮🇳 +91</span>
                  <input
                    className="form-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={e => setPhone(normalizePhone(e.target.value))}
                    autoFocus
                  />
                </div>
              </div>
            )}

            {error && <p className="error-text" style={{ marginBottom: 10 }}><X size={14}/> {error}</p>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin"/> : mode === 'email' ? <Mail size={18}/> : <Phone size={18}/>}
              {loading ? 'Sending code…' : 'Send reset code'}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 2: OTP entry ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="fade-in">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 'var(--r-xl)',
              background: 'var(--primary-soft)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--clay-shadow)', marginBottom: 12,
            }}>
              <ShieldCheck size={28}/>
            </div>
            <h2 className="auth-title">Enter the code</h2>
            <p className="auth-subtitle" style={{ marginBottom: 0 }}>
              {mode === 'email' ? 'Sent to your email ' : 'Sent via SMS to '}
              <strong style={{ color: 'var(--text)' }}>{maskedIdentifier}</strong>
            </p>
          </div>

          <OtpInput value={otp} onChange={setOtp} />

          {error && <p className="error-text" style={{ justifyContent: 'center' }}><X size={14}/> {error}</p>}

          <button
            className="btn btn-primary btn-block"
            onClick={verifyOtp}
            disabled={loading || otp.length !== 6}
            style={{ marginTop: 12 }}
          >
            {loading ? <Loader2 size={18} className="spin"/> : <Check size={18}/>}
            {loading ? 'Verifying…' : 'Verify code'}
          </button>

          <div className="otp-timer" style={{ marginTop: 14 }}>
            {cooldown > 0
              ? <>Resend in <strong>{cooldown}s</strong></>
              : <button className="auth-link" onClick={sendOtp}>Resend code</button>}
          </div>
        </div>
      )}

      {/* ── Step 3: New password form ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="fade-in">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 'var(--r-xl)',
              background: 'var(--secondary-soft)', color: 'var(--secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--clay-shadow)', marginBottom: 12,
            }}>
              <Lock size={28}/>
            </div>
            <h2 className="auth-title">Set new password</h2>
            <p className="auth-subtitle" style={{ marginBottom: 0 }}>
              Choose a strong password for your account
            </p>
          </div>

          <form onSubmit={resetPassword}>
            <div className="form-group">
              <label className="form-label">
                <Lock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
                New password
              </label>
              <div className="pw-input-wrap">
                <input
                  className="form-input" type={showPw ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} autoFocus
                />
                <button type="button" className="pw-toggle-btn" onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
              {newPassword && <PasswordStrengthMeter password={newPassword} />}
            </div>

            <div className="form-group">
              <label className="form-label">
                <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
                Confirm new password
              </label>
              <div className="pw-input-wrap">
                <input
                  className={`form-input ${confirmPassword && !passwordsMatch ? 'error' : ''} ${passwordsMatch ? 'success' : ''}`}
                  type={showConfirmPw ? 'text' : 'password'}
                  placeholder="Repeat your new password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                />
                <button type="button" className="pw-toggle-btn" onClick={() => setShowConfirmPw(v => !v)}>
                  {showConfirmPw ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && <p className="field-hint err"><X size={12}/> Passwords do not match</p>}
              {passwordsMatch && <p className="field-hint ok"><Check size={12}/> Passwords match</p>}
            </div>

            {error && <p className="error-text" style={{ marginBottom: 10 }}><X size={14}/> {error}</p>}
            {success && <p className="success-text" style={{ marginBottom: 10 }}><Check size={14}/> {success}</p>}

            <button
              type="submit" className="btn btn-primary btn-block"
              disabled={loading || !passwordsMatch || !isPasswordValid(newPassword)}
            >
              {loading ? <Loader2 size={18} className="spin"/> : <Check size={18}/>}
              {loading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        </div>
      )}

      <div className="auth-footer">
        Remember your password? <Link to="/login">Sign in</Link>
      </div>
    </AuthLayout>
  )
}
