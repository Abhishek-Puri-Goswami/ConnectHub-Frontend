/*
 * LoginPage.jsx — Sign-In Page with Three Authentication Methods
 *
 * Purpose:
 *   This is the main login screen of the application. It supports three different
 *   ways for a user to sign in:
 *     1. Email + OTP  — user enters their email, receives a 6-digit code, enters it.
 *     2. Phone + OTP  — user enters their Indian phone number (+91), gets an SMS OTP.
 *     3. Username/Email + Password — classic password login.
 *   Additionally, users can sign in via Google or GitHub (OAuth2), or continue
 *   as a Guest without creating an account.
 *
 * How method switching works:
 *   A "METHODS" tab bar at the top lets the user pick Email / Phone / Password.
 *   Switching tabs clears the error message so the UI starts fresh.
 *   Each method section is shown/hidden with `method === 'x'` conditionals.
 *
 * OTP cooldown timers:
 *   After sending an OTP, the "Send code" button is disabled for 45 seconds so the
 *   user can't spam the server. A setInterval countdown counts down every second.
 *   Separate cooldowns exist for email and phone.
 *
 * Auto-verify on 6th digit:
 *   Two useEffects watch `emailOtp` and `phoneOtp`. When either reaches exactly
 *   6 characters (all digits entered), the verify function is called automatically.
 *   This removes the need for the user to click a "Verify" button.
 *
 * Email OTP unverified redirect:
 *   If the backend returns "email not verified" when sending an OTP, it means the
 *   user registered but never completed email verification. The app re-sends the
 *   original registration OTP and redirects to /verify-email automatically.
 *
 * Password login ambiguity:
 *   The backend accepts either username OR email in the login payload. The code
 *   checks if the identifier contains "@" to decide which field to use. For
 *   username-style input, both fields are sent so the backend can handle either.
 *
 * OAuth2 flow:
 *   Clicking Google or GitHub redirects the browser to the backend's OAuth2 endpoint
 *   (e.g., /oauth2/authorization/google). Spring Security handles the OAuth2 dance
 *   and redirects back to /oauth2/callback with tokens in the URL query string.
 *   In DEV, we use a full localhost URL because the backend runs on a different port.
 *
 * Guest login:
 *   The backend creates (or reuses) a temporary guest account and returns tokens.
 *   Guest users have lower rate limits and fewer features.
 *
 * saveAuth():
 *   Once any login method succeeds, saveAuth() calls authStore.setAuth() to persist
 *   the JWT tokens and user object to localStorage, then navigates to /chat.
 */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import {
  Eye, EyeOff, Loader2, Mail, Phone, AtSign, Lock, X, Check, UserPlus,
} from 'lucide-react'
import AuthLayout from './AuthLayout'
import OtpInput from './OtpInput'
import {
  validateEmail, validatePhone, validateUsername, normalizePhone, normalizeUsername, maskEmail, maskPhone
} from '../../utils/validators'
import './AuthStyles.css'

/*
 * OAUTH2_BASE — the base URL for OAuth2 redirect buttons.
 * In development the frontend runs on port 5173 and the backend on 8080,
 * so we must point to port 8080 explicitly. In production, both are served
 * from the same origin so we use an empty string (relative URL).
 */
const OAUTH2_BASE = import.meta.env.DEV ? 'http://localhost:8080' : ''

/*
 * GoogleIcon / GithubIcon — inline SVG brand icons for the OAuth buttons.
 * These are hardcoded SVGs rather than imported images to avoid extra network
 * requests and to ensure they render correctly in any color scheme.
 */
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)
const GithubIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

/*
 * METHODS — the three tab options for choosing how to log in.
 * Each entry has an id (used in state), a display label, and a Lucide icon.
 */
