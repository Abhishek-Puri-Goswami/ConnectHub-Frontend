/*
 * RoomSettingsPanel.jsx — Room Configuration & Member Management Panel
 *
 * Purpose:
 *   A full-featured settings panel for a room. Shown when the user clicks the
 *   "Channel settings" or "Conversation settings" button in ChatArea's info panel.
 *   Non-admins can view but not change settings. Admins can edit everything.
 *
 * Three tabs:
 *   Info    — room name and description editing; danger zone (clear history, delete room)
 *   Members — list of all members; admin can add/remove members, promote/demote, mute/unmute
 *   Media   — grid of all files/images ever shared in this room
 *
 * How admin actions work:
 *   Each action calls the relevant REST API method and then does a local optimistic update
 *   to the chatStore members array so the UI changes immediately without re-fetching.
 *   The `isAdmin` flag is derived from the current user's role in the room member list.
 *
 * Member management:
 *   - Add member: searches users (excluding current members), then calls api.addMember(),
 *     then refetches the full member list to get the enriched profile data.
 *   - Remove member: api.removeMember() + filters out from local state.
 *   - Role change: toggles between ADMIN and MEMBER via api.updateMemberRole().
 *   - Mute toggle: calls api.muteMember() with true/false.
 *
 * Props:
 *   roomId  — the ID of the room to manage
 *   onClose — called when the panel should close
 */
import { useState, useEffect } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { api } from '../../services/api'
import { enrichRoomMembers, getMemberDisplay } from '../../utils/roomMembers'
import { X, Settings, Users, Image, Trash2, Shield, VolumeX, Volume2, UserMinus, Loader2, Search } from 'lucide-react'
import './RoomSettingsPanel.css'

