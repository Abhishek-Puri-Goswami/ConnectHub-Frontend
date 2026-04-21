/*
 * ProfilePanel.jsx — User Profile & Password Settings Modal
 *
 * Purpose:
 *   A modal panel where the logged-in user can edit their profile information
 *   and change their password. Rendered via React Portal into document.body.
 *
 * Two tabs:
 *   Profile  — edit full name, username, and bio. Changes are saved to the auth-service
 *              via api.updateProfile() and then merged into authStore so the sidebar
 *              header reflects the new name immediately without a page reload.
 *   Password — change password with current + new + confirm fields. Uses
 *              PasswordStrengthMeter and isPasswordValid() to enforce requirements.
 *
 * Username availability check:
 *   When the user types a new username, a debounced api.searchUsers() call checks
 *   if the username is already taken. Shows "Checking…" / "Available" / "Already taken"
 *   feedback inline. The Save button is disabled while checking or if the username is taken.
 *
 * Online status note:
 *   The panel shows a static message that status is set automatically (online when
 *   WebSocket is connected, offline on disconnect) — there is no manual status control.
 *
 * Props:
 *   onClose — called when the overlay or X button is clicked to close the modal
 */
import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import { X, Check, Loader2, Shield, AlertCircle, User, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import PasswordStrengthMeter from '../auth/PasswordStrengthMeter'
import { isPasswordValid } from '../../utils/validators'
import './ProfilePanel.css'

export default function ProfilePanel({ onClose }) {
  const { user, updateUser } = useAuthStore()
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    username: user?.username || '',
    bio: user?.bio || '',
  })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState(null)
  const debounceRef = useRef(null)

  /*
   * handleUsernameChange — live username availability check with 500ms debounce.
   * Skips the check if the value is unchanged from the current username or too short.
   * Calls api.searchUsers() and looks for an exact (case-insensitive) match that
   * isn't the current user, then sets the status to 'available' or 'taken'.
   */
  const handleUsernameChange = (value) => {
    setForm({ ...form, username: value })
    setUsernameStatus(null)
    if (value === user?.username || value.length < 3) return
    clearTimeout(debounceRef.current)
    setUsernameStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.searchUsers(value)
        const taken = results.find(u => u.username.toLowerCase() === value.toLowerCase() && u.userId !== user?.userId)
        setUsernameStatus(taken ? 'taken' : 'available')
      } catch { setUsernameStatus(null) }
    }, 500)
  }

  /*
   * handleSaveProfile — saves profile changes to the auth-service.
   * On success: merges the returned data into authStore.user so the sidebar
   * header name/username updates without a page reload.
   * Shows a 3-second success banner then clears it.
   */
  const handleSaveProfile = async () => {
    if (usernameStatus === 'taken') { setError('Username is taken'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      const updated = await api.updateProfile(user.userId, form)
      updateUser({
        fullName: updated.fullName ?? form.fullName,
        username: updated.username ?? form.username,
        bio: updated.bio ?? form.bio,
        avatarUrl: updated.avatarUrl,
        phoneNumber: updated.phoneNumber,
      })
      setSuccess('Profile updated!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  /*
   * handleChangePassword — submits the new password to the auth-service.
   * Validates that the new password meets all strength requirements and that
   * the confirmation matches before making the API call.
   * Clears the password form on success.
   */
  const handleChangePassword = async () => {
    if (!isPasswordValid(pwForm.newPassword)) { setError('Password must meet all requirements'); return }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      await api.changePassword(user.userId, pwForm)
      setSuccess('Password changed!')
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const passwordsMatch = pwForm.newPassword && pwForm.confirmPassword === pwForm.newPassword

  return createPortal(
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="panel-card clay-lg scale-in" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-icon"><User size={18}/></div>
          <h2 className="modal-head-title">Settings</h2>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>

        {/* Tab switcher: Profile | Password */}
        <div className="modal-tabs">
          {['profile', 'password'].map(t => (
            <button key={t} className={`modal-tab ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); setError(''); setSuccess('') }}>
              {t === 'profile' ? <User size={14}/> : <Lock size={14}/>}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'profile' && (
            <>
              {/* Avatar placeholder — shows the first letter of the username */}
              <div className="pp-avatar-section">
                <div className="pp-avatar-lg">
                  {(form.username?.[0] || '?').toUpperCase()}
                </div>
              </div>

              {/* Status is automatic — no manual control, just informational */}
              <div className="pp-status-info">
                <span className="pp-status-dot"/>
                Your status is set automatically — online when connected, offline when you leave.
              </div>

              <div className="form-group">
                <label className="form-label">Full name</label>
                <input className="form-input" value={form.fullName}
                  onChange={e => setForm({...form, fullName: e.target.value})} placeholder="Your name"/>
              </div>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className={`form-input ${usernameStatus === 'taken' ? 'error' : ''}`}
                  value={form.username} onChange={e => handleUsernameChange(e.target.value)} placeholder="username"/>
                {usernameStatus === 'checking' && <p className="field-hint info"><Loader2 size={12} className="spin"/> Checking…</p>}
                {usernameStatus === 'available' && <p className="field-hint ok"><Check size={12}/> Available</p>}
                {usernameStatus === 'taken' && <p className="field-hint err"><AlertCircle size={12}/> Already taken</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Bio</label>
                <textarea className="form-textarea" rows={3} value={form.bio}
                  onChange={e => setForm({...form, bio: e.target.value})}
                  placeholder="Tell us about yourself…"/>
              </div>
              {error && <p className="error-text" style={{ marginBottom: 8 }}><X size={14}/> {error}</p>}
              {success && <p className="success-text" style={{ marginBottom: 8 }}><Check size={14}/> {success}</p>}
              <button className="btn btn-primary btn-block" onClick={handleSaveProfile}
                disabled={loading || usernameStatus === 'taken'}>
                {loading ? <Loader2 size={16} className="spin"/> : <Check size={16}/>} Save changes
              </button>
            </>
          )}

          {tab === 'password' && (
            <>
              <div className="form-group">
                <label className="form-label">Current password</label>
                <input className="form-input" type="password" value={pwForm.currentPassword}
                  onChange={e => setPwForm({...pwForm, currentPassword: e.target.value})}
                  placeholder="Enter current password" autoComplete="current-password"/>
              </div>
              <div className="form-group">
                <label className="form-label">
                  <Lock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
                  New password
                </label>
                {/* Password visibility toggle wraps the input */}
                <div className="pw-input-wrap">
                  <input className="form-input" type={showNewPw ? 'text' : 'password'}
                    value={pwForm.newPassword}
                    onChange={e => setPwForm({...pwForm, newPassword: e.target.value})}
                    placeholder="Create a strong password" autoComplete="new-password"/>
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowNewPw(v => !v)}>
                    {showNewPw ? <EyeOff size={17}/> : <Eye size={17}/>}
                  </button>
                </div>
                {/* Live password strength meter appears once the user starts typing */}
                {pwForm.newPassword && <PasswordStrengthMeter password={pwForm.newPassword} />}
              </div>
              <div className="form-group">
                <label className="form-label">
                  <ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4, color: 'var(--primary)' }}/>
                  Confirm new password
                </label>
                <div className="pw-input-wrap">
                  <input className={`form-input ${pwForm.confirmPassword && !passwordsMatch ? 'error' : ''} ${passwordsMatch ? 'success' : ''}`}
                    type={showConfirmPw ? 'text' : 'password'}
                    value={pwForm.confirmPassword}
                    onChange={e => setPwForm({...pwForm, confirmPassword: e.target.value})}
                    placeholder="Repeat your new password" autoComplete="new-password"/>
                  <button type="button" className="pw-toggle-btn" onClick={() => setShowConfirmPw(v => !v)}>
                    {showConfirmPw ? <EyeOff size={17}/> : <Eye size={17}/>}
                  </button>
                </div>
                {pwForm.confirmPassword && !passwordsMatch && (
                  <p className="field-hint err"><X size={12}/> Passwords do not match</p>
                )}
                {passwordsMatch && (
                  <p className="field-hint ok"><Check size={12}/> Passwords match</p>
                )}
              </div>
              {error && <p className="error-text" style={{ marginBottom: 8 }}><X size={14}/> {error}</p>}
              {success && <p className="success-text" style={{ marginBottom: 8 }}><Check size={14}/> {success}</p>}
              <button className="btn btn-primary btn-block" onClick={handleChangePassword}
                disabled={loading || !pwForm.currentPassword || !pwForm.newPassword || !passwordsMatch}>
                {loading ? <Loader2 size={16} className="spin"/> : <Shield size={16}/>} Change password
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
