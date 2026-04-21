/*
 * RegisterPage.jsx — New User Registration Form
 *
 * Purpose:
 *   Collects the five fields needed to create a ConnectHub account:
 *   full name, username, email, optional phone number, and password.
 *   On successful submission the backend saves the user (with emailVerified=false)
 *   and sends a 6-digit OTP to the email address. The page then redirects to
 *   /verify-email so the user can confirm their inbox.
 *
 * Real-time input normalization:
 *   Each field runs its value through a normalizer function from validators.js
 *   as the user types (not just on blur). This prevents characters that would
 *   fail validation from ever appearing:
 *   - capitalizeFullName: capitalizes the first letter of each word automatically
 *   - normalizeUsername: strips anything that isn't a lowercase letter, digit, or underscore
 *   - normalizePhone: removes non-digits, limits to 10 characters
 *
 * Inline validation with touched state:
 *   Validation errors (from the errs object) are only shown for fields the user
 *   has already visited (blurred). This prevents the form from showing red
 *   errors immediately when you first load the page. When the form is submitted,
 *   all fields are marked as touched so all errors become visible at once.
 *
 * useMemo for validation:
 *   The errs object is computed via useMemo so it is only recalculated when
 *   the form state actually changes, not on every unrelated render.
 *
 * canSubmit flag:
 *   The submit button is disabled until formValid is true (all errs are null)
 *   AND the form is not currently submitting. This prevents double-submit.
 *
 * Error handling for duplicates:
 *   The backend returns a descriptive error message when the email or username
 *   is already taken. We parse those messages and show human-friendly text
 *   instead of a generic "Registration failed" error.
 *
 * After successful registration:
 *   The backend responds with 201 Created and no body — the user is NOT logged in
 *   yet because their email is unverified. We navigate to /verify-email, passing
 *   the email address in React Router location state so the verification page
 *   knows where to show the OTP was sent.
 */
import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import {
  Eye, EyeOff, Loader2, Check, X, Phone, Mail, User, AtSign, Lock, ShieldCheck
} from 'lucide-react'
import AuthLayout from './AuthLayout'
import PasswordStrengthMeter from './PasswordStrengthMeter'
import {
  capitalizeFullName, normalizeUsername, normalizePhone,
  validateFullName, validateUsername, validateEmail, validatePhone,
  isPasswordValid,
} from '../../utils/validators'
import './AuthStyles.css'