export default function RoomSettingsPanel({ roomId, onClose }) {
  const { user } = useAuthStore()
  const { rooms, members, setMembers } = useChatStore()
  const room = rooms.find(r => r.roomId === roomId)
  const roomMembers = members[roomId] || []

  const [tab, setTab] = useState('info')
  const [name, setName] = useState(room?.name || '')
  const [description, setDescription] = useState(room?.description || '')
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [addUserSearch, setAddUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])

  /*
   * Load fresh member data on mount with enriched profiles (names, avatars).
   * Also load media when the Media tab is selected.
   */
  useEffect(() => {
    api.getRoomMembers(roomId).then(enrichRoomMembers).then(m => setMembers(roomId, m)).catch(() => {})
  }, [roomId])

  useEffect(() => {
    if (tab === 'media') api.getRoomMedia(roomId).then(setMedia).catch(() => {})
  }, [tab])

  /* Save room name and description changes to the room-service */
  const handleUpdateRoom = async () => {
    setLoading(true); setError('')
    try {
      await api.updateRoom(roomId, { name, description })
      setSuccess('Updated!'); setTimeout(() => setSuccess(''), 2000)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  /*
   * Delete the room permanently. Asks for confirmation first.
   * Reloads the page after deletion so the sidebar room list refreshes cleanly.
   */
  const handleDeleteRoom = async () => {
    if (!confirm('Delete this room permanently?')) return
    try { await api.deleteRoom(roomId); onClose(); window.location.reload() } catch (e) { setError(e.message) }
  }

  /*
   * Clear all messages in the room (admin only). Asks for confirmation.
   * Does not delete the room itself or its members.
   */
  const handleClearHistory = async () => {
    if (!confirm('Clear all messages in this room?')) return
    try { await api.clearHistory(roomId); setSuccess('Cleared') } catch (e) { setError(e.message) }
  }

  /*
   * handleRoleChange — toggles a member between ADMIN and MEMBER roles.
   * Updates the local member list immediately after a successful API call.
   */
  const handleRoleChange = async (uid, role) => {
    try {
      await api.updateMemberRole(roomId, uid, role)
      setMembers(roomId, roomMembers.map(m => m.userId === uid ? { ...m, role } : m))
    } catch (e) { setError(e.message) }
  }

  /*
   * handleMuteToggle — mutes or unmutes a member.
   * Muted members can still read messages but their messages may be hidden (backend-enforced).
   */
  const handleMuteToggle = async (uid, muted) => {
    try {
      await api.muteMember(roomId, uid, muted)
      setMembers(roomId, roomMembers.map(m => m.userId === uid ? { ...m, isMuted: muted } : m))
    } catch (e) { setError(e.message) }
  }

  /* handleRemoveMember — removes a member from the room after confirmation */
  const handleRemoveMember = async (uid) => {
    if (!confirm('Remove this member?')) return
    try {
      await api.removeMember(roomId, uid)
      setMembers(roomId, roomMembers.filter(m => m.userId !== uid))
    } catch (e) { setError(e.message) }
  }

  /*
   * handleSearchUsers — searches for users to add to the room.
   * Filters out users who are already members so you can't add someone twice.
   */
  const handleSearchUsers = async (q) => {
    setAddUserSearch(q)
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const results = await api.searchUsers(q)
      setSearchResults(results.filter(u => !roomMembers.find(m => m.userId === u.userId)))
    } catch {}
  }

  /*
   * handleAddMember — adds a user to the room.
   * After adding, re-fetches the full member list with profiles so the new member
   * appears with their name and avatar immediately.
   */
  const handleAddMember = async (uid) => {
    try {
      await api.addMember(roomId, uid)
      const updated = await api.getRoomMembers(roomId).then(enrichRoomMembers)
      setMembers(roomId, updated)
      setSearchResults(prev => prev.filter(u => u.userId !== uid))
      setAddUserSearch('')
    } catch (e) { setError(e.message) }
  }

  /* The current user is an admin if their role in the room member list is ADMIN */
  const isAdmin = roomMembers.find(m => m.userId === user?.userId)?.role === 'ADMIN'

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="panel-card clay-lg scale-in" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-icon"><Settings size={18}/></div>
          <h2 className="modal-head-title">Room settings</h2>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>

        {/* Tab switcher: Info | Members | Media */}
        <div className="modal-tabs">
          {[
            { id: 'info', icon: Settings, label: 'Info' },
            { id: 'members', icon: Users, label: `Members (${roomMembers.length})` },
            { id: 'media', icon: Image, label: 'Media' },
          ].map(t => (
            <button key={t.id} className={`modal-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <t.icon size={14}/> {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {error && <p className="error-text" style={{ marginBottom: 10 }}><X size={14}/> {error}</p>}
          {success && <p className="success-text" style={{ marginBottom: 10 }}>{success}</p>}

          {/* Info tab: name/description fields and admin-only danger zone */}
          {tab === 'info' && (
            <>
              <div className="form-group">
                <label className="form-label">Room name</label>
                {/* Non-admins see read-only fields */}
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin}/>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={3} value={description}
                  onChange={e => setDescription(e.target.value)} disabled={!isAdmin}/>
              </div>
              {isAdmin && (
                <>
                  <button className="btn btn-primary btn-block" onClick={handleUpdateRoom} disabled={loading} style={{ marginBottom: 16 }}>
                    {loading ? <Loader2 size={16} className="spin"/> : null} Save changes
                  </button>
                  {/* Danger zone — destructive actions separated visually */}
                  <div className="danger-zone">
                    <h4>Danger zone</h4>
                    <button className="btn btn-danger btn-block" onClick={handleClearHistory} style={{ marginBottom: 8 }}>
                      <Trash2 size={14}/> Clear message history
                    </button>
                    <button className="btn btn-danger btn-block" onClick={handleDeleteRoom}>
                      <Trash2 size={14}/> Delete room
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Members tab: add member search (admin only) + member list with action buttons */}
          {tab === 'members' && (
            <>
              {isAdmin && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
                    <input className="form-input" placeholder="Add member…" value={addUserSearch}
                      onChange={e => handleSearchUsers(e.target.value)} style={{ paddingLeft: 38 }}/>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mdl-results" style={{ marginTop: 6 }}>
                      {searchResults.map(u => (
                        <button key={u.userId} className="mdl-result" onClick={() => handleAddMember(u.userId)}>
                          <div className="mdl-result-av">{(u.username?.[0] || '?').toUpperCase()}</div>
                          <div className="mdl-result-info">
                            <div className="mdl-result-name">{u.username}</div>
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>+ Add</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="rsp-member-list">
                {roomMembers.map(m => {
                  const d = getMemberDisplay(m)
                  return (
                    <div key={m.memberId || m.userId} className="rsp-member">
                      {/* Crown emoji for admins, person emoji for regular members */}
                      <div className="rsp-member-av">{m.role === 'ADMIN' ? '👑' : '👤'}</div>
                      <div className="rsp-member-info">
                        <div className="rsp-member-name">
                          {d.primary} {m.userId === user?.userId && <span className="rsp-you">you</span>}
                        </div>
                        <div className="rsp-member-role">{d.secondary}{m.isMuted ? ' • Muted' : ''}</div>
                      </div>
                      {/* Admin action buttons: only shown for other members (not self) */}
                      {isAdmin && m.userId !== user?.userId && (
                        <div className="rsp-member-actions">
                          <button className="icon-btn" title={m.role === 'ADMIN' ? 'Demote' : 'Promote'}
                            onClick={() => handleRoleChange(m.userId, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN')}>
                            <Shield size={14}/>
                          </button>
                          <button className="icon-btn" title={m.isMuted ? 'Unmute' : 'Mute'}
                            onClick={() => handleMuteToggle(m.userId, !m.isMuted)}>
                            {m.isMuted ? <Volume2 size={14}/> : <VolumeX size={14}/>}
                          </button>
                          <button className="icon-btn" title="Remove" style={{ color: 'var(--danger)' }}
                            onClick={() => handleRemoveMember(m.userId)}>
                            <UserMinus size={14}/>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Media tab: grid of thumbnails/file cards for all shared media */}
          {tab === 'media' && (
            <div className="rsp-media">
              {media.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
                  <Image size={28}/><p style={{ marginTop: 8 }}>No shared media</p>
                </div>
              ) : (
                <div className="rsp-media-grid">
                  {media.map(m => (
                    <a key={m.mediaId} href={m.url} target="_blank" rel="noopener" className="rsp-media-thumb">
                      {m.mimeType?.startsWith('image/')
                        ? <img src={m.thumbnailUrl || m.url} alt={m.originalName}/>
                        : <div className="rsp-file-thumb">{m.originalName?.split('.').pop()?.toUpperCase()}</div>}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
