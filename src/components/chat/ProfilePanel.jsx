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
 * Online status:
 *   The panel shows a manual status selector (Online / Away / Do Not Disturb / Invisible).
 *   The selection is persisted immediately via api.setPresenceStatus() on click.
 *
 * Props:
 *   onClose — called when the overlay or X button is clicked to close the modal
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../store/authStore'
import { usePresenceStore } from '../../store/presenceStore'
import { api } from '../../services/api'
import { X, Check, Loader2, Shield, AlertCircle, User, Lock, Eye, EyeOff, ShieldCheck, Camera, Monitor, LogOut, RefreshCw, Trash2, ChevronDown, Mail, Activity, Bell, BellOff, BellRing, Smartphone } from 'lucide-react'
import {
  isConfigured as isFcmConfigured,
  requestPushPermission,
  getCurrentPushToken,
  savePushToken,
  clearPushToken,
  getNotificationPermissionState,
  initForegroundListener,
} from '../../services/firebase'

const STATUS_OPTIONS = [
  { value: 'ONLINE',    label: 'Online',          cls: 'on',        desc: 'Active and available'              },
  { value: 'AWAY',      label: 'Away',            cls: 'away',      desc: 'Stepped away (also set auto)'      },
  { value: 'DND',       label: 'Do Not Disturb',  cls: 'dnd',       desc: 'No unread badges or notifications' },
  { value: 'INVISIBLE', label: 'Invisible',        cls: 'invisible', desc: 'Appear offline to others'          },
]
import PasswordStrengthMeter from '../auth/PasswordStrengthMeter'
import { isPasswordValid } from '../../utils/validators'
import Avatar from '../common/Avatar'
import './ProfilePanel.css'

/*
 * Decode the jti claim from the current access token (base64 JWT payload).
 * The JWT is not secret — it's just base64-encoded. We read the jti to mark
 * the current session in the sessions list so the user knows which one they're on.
 */
function getCurrentJti() {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.jti || null
  } catch {
    return null
  }
}

/*
 * Format seconds-until-expiry into a human-readable string.
 * e.g. 3661 → "1h 1m", 90 → "1m 30s", -1 → "Expired"
 */
function formatExpiry(seconds) {
  const s = Number(seconds)
  if (!s || s <= 0) return 'Expired'
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60)   return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}