export default function RegisterPage() {
  const navigate = useNavigate()

  /*
   * form — all six input fields in a single state object.
   * Using one object keeps setForm calls simple: `setForm(f => ({ ...f, key: val }))`.
   */
  const [form, setForm] = useState({
    fullName: '', username: '', email: '',
    phoneNumber: '', password: '', confirmPassword: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  /*
   * touched — tracks which fields the user has blurred at least once.
   * Validation error messages are only rendered for touched fields so the
   * form doesn't appear covered in red errors before the user has typed anything.
   */
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  /*
   * errs — computed validation errors for each field.
   * Each validator returns null if the value is valid or an error string if not.
   * Phone is optional — we only validate it if the user has typed something.
   * Password validation uses isPasswordValid() which checks all five password rules.
   */
  const errs = useMemo(() => ({
    fullName: validateFullName(form.fullName),
    username: validateUsername(form.username),
    email: validateEmail(form.email),
    phoneNumber: form.phoneNumber ? validatePhone(form.phoneNumber) : null,
    password: !isPasswordValid(form.password) ? 'Password must meet all requirements' : null,
    confirmPassword:
      form.confirmPassword !== form.password ? 'Passwords do not match' :
      (!form.confirmPassword ? 'Please confirm your password' : null),
  }), [form])

  /* passwordsMatch — derived bool used to show green "Passwords match" hint */
  const passwordsMatch = form.password && form.confirmPassword === form.password

  /* formValid — true only when every validator returns null (no errors at all) */
  const formValid = !errs.fullName && !errs.username && !errs.email &&
                    !errs.phoneNumber && !errs.password && !errs.confirmPassword
  const canSubmit = formValid && !submitting

  /*
   * Field change handlers — each runs the value through its normalizer
   * before storing it in the form state, so invalid characters never appear.
   */
  const onFullName = (v) => setForm(f => ({ ...f, fullName: capitalizeFullName(v) }))
  const onUsername = (v) => setForm(f => ({ ...f, username: normalizeUsername(v) }))
  const onEmail = (v) => setForm(f => ({ ...f, email: v.trim() }))
  const onPhone = (v) => setForm(f => ({ ...f, phoneNumber: normalizePhone(v) }))

  /* blur — marks a field as touched when the user leaves it */
  const blur = (field) => setTouched(t => ({ ...t, [field]: true }))

  /*
   * handleSubmit — registers the user with the backend.
   * First marks all fields as touched so any remaining errors become visible.
   * Then calls the register API with the cleaned form values.
   * Phone is only included if provided, with +91 prefix for India.
   * On success, navigates to /verify-email with the email in router state.
   * On failure, shows a specific message for duplicate email/username.
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched({ fullName: true, username: true, email: true, phoneNumber: true, password: true, confirmPassword: true })
    if (!canSubmit) return
    setError(''); setSubmitting(true)
    try {
      await api.register({
        fullName: form.fullName.trim(),
        username: form.username,
        email: form.email.trim(),
        phoneNumber: form.phoneNumber ? '+91' + form.phoneNumber : undefined,
        password: form.password,
      })
      navigate('/verify-email', { state: { email: form.email.trim() } })
    } catch (err) {
      const msg = err.message || 'Registration failed'
      if (msg.toLowerCase().includes('email already')) {
        setError('This email is already registered. Try signing in.')
      } else if (msg.toLowerCase().includes('username already')) {
        setError('This username is taken. Please choose another.')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* showErr — returns the error string only if the field has been touched */
  const showErr = (field) => touched[field] && errs[field]

  return (
    <AuthLayout tagline="Create your ConnectHub account in seconds">
      <h2 className="auth-title">Create account</h2>
      <p className="auth-subtitle">Fill in your details to get started</p>

      <form onSubmit={handleSubmit} noValidate>
        {/* Full name and username side by side on wider screens */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">
              <User size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
              Full name<span className="req">*</span>
            </label>
            <input
              className={`form-input ${showErr('fullName') ? 'error' : ''}`}
              placeholder="Jane Doe"
              value={form.fullName}
              onChange={e => onFullName(e.target.value)}
              onBlur={() => blur('fullName')}
              autoComplete="name"
            />
            {showErr('fullName') && <p className="field-hint err"><X size={12}/> {errs.fullName}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">
              <AtSign size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
              Username<span className="req">*</span>
            </label>
            <input
              className={`form-input ${showErr('username') ? 'error' : ''}`}
              placeholder="jane_doe"
              value={form.username}
              onChange={e => onUsername(e.target.value)}
              onBlur={() => blur('username')}
              autoComplete="username"
            />
            {showErr('username') && <p className="field-hint err"><X size={12}/> {errs.username}</p>}
          </div>
        </div>

        {/* Email — required, used to send the verification OTP */}
        <div className="form-group">
          <label className="form-label">
            <Mail size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
            Email<span className="req">*</span>
          </label>
          <input
            className={`form-input ${showErr('email') ? 'error' : ''}`}
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={e => onEmail(e.target.value)}
            onBlur={() => blur('email')}
            autoComplete="email"
          />
          {showErr('email') && <p className="field-hint err"><X size={12}/> {errs.email}</p>}
        </div>

        {/* Phone — optional field. The +91 prefix is shown as a static label */}
        <div className="form-group">
          <label className="form-label">
            <Phone size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
            Phone (India)
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>optional</span>
          </label>
          <div className="phone-input-wrap">
            <span className="phone-prefix">🇮🇳 +91</span>
            <input
              className={`form-input ${showErr('phoneNumber') ? 'error' : ''}`}
              type="tel"
              inputMode="numeric"
              placeholder="98765 43210"
              value={form.phoneNumber}
              onChange={e => onPhone(e.target.value)}
              onBlur={() => blur('phoneNumber')}
              autoComplete="tel-national"
            />
          </div>
          {showErr('phoneNumber') && <p className="field-hint err"><X size={12}/> {errs.phoneNumber}</p>}
        </div>

        {/* Password with strength meter — only shown when the user starts typing */}
        <div className="form-group">
          <label className="form-label">
            <Lock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
            Password<span className="req">*</span>
          </label>
          <div className="pw-input-wrap">
            <input
              className={`form-input ${touched.password && errs.password ? 'error' : ''}`}
              type={showPw ? 'text' : 'password'}
              placeholder="Create a strong password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              onBlur={() => blur('password')}
              autoComplete="new-password"
            />
            <button type="button" className="pw-toggle-btn" onClick={() => setShowPw(v => !v)}>
              {showPw ? <EyeOff size={17}/> : <Eye size={17}/>}
            </button>
          </div>
          {/* PasswordStrengthMeter shows a colored bar and requirement checklist */}
          {form.password && <PasswordStrengthMeter password={form.password} />}
        </div>

        {/* Confirm password — turns green when both passwords match */}
        <div className="form-group">
          <label className="form-label">
            <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
            Confirm password<span className="req">*</span>
          </label>
          <div className="pw-input-wrap">
            <input
              className={`form-input ${touched.confirmPassword && errs.confirmPassword ? 'error' : ''} ${passwordsMatch ? 'success' : ''}`}
              type={showConfirmPw ? 'text' : 'password'}
              placeholder="Repeat your password"
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              onBlur={() => blur('confirmPassword')}
              autoComplete="new-password"
            />
            <button type="button" className="pw-toggle-btn" onClick={() => setShowConfirmPw(v => !v)}>
              {showConfirmPw ? <EyeOff size={17}/> : <Eye size={17}/>}
            </button>
          </div>
          {form.confirmPassword && !passwordsMatch && (
            <p className="field-hint err"><X size={12}/> Passwords do not match</p>
          )}
          {passwordsMatch && (
            <p className="field-hint ok"><Check size={12}/> Passwords match</p>
          )}
        </div>

        {/* Server-side error (duplicate email/username, network failure, etc.) */}
        {error && <p className="error-text" style={{ marginBottom: 12 }}><X size={14}/> {error}</p>}

        {/* Submit button — disabled until all validations pass */}
        <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
          {submitting ? <Loader2 size={18} className="spin"/> : <Check size={18}/>}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        {/* Reminder that an OTP will be emailed after successful registration */}
        <p style={{
          textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
          marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6,
        }}>
          <Mail size={12}/> We'll send a verification code to your email
        </p>
      </form>

      <div className="auth-footer">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </AuthLayout>
  )
}