const METHODS = [
  { id: 'email',    label: 'Email',    Icon: Mail   },
  { id: 'phone',    label: 'Phone',    Icon: Phone  },
  { id: 'password', label: 'Password', Icon: Lock   },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  /*
   * method — which of the three login methods the user has selected.
   * Default is 'password' because it's the most common login pattern.
   */
  const [method, setMethod] = useState('password')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /*
   * Email OTP state:
   * - email: the address to send the code to
   * - emailOtpSent: whether the OTP was successfully dispatched (shows OTP input)
   * - emailOtp: the 6-digit code the user typed (string, not array)
   * - emailCooldown: seconds remaining before user can request another code
   */
  const [email, setEmail] = useState('')
  const [emailOtpSent, setEmailOtpSent] = useState(false)
  const [emailOtp, setEmailOtp] = useState('')
  const [emailCooldown, setEmailCooldown] = useState(0)

  /*
   * Phone OTP state — mirrors the email OTP state but for SMS-based login.
   * The phone is stored without the country code (+91 is prepended when calling the API).
   */
  const [phone, setPhone] = useState('')
  const [phoneOtpSent, setPhoneOtpSent] = useState(false)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneCooldown, setPhoneCooldown] = useState(0)

  /*
   * Password method state:
   * - identifier: the user can type either their username or email address
   * - password: the password field value
   * - showPw: toggles between password type (hidden) and text type (visible)
   */
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)

  /*
   * Cooldown countdown timers — each runs a 1-second setInterval that decrements
   * its state. The interval is cleaned up by the useEffect return function to avoid
   * memory leaks. The interval only starts when the cooldown value is positive.
   */
  useEffect(() => {
    if (emailCooldown <= 0) return
    const t = setInterval(() => setEmailCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [emailCooldown])
  useEffect(() => {
    if (phoneCooldown <= 0) return
    const t = setInterval(() => setPhoneCooldown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [phoneCooldown])

  /* Clear any leftover error message when the user switches login methods */
  useEffect(() => { setError('') }, [method])

  /*
   * saveAuth — called after any successful login to persist credentials.
   * Writes the JWT access token, refresh token, and user object to the auth
   * store (which also saves them to localStorage), then redirects to the chat page.
   */
  const saveAuth = (data) => {
    setAuth(data.accessToken, data.refreshToken, data.user)
    navigate('/chat', { replace: true })
  }

  /*
   * sendEmailOtp — validates the email format, then calls the backend to send a
   * 6-digit login OTP to that address. On success, shows the OTP input and starts
   * the 45-second cooldown. If the backend says the email is not verified (the user
   * registered but never confirmed their email), re-sends the registration OTP and
   * redirects to the verification page instead of showing an error.
   */
  const sendEmailOtp = async () => {
    const e = validateEmail(email)
    if (e) { setError(e); return }
    setError(''); setLoading(true)
    try {
      await api.requestEmailLoginOtp(email)
      setEmailOtpSent(true)
      setEmailCooldown(45)
    } catch (err) {
      const msg = err.message || 'Could not send code'
      if (msg.toLowerCase().includes('not verified') || msg.toLowerCase().includes('email not verified')) {
        try { await api.resendOtp(email) } catch {}
        navigate('/verify-email', { state: { email } })
        return
      }
      setError(msg)
    } finally { setLoading(false) }
  }

  /*
   * verifyEmailOtp — sends the typed OTP to the backend for verification.
   * On success the backend returns JWT tokens, so we call saveAuth() directly.
   * On failure we clear the OTP input so the user can try again cleanly.
   */
  const verifyEmailOtp = async () => {
    if (emailOtp.length !== 6) return
    setError(''); setLoading(true)
    try {
      const data = await api.loginWithEmailOtp(email, emailOtp)
      saveAuth(data)
    } catch (err) { setError(err.message || 'Invalid code'); setEmailOtp('') }
    finally { setLoading(false) }
  }

  /*
   * sendPhoneOtp — validates the 10-digit phone number, prepends the India country
   * code (+91), and requests an SMS OTP. Starts the 45-second resend cooldown.
   * normalizePhone() strips non-digits and limits to 10 characters in real time.
   */
  const sendPhoneOtp = async () => {
    const e = validatePhone(phone)
    if (e) { setError(e); return }
    setError(''); setLoading(true)
    try {
      await api.requestPhoneLoginOtp('+91' + phone)
      setPhoneOtpSent(true)
      setPhoneCooldown(45)
    } catch (err) { setError(err.message || 'Could not send code') }
    finally { setLoading(false) }
  }

  /*
   * verifyPhoneOtp — submits the SMS OTP to the backend for verification.
   * The phone number must be passed with the country code again because the
   * backend needs to look up the pending OTP by full E.164 phone number.
   */
  const verifyPhoneOtp = async () => {
    if (phoneOtp.length !== 6) return
    setError(''); setLoading(true)
    try {
      const data = await api.loginWithPhoneOtp('+91' + phone, phoneOtp)
      saveAuth(data)
    } catch (err) { setError(err.message || 'Invalid code'); setPhoneOtp('') }
    finally { setLoading(false) }
  }

  /*
   * loginPassword — handles username-or-email + password login.
   * The backend accepts either format, so we detect the input type by checking
   * for "@" and send the appropriate field. Both fields are sent for username
   * input so the backend can handle either column in its query.
   * If the backend returns "not verified", we redirect to email verification
   * instead of showing a raw error (better UX).
   */
  const loginPassword = async (e) => {
    e?.preventDefault()
    if (!identifier) { setError('Enter your username or email'); return }
    if (!password) { setError('Enter your password'); return }
    setError(''); setLoading(true)
    try {
      const looksLikeEmail = /@/.test(identifier)
      const payload = looksLikeEmail
        ? { email: identifier, password }
        : { username: identifier, email: identifier, password }
      const data = await api.login(payload)
      saveAuth(data)
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('not verified')) {
        try { await api.resendOtp(identifier) } catch {}
        navigate('/verify-email', { state: { email: identifier } })
        return
      }
      setError(msg)
    } finally { setLoading(false) }
  }

  /*
   * Auto-verify effects — watch the OTP state for each method. As soon as the
   * user types the 6th digit into OtpInput, these effects fire the verify
   * function automatically. The `!loading` guard prevents a double-call if
   * React renders twice (StrictMode) or if a request is already in flight.
   */
  useEffect(() => {
    if (method === 'email' && emailOtpSent && emailOtp.length === 6 && !loading) verifyEmailOtp()
    // eslint-disable-next-line
  }, [emailOtp])
  useEffect(() => {
    if (method === 'phone' && phoneOtpSent && phoneOtp.length === 6 && !loading) verifyPhoneOtp()
    // eslint-disable-next-line
  }, [phoneOtp])

  /*
   * handleOAuth2 — redirects the browser to the backend's Spring Security OAuth2
   * authorization endpoint. Spring Security takes over from there: it redirects
   * the user to the provider's consent screen, handles the callback, creates or
   * updates the user account, and finally redirects back to /oauth2/callback
   * with JWT tokens in the URL query string.
   */
  const handleOAuth2 = (provider) => {
    window.location.href = `${OAUTH2_BASE}/oauth2/authorization/${provider}`
  }

  /*
   * handleGuestLogin — creates a temporary guest session. Guest users can explore
   * the app without registering. The backend returns a real JWT so the same
   * authentication flow applies, but guest accounts have stricter rate limits.
   */
  const handleGuestLogin = async () => {
    setError(''); setLoading(true)
    try {
      const data = await api.loginAsGuest()
      saveAuth(data)
    } catch (err) { setError(err.message || 'Guest login failed') }
    finally { setLoading(false) }
  }

  return (
    <AuthLayout tagline="Welcome back — sign in to keep chatting">
      <h2 className="auth-title">Sign in</h2>
      <p className="auth-subtitle">Choose how you want to sign in to ConnectHub</p>

      {/* OAuth2 social login buttons — redirect to Spring Security endpoint */}
      <div className="oauth-row">
        <button className="oauth-btn" onClick={() => handleOAuth2('google')}>
          <GoogleIcon /> Google
        </button>
        <button className="oauth-btn" onClick={() => handleOAuth2('github')}>
          <GithubIcon /> GitHub
        </button>
      </div>

      <div className="divider">or continue with</div>

      {/* Method selector tabs — Email / Phone / Password */}
      <div className="login-tabs">
        {METHODS.map(m => (
          <button
            key={m.id}
            className={`login-tab ${method === m.id ? 'active' : ''}`}
            onClick={() => setMethod(m.id)}
            type="button"
          >
            <m.Icon size={14}/> {m.label}
          </button>
        ))}
      </div>

      {/* Email OTP method — shows an email input + Send Code button, then OTP input */}
      {method === 'email' && (
        <div className="fade-in">
          <div className="form-group">
            <label className="form-label">
              <Mail size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
              Email address
            </label>
            <div className="input-with-action">
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailOtpSent) { setEmailOtpSent(false); setEmailOtp('') } }}
                disabled={emailOtpSent}
              />
              <button
                type="button" className="inline-action"
                onClick={sendEmailOtp}
                disabled={loading || emailCooldown > 0 || !email}
              >
                {loading && !emailOtpSent ? <Loader2 size={13} className="spin"/> :
                  emailCooldown > 0 ? `${emailCooldown}s` :
                  emailOtpSent ? 'Resend' : 'Send code'}
              </button>
            </div>
          </div>

          {emailOtpSent && (
            <div className="otp-section">
              <div className="otp-section-title">Enter verification code</div>
              {/* maskEmail shows only the first 2 chars and domain, e.g. "jo***@gmail.com" */}
              <div className="otp-section-sub">Sent to <strong>{maskEmail(email)}</strong></div>
              <OtpInput value={emailOtp} onChange={setEmailOtp} />
              <button
                type="button" className="btn btn-primary btn-block"
                onClick={verifyEmailOtp}
                disabled={loading || emailOtp.length !== 6}
              >
                {loading ? <Loader2 size={16} className="spin"/> : <Check size={16}/>} Verify & sign in
              </button>
            </div>
          )}
        </div>
      )}

      {/* Phone OTP method — prefixed with +91 Indian country code flag */}
      {method === 'phone' && (
        <div className="fade-in">
          <div className="form-group">
            <label className="form-label">
              <Phone size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
              Phone number
            </label>
            <div className="phone-input-wrap input-with-action">
              <span className="phone-prefix">🇮🇳 +91</span>
              <input
                className="form-input"
                type="tel" inputMode="numeric"
                placeholder="98765 43210"
                value={phone}
                onChange={e => { setPhone(normalizePhone(e.target.value)); if (phoneOtpSent) { setPhoneOtpSent(false); setPhoneOtp('') } }}
                disabled={phoneOtpSent}
              />
              <button
                type="button" className="inline-action"
                onClick={sendPhoneOtp}
                disabled={loading || phoneCooldown > 0 || !phone}
              >
                {loading && !phoneOtpSent ? <Loader2 size={13} className="spin"/> :
                  phoneCooldown > 0 ? `${phoneCooldown}s` :
                  phoneOtpSent ? 'Resend' : 'Send code'}
              </button>
            </div>
          </div>

          {phoneOtpSent && (
            <div className="otp-section">
              <div className="otp-section-title">Enter verification code</div>
              <div className="otp-section-sub">Sent via SMS to <strong>{maskPhone(phone)}</strong></div>
              <OtpInput value={phoneOtp} onChange={setPhoneOtp} />
              <button
                type="button" className="btn btn-primary btn-block"
                onClick={verifyPhoneOtp}
                disabled={loading || phoneOtp.length !== 6}
              >
                {loading ? <Loader2 size={16} className="spin"/> : <Check size={16}/>} Verify & sign in
              </button>
            </div>
          )}
        </div>
      )}

      {/* Password method — standard username-or-email + password form with show/hide toggle */}
      {method === 'password' && (
        <form onSubmit={loginPassword} className="fade-in">
          <div className="form-group">
            <label className="form-label">
              <AtSign size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
              Username or email
            </label>
            <input
              className="form-input"
              placeholder="jane_doe or you@example.com"
              value={identifier}
              onChange={e => setIdentifier(e.target.value.trim())}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">
              <Lock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
              Password
            </label>
            <div className="pw-input-wrap">
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button" className="pw-toggle-btn" onClick={() => setShowPw(v => !v)}>
                {showPw ? <EyeOff size={17}/> : <Eye size={17}/>}
              </button>
            </div>
          </div>

          <div className="auth-row-between">
            <span />
            <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <Loader2 size={18} className="spin"/> : null}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {/* Shared error display — positioned below all method panels */}
      {error && (
        <p className="error-text" style={{ marginTop: 14, justifyContent: 'center' }}>
          <X size={14}/> {error}
        </p>
      )}

      <div className="divider">or</div>

      {/* Guest login — creates a temporary account, no registration needed */}
      <button
        type="button"
        className="btn btn-block"
        onClick={handleGuestLogin}
        disabled={loading}
        style={{
          background: 'var(--surface)',
          color: 'var(--text-soft)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--clay-shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontWeight: 600,
        }}
      >
        <UserPlus size={16} /> Continue as Guest
      </button>

      <div className="auth-footer">
        Don't have an account? <Link to="/register">Create one</Link>
      </div>
    </AuthLayout>
  )
}