export default function ProfilePanel({ onClose }) {
  const { user, updateUser, clearAuth } = useAuthStore()
  const [tab, setTab] = useState('profile')
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    username: user?.username || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || '',
  })
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [usernameStatus, setUsernameStatus] = useState(null)
  const debounceRef = useRef(null)
  const fileInputRef = useRef(null)

  // Status comes from presenceStore — shared with Sidebar, managed by useIdleDetector
  const { userStatus, isAutoAway, setStatus: setPresenceStatus } = usePresenceStore()
  const handleStatusChange = (status) => setPresenceStatus(user.userId, status)

  // Sessions tab state
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [revokingJti, setRevokingJti] = useState(null)
  const [revokeAllLoading, setRevokeAllLoading] = useState(false)
  const currentJti = getCurrentJti()

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true)
    try {
      const data = await api.getSessions()
      // Sort: current session first, then newest loginAt first
      const sorted = [...(data || [])].sort((a, b) => {
        if (a.jti === currentJti) return -1
        if (b.jti === currentJti) return 1
        try {
          const ma = JSON.parse(a.metadata); const mb = JSON.parse(b.metadata)
          return new Date(mb.loginAt) - new Date(ma.loginAt)
        } catch { return 0 }
      })
      setSessions(sorted)
    } catch { /* silently ignore — session list is best-effort */ }
    finally { setSessionsLoading(false) }
  }, [currentJti])

  useEffect(() => {
    if (tab === 'sessions') loadSessions()
  }, [tab, loadSessions])

  const handleRevokeSession = async (jti) => {
    setRevokingJti(jti)
    try {
      await api.revokeSession(jti)
      setSessions(prev => prev.filter(s => s.jti !== jti))
    } catch { /* ignore */ }
    finally { setRevokingJti(null) }
  }

  const handleRevokeAll = async () => {
    setRevokeAllLoading(true)
    try {
      await api.revokeAllSessions()
      clearAuth()
    } catch { setRevokeAllLoading(false) }
  }

  // Email notification preference state
  const [emailNotifEnabled, setEmailNotifEnabled] = useState(true)
  const [emailNotifLoading, setEmailNotifLoading] = useState(false)

  useEffect(() => {
    if (tab === 'profile' || tab === 'notifications') {
      api.getEmailPreference().then(pref => {
        if (pref && pref.emailNotificationsEnabled !== undefined) {
          setEmailNotifEnabled(pref.emailNotificationsEnabled)
        }
      }).catch(() => {})
    }
  }, [tab])

  // Push notification state
  // permState: 'unsupported' | 'default' | 'granted' | 'denied'
  const [permState, setPermState]         = useState(() => getNotificationPermissionState())
  const [pushToken, setPushToken]         = useState(() => getCurrentPushToken())
  const [pushLoading, setPushLoading]     = useState(false)
  const [pushError, setPushError]         = useState('')
  const [pushSuccess, setPushSuccess]     = useState('')

  const handleEnablePush = async () => {
    setPushLoading(true); setPushError(''); setPushSuccess('')
    try {
      const token = await requestPushPermission()
      await api.registerFcmToken(token)
      savePushToken(token)
      setPushToken(token)
      setPermState('granted')
      setPushSuccess('Push notifications enabled!')
      setTimeout(() => setPushSuccess(''), 3000)
    } catch (e) {
      setPushError(e.message || 'Could not enable push notifications.')
      setPermState(getNotificationPermissionState())
    } finally {
      setPushLoading(false)
    }
  }

  // Refresh permission state whenever the Notifications tab is opened.
  // If permission is already granted but the FCM token isn't registered yet
  // (e.g. user granted permission in a previous session but token wasn't saved),
  // auto-complete the registration silently — no extra click needed.
  useEffect(() => {
    if (tab !== 'notifications') return
    const perm = getNotificationPermissionState()
    const token = getCurrentPushToken()
    setPermState(perm)
    setPushToken(token)
    setPushError('')
    setPushSuccess('')
    if (isFcmConfigured && perm === 'granted' && !token) {
      handleEnablePush()
    }
  }, [tab])

  const handleDisablePush = async () => {
    if (!pushToken) return
    setPushLoading(true); setPushError(''); setPushSuccess('')
    try {
      await api.removeFcmToken(pushToken)
      clearPushToken()
      setPushToken(null)
      setPushSuccess('Push notifications disabled.')
      setTimeout(() => setPushSuccess(''), 3000)
    } catch (e) {
      setPushError(e.message || 'Could not disable push notifications.')
    } finally {
      setPushLoading(false)
    }
  }

  const handleEmailNotifToggle = async () => {
    const next = !emailNotifEnabled
    setEmailNotifLoading(true)
    try {
      await api.saveEmailPreference(next)
      setEmailNotifEnabled(next)
    } catch { /* best-effort */ }
    finally { setEmailNotifLoading(false) }
  }

  // Account deletion state
  const [showDeleteZone, setShowDeleteZone] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const deleteReady = deleteConfirmText === 'DELETE'

  const handleDeleteAccount = async () => {
    if (!deleteReady) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await api.deleteAccount(deletePassword || undefined)
      clearAuth()
    } catch (e) {
      setDeleteError(e.message || 'Deletion failed')
      setDeleteLoading(false)
    }
  }

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

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.uploadProfilePicture(file)
      setForm(f => ({ ...f, avatarUrl: res.url }))
      setSuccess('Profile picture uploaded successfully. Click Save changes to apply.')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
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
        avatarUrl: updated.avatarUrl ?? form.avatarUrl,
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

        {/* Tab switcher: Profile | Password | Notifications | Sessions */}
        <div className="modal-tabs">
          {[
            { key: 'profile',       icon: <User size={14}/>,    label: 'Profile' },
            { key: 'password',      icon: <Lock size={14}/>,    label: 'Password' },
            { key: 'notifications', icon: <Bell size={14}/>,    label: 'Notifications' },
            { key: 'sessions',      icon: <Monitor size={14}/>, label: 'Sessions' },
          ].map(({ key, icon, label }) => (
            <button key={key} className={`modal-tab ${tab === key ? 'active' : ''}`}
              onClick={() => { setTab(key); setError(''); setSuccess('') }}>
              {icon}{label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'profile' && (
            <>
              {/* Avatar placeholder — shows the first letter of the username */}
              <div className="pp-avatar-section">
                <div className="pp-avatar-wrapper" onClick={() => fileInputRef.current?.click()} title="Change Profile Picture">
                  <Avatar 
                    src={form.avatarUrl} 
                    name={form.username || form.fullName || '?'} 
                    className="pp-avatar-lg" 
                  />
                  <div className="pp-avatar-overlay">
                    {uploadingAvatar ? <Loader2 className="spin" size={24}/> : <Camera size={24}/>}
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleAvatarUpload} 
                    accept="image/jpeg,image/png,image/gif,image/webp" 
                    style={{ display: 'none' }} 
                  />
                </div>
              </div>

              {/* Manual status selector */}
              <div className="form-group">
                <label className="form-label">
                  <Activity size={12} style={{ display:'inline', verticalAlign:'-1px', marginRight:4 }}/>
                  Status
                  {isAutoAway && (
                    <span style={{ fontSize:10, fontWeight:400, color:'var(--warning,#f59e0b)', marginLeft:6 }}>
                      (auto-away — move mouse to restore)
                    </span>
                  )}
                </label>
                <div className="pp-status-options">
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`pp-status-opt ${userStatus === opt.value ? 'active' : ''}`}
                      onClick={() => handleStatusChange(opt.value)}
                    >
                      <span className={`pp-status-dot-sm ${opt.cls}`}/>
                      <span>
                        <span style={{ display:'block', fontWeight: 500 }}>{opt.label}</span>
                        <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:400 }}>{opt.desc}</span>
                      </span>
                      {userStatus === opt.value && (
                        <Check size={11} style={{ marginLeft:'auto', flexShrink:0 }}/>
                      )}
                    </button>
                  ))}
                </div>
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

              {/* Danger zone — collapsed by default, expands inline on click */}
              <div className="danger-zone">
                <button
                  className="danger-zone-trigger"
                  onClick={() => {
                    setShowDeleteZone(v => !v)
                    setDeletePassword('')
                    setDeleteConfirmText('')
                    setDeleteError('')
                  }}
                >
                  <Trash2 size={13}/>
                  Danger zone
                  <ChevronDown size={13} className={`dz-chevron ${showDeleteZone ? 'open' : ''}`}/>
                </button>

                {showDeleteZone && (
                  <div className="danger-expand">
                    <p className="dz-warning">
                      <AlertCircle size={14}/>
                      <span>
                        <strong>This is permanent.</strong> Your account, messages, and all data will be
                        deleted immediately and cannot be recovered.
                      </span>
                    </p>

                    <div className="form-group">
                      <label className="form-label">
                        <Lock size={12} style={{ display:'inline', verticalAlign:'-1px', marginRight:4 }}/>
                        Confirm your password
                      </label>
                      <input
                        className="form-input"
                        type="password"
                        value={deletePassword}
                        onChange={e => setDeletePassword(e.target.value)}
                        placeholder="Your current password"
                        autoComplete="current-password"
                      />
                      <p className="field-hint" style={{ color: 'var(--text-soft)', marginTop: 4 }}>
                        Leave blank if you signed in with Google or GitHub.
                      </p>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Type <code className="dz-code">DELETE</code> to confirm
                      </label>
                      <input
                        className={`form-input ${deleteConfirmText && !deleteReady ? 'error' : ''} ${deleteReady ? 'success' : ''}`}
                        type="text"
                        value={deleteConfirmText}
                        onChange={e => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>

                    {deleteError && (
                      <p className="error-text" style={{ marginBottom: 8 }}>
                        <X size={14}/> {deleteError}
                      </p>
                    )}

                    <button
                      className="btn btn-danger btn-block"
                      onClick={handleDeleteAccount}
                      disabled={!deleteReady || deleteLoading}
                    >
                      {deleteLoading
                        ? <><Loader2 size={15} className="spin"/> Deleting…</>
                        : <><Trash2 size={15}/> Permanently delete my account</>}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Notifications tab ────────────────────────────────────── */}
          {tab === 'notifications' && (
            <>
              {/* ── Push Notifications ── */}
              <div className="notif-section">
                <div className="notif-section-header">
                  <Smartphone size={15}/>
                  <div>
                    <div className="notif-section-title">Push notifications</div>
                    <div className="notif-section-hint">Get notified even when ConnectHub isn't open</div>
                  </div>
                </div>

                {/* State: Firebase not configured */}
                {!isFcmConfigured && (
                  <div className="notif-state-row notif-state-unconfigured">
                    <BellOff size={14}/>
                    <span>Push notifications are not configured on this server.</span>
                  </div>
                )}

                {/* State: browser doesn't support notifications */}
                {isFcmConfigured && permState === 'unsupported' && (
                  <div className="notif-state-row notif-state-unsupported">
                    <BellOff size={14}/>
                    <span>Your browser does not support push notifications.</span>
                  </div>
                )}

                {/* State: permission denied by browser */}
                {isFcmConfigured && permState === 'denied' && (
                  <div className="notif-state-row notif-state-denied">
                    <BellOff size={14}/>
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>Permission denied by browser</div>
                      <div>Open your browser's site settings and allow notifications for this site, then reload the page.</div>
                    </div>
                  </div>
                )}

                {/* State: enabled (token registered) */}
                {isFcmConfigured && permState === 'granted' && pushToken && (
                  <div className="notif-state-row notif-state-enabled">
                    <BellRing size={14}/>
                    <span>Push notifications are <strong>active</strong> on this browser.</span>
                  </div>
                )}

                {/* State: permission granted but token still registering (auto-triggered on tab open) */}
                {isFcmConfigured && permState === 'granted' && !pushToken && pushLoading && (
                  <div className="notif-state-row notif-state-inactive">
                    <Loader2 size={14} className="spin"/>
                    <span>Registering this device for push notifications…</span>
                  </div>
                )}

                {pushError   && <p className="notif-msg err"><X size={12}/> {pushError}</p>}
                {pushSuccess && <p className="notif-msg ok"><Check size={12}/> {pushSuccess}</p>}

                {/* Action buttons */}
                {isFcmConfigured && permState !== 'unsupported' && permState !== 'denied' && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {!pushToken ? (
                      /* Hide button while auto-registering (permission already granted) */
                      !pushLoading && (
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                        onClick={handleEnablePush}
                        disabled={pushLoading}
                      >
                        {permState === 'granted'
                          ? <><BellRing size={14}/> Activate push notifications</>
                          : <><Bell size={14}/> Enable push notifications</>}
                      </button>
                      )
                    ) : (
                      <button
                        className="btn btn-ghost"
                        style={{ flex: 1 }}
                        onClick={handleDisablePush}
                        disabled={pushLoading}
                      >
                        {pushLoading
                          ? <><Loader2 size={14} className="spin"/> Disabling…</>
                          : <><BellOff size={14}/> Disable push notifications</>}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Email Notifications ── */}
              <div className="notif-section">
                <div className="notif-section-header">
                  <Mail size={15}/>
                  <div>
                    <div className="notif-section-title">Email notifications</div>
                    <div className="notif-section-hint">Receive an unread digest when offline for 30+ minutes</div>
                  </div>
                  <button
                    className={`toggle-btn ${emailNotifEnabled ? 'on' : 'off'}`}
                    onClick={handleEmailNotifToggle}
                    disabled={emailNotifLoading}
                    aria-pressed={emailNotifEnabled}
                    style={{ marginLeft: 'auto', flexShrink: 0 }}
                  >
                    {emailNotifLoading ? <Loader2 size={12} className="spin"/> : null}
                    <span className="toggle-thumb"/>
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'sessions' && (
            <>
              <div className="sessions-header">
                <p className="sessions-hint">
                  Each entry is an active login. Revoke any session you don't recognise —
                  it will be signed out immediately.
                </p>
                <button className="btn btn-icon-sm" onClick={loadSessions} disabled={sessionsLoading} title="Refresh">
                  <RefreshCw size={14} className={sessionsLoading ? 'spin' : ''}/>
                </button>
              </div>

              {sessionsLoading && sessions.length === 0 ? (
                <div className="sessions-loading"><Loader2 size={20} className="spin"/> Loading sessions…</div>
              ) : sessions.length === 0 ? (
                <div className="sessions-empty">No active sessions found.</div>
              ) : (
                <ul className="sessions-list">
                  {sessions.map(s => {
                    const isCurrent = s.jti === currentJti
                    let loginAt = '—'
                    try { loginAt = new Date(JSON.parse(s.metadata).loginAt).toLocaleString() } catch {}
                    const expiry = formatExpiry(s.expiresInSeconds)
                    return (
                      <li key={s.jti} className={`session-item ${isCurrent ? 'session-current' : ''}`}>
                        <div className="session-icon">
                          <Monitor size={18}/>
                        </div>
                        <div className="session-info">
                          <div className="session-label">
                            Web browser
                            {isCurrent && <span className="session-badge">This device</span>}
                          </div>
                          <div className="session-meta">Signed in {loginAt}</div>
                          <div className="session-meta">Expires in {expiry}</div>
                        </div>
                        <button
                          className="btn btn-danger-sm"
                          disabled={isCurrent || revokingJti === s.jti}
                          onClick={() => handleRevokeSession(s.jti)}
                          title={isCurrent ? 'Cannot revoke current session' : 'Revoke this session'}
                        >
                          {revokingJti === s.jti
                            ? <Loader2 size={13} className="spin"/>
                            : <LogOut size={13}/>}
                          {isCurrent ? 'Current' : 'Revoke'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="sessions-footer">
                <button
                  className="btn btn-danger btn-block"
                  onClick={handleRevokeAll}
                  disabled={revokeAllLoading}
                >
                  {revokeAllLoading
                    ? <><Loader2 size={15} className="spin"/> Signing out…</>
                    : <><LogOut size={15}/> Sign out everywhere</>}
                </button>
              </div>
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
