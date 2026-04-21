/*
 * AddContactModal.jsx — Save Contact to Local Contacts List
 *
 * Purpose:
 *   A modal dialog that lets the user save another person's details to a local
 *   contacts list stored in localStorage. The contact form is pre-filled with
 *   whatever profile data is already known about the person (name, username, etc.)
 *   and the user can edit it before saving.
 *
 * Why localStorage instead of a backend API?
 *   There is no dedicated /contacts endpoint on the backend yet. Using localStorage
 *   is a pragmatic interim solution — the data persists across page refreshes for
 *   the current browser session. When a backend endpoint is added, the single call
 *   inside handleSave() can be replaced with api.addContact(entry) with minimal
 *   changes to the rest of the component.
 *
 * Local contacts storage:
 *   All contacts are stored as a JSON array under the key "connecthub-contacts"
 *   in localStorage. loadLocalContacts() reads it safely (handles missing/corrupt data).
 *   saveLocalContacts() writes the updated array back.
 *   When a contact with the same username is saved again, the old entry is replaced
 *   (upsert behavior).
 *
 * Props:
 *   contact  — pre-fill values { fullName, username, email, phoneNumber }
 *              typically passed from a user profile or DM header
 *   onSaved  — callback fired with the saved contact entry (for toast / close logic)
 *   onClose  — called when overlay, X button, or Cancel is clicked
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { UserPlus, X, Check, User, AtSign, Mail, Phone, Loader2 } from 'lucide-react'
import './AddContactModal.css'

const STORAGE_KEY = 'connecthub-contacts'

/* loadLocalContacts — reads the contacts array from localStorage, returns [] on error */
function loadLocalContacts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/* saveLocalContacts — writes the full contacts array back to localStorage */
function saveLocalContacts(contacts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts))
}

export default function AddContactModal({ contact = {}, onSaved, onClose }) {
  const [fullName, setFullName]       = useState(contact.fullName || '')
  const [username, setUsername]       = useState(contact.username || '')
  const [email, setEmail]             = useState(contact.email || '')
  const [phoneNumber, setPhoneNumber] = useState(contact.phoneNumber || '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [ok, setOk]         = useState(false)

  /*
   * handleSave — validates and saves the contact entry.
   * Strips the "@" prefix from usernames if the user typed it.
   * Performs an upsert: removes any existing entry with the same username
   * before adding the new one, so contacts can be updated.
   * Shows a brief success state before calling onSaved to close the modal.
   */
  const handleSave = async () => {
    setError('')
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (!username.trim()) { setError('Username is required'); return }
    setSaving(true)
    try {
      const entry = {
        fullName: fullName.trim(),
        username: username.trim().replace(/^@/, ''),
        email: email.trim() || null,
        phoneNumber: phoneNumber.trim() || null,
        savedAt: new Date().toISOString(),
      }
      const all = loadLocalContacts().filter(c => c.username !== entry.username)
      all.push(entry)
      saveLocalContacts(all)

      setOk(true)
      setTimeout(() => onSaved?.(entry), 700)
    } catch (e) {
      console.error('Save contact failed:', e)
      setError('Could not save contact — please try again')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="ac-overlay" onClick={onClose}>
      <div
        className="ac-card clay-lg scale-in"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ac-title"
      >
        {/* Modal header with title and close button */}
        <div className="ac-head">
          <div className="ac-head-icon">
            <UserPlus size={18}/>
          </div>
          <div className="ac-head-body">
            <h2 id="ac-title" className="ac-title">Add to Contacts</h2>
            <p className="ac-sub">Save this person to your contacts list</p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close">
            <X size={18}/>
          </button>
        </div>

        {/* Live preview — updates as the user types name/username */}
        <div className="ac-preview">
          <div className="ac-preview-av">
            {(fullName[0] || username[0] || '?').toUpperCase()}
          </div>
          <div className="ac-preview-info">
            <div className="ac-preview-name">{fullName || 'New contact'}</div>
            <div className="ac-preview-handle">{username ? `@${username.replace(/^@/, '')}` : '—'}</div>
          </div>
        </div>

        {/* Contact form fields */}
        <div className="ac-body">
          {error && <div className="ac-error">{error}</div>}
          {ok && (
            <div className="ac-success">
              <Check size={14}/> Contact saved
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="ac-name">
              Full name <span className="req">*</span>
            </label>
            <div className="ac-input-wrap">
              <User size={15} className="ac-input-icon"/>
              <input
                id="ac-name"
                className="form-input ac-input"
                placeholder="John Smith"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="ac-user">
              Username <span className="req">*</span>
            </label>
            <div className="ac-input-wrap">
              <AtSign size={15} className="ac-input-icon"/>
              <input
                id="ac-user"
                className="form-input ac-input"
                placeholder="johnsmith"
                value={username}
                /* Force lowercase and strip invalid chars in real time */
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="ac-email">Email</label>
            <div className="ac-input-wrap">
              <Mail size={15} className="ac-input-icon"/>
              <input
                id="ac-email"
                type="email"
                className="form-input ac-input"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="ac-phone">Phone</label>
            <div className="ac-input-wrap">
              <Phone size={15} className="ac-input-icon"/>
              <input
                id="ac-phone"
                className="form-input ac-input"
                placeholder="+91 98765 43210"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Footer: Cancel and Save buttons */}
        <div className="ac-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || ok}
          >
            {saving
              ? <><Loader2 size={14} className="spin"/> Saving…</>
              : ok
                ? <><Check size={14}/> Saved</>
                : <><UserPlus size={14}/> Save contact</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
