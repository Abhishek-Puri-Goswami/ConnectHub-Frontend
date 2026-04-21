/*
 * ForgotPasswordPage.jsx — Password Reset via Email OTP (3-Step Flow)
 *
 * Purpose:
 *   Allows users who forgot their password to reset it securely.
 *   The flow has three sequential steps:
 *     Step 1 — Email: user enters the email linked to their account.
 *     Step 2 — OTP: user enters the 6-digit reset code sent to their email.
 *     Step 3 — New password: user sets and confirms a new password.
 *
 * How the reset token works:
 *   When the OTP is verified in Step 2, the backend returns a short-lived
 *   resetToken (a signed string, not a full JWT). This token is stored in
 *   component state and passed to the resetPassword API in Step 3.
 *   The token proves the user successfully verified their email without
 *   needing to keep the OTP itself around.
 *
 * Step navigation:
 *   The `step` state (1, 2, or 3) controls which UI panel is shown with
 *   a `{step === N && (...)}` conditional render. The Back button goes to
 *   the previous step (or /login from step 1).
 *
 * Cooldown timer:
 *   After sending the OTP in Step 1, a 60-second cooldown is applied so
 *   the Resend button cannot be clicked repeatedly. A setInterval ticks
 *   the countdown down each second.
 *
 * Auto-verify on 6th OTP digit:
 *   A useEffect watches the `otp` state. When it reaches 6 characters while
 *   we're on step 2, verifyOtp() is called automatically.
 *
 * Password validation in Step 3:
 *   isPasswordValid() checks all five password rules (length, upper, lower,
 *   digit, symbol). The submit button is disabled unless the password is
 *   strong enough AND the two password fields match.
 *   PasswordStrengthMeter shows a visual indicator below the password field.
 *
 * After successful reset:
 *   A green success message is shown and the user is redirected to /login
 *   after 1.6 seconds so they can sign in with the new password.
 */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import {
  ArrowLeft, Loader2, Check, X, Eye, EyeOff, Mail, Lock, ShieldCheck, KeyRound
} from 'lucide-react'
import AuthLayout from './AuthLayout'
import OtpInput from './OtpInput'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import { validateEmail, isPasswordValid, maskEmail } from '../../utils/validators'
import './AuthStyles.css'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()

  /*
   * step — controls which of the three panels is displayed:
   *   1 = email input form
   *   2 = OTP entry form
   *   3 = new password form
   */
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')

  /*
   * resetToken — a temporary token returned by the backend after OTP verification.
   * It is passed to the resetPassword API to authorize the password change.
   * It is never stored in localStorage; losing it (page reload) means the user
   * must start the flow again from step 1.
   */
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  /* Cooldown countdown — ticks every second, stops at 0 */
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  /*
   * sendOtp — validates the email format, calls the backend to send the reset code,
   * then advances to step 2 and starts a 60-second resend cooldown.
   */
  const sendOtp = async (e) => {
    e?.preventDefault()
    const err = validateEmail(email)
    if (err) { setError(err); return }
    setError(''); setLoading(true)
    try {
      await api.forgotPassword(email)
      setStep(2); setCooldown(60); setOtp('')
    } catch (err) { setError(err.message || 'Could not send code') }
    finally { setLoading(false) }
  }

  /*
   * verifyOtp — submits the 6-digit code to the backend's verify-reset-otp endpoint.
   * The backend returns `{ data: "<reset_token_string>" }` on success.
   * We extract and store the token, then advance to step 3.
   * If the token is missing in the response (unexpected backend error), we throw
   * a descriptive error so the user knows to retry.
   */
  const verifyOtp = async () => {
    if (otp.length !== 6) return
    setError(''); setLoading(true)
    try {
      const res = await api.verifyResetOtp({ email, otp })
      const token = res?.data
      if (!token) throw new Error('No reset token received — please try again')
      setResetToken(token)
      setStep(3)
    } catch (err) { setError(err.message || 'Invalid code'); setOtp('') }
    finally { setLoading(false) }
  }

  /*
   * Auto-verify effect — fires when the user types the 6th OTP digit on step 2.
   * The `step === 2` guard prevents this from firing on other steps if otp is
   * still set from a previous attempt.
   */
  useEffect(() => { if (step === 2 && otp.length === 6 && !loading) verifyOtp() /* eslint-disable-next-line */ }, [otp])

  /*
   * resetPassword — validates that the new password meets requirements and
   * that both fields match, then calls the backend with the resetToken.
   * On success, shows a confirmation message and redirects to /login after 1.6s.
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

  /* passwordsMatch — derived bool used to show/hide the green "Passwords match" hint */
  const passwordsMatch = newPassword && confirmPassword === newPassword

  return (
    <AuthLayout tagline="Reset your password securely">
      {/* Back button — goes one step back or to /login from step 1 */}
      <button
        className="auth-back-btn"
        onClick={() => step === 1 ? navigate('/login') : setStep(s => s - 1)}
      >
        <ArrowLeft size={14}/> Back
      </button>

      {/* ── Step 1: Email input ─────────────────────────────────────────── */}
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
              Enter your email and we'll send you a reset code
            </p>
          </div>

          <form onSubmit={sendOtp}>
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
            {error && <p className="error-text" style={{ marginBottom: 10 }}><X size={14}/> {error}</p>}
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? <Loader2 size={18} className="spin"/> : <Mail size={18}/>}
              {loading ? 'Sending code…' : 'Send reset code'}
            </button>
          </form>
        </div>
      )}

      {/* ── Step 2: OTP entry ───────────────────────────────────────────── */}
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
            {/* maskEmail shows a privacy-masked version of the address */}
            <p className="auth-subtitle" style={{ marginBottom: 0 }}>
              Sent to <strong style={{ color: 'var(--text)' }}>{maskEmail(email)}</strong>
            </p>
          </div>

          {/* 6-box OTP input with keyboard navigation and paste support */}
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

          {/* Resend section — shows cooldown timer, then a clickable Resend link */}
          <div className="otp-timer" style={{ marginTop: 14 }}>
            {cooldown > 0 ? <>Resend in <strong>{cooldown}s</strong></>
              : <button className="auth-link" onClick={sendOtp}>Resend code</button>}
          </div>
        </div>
      )}

      {/* ── Step 3: New password form ───────────────────────────────────── */}
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
              {/* Show strength meter as soon as the user starts typing */}
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

            {/* Button is disabled until both password requirements and match are satisfied */}
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
