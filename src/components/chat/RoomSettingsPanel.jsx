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
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { api } from '../../services/api'
import { ws } from '../../services/websocket'
import { enrichRoomMembers, getMemberDisplay } from '../../utils/roomMembers'
import { X, Settings, Users, Image, Trash2, Shield, VolumeX, Volume2, UserMinus, Loader2, Search, LogOut, Copy, Link, RefreshCw, Camera, Lock, Hash, Download, Film, FileText, File, Forward, Check } from 'lucide-react'
import './RoomSettingsPanel.css'

export default function RoomSettingsPanel({ roomId, onClose }) {
  const { user } = useAuthStore()
  const { rooms, members, setMembers, removeRoom, presenceStatuses, setBulkPresenceStatuses } = useChatStore()
  const room = rooms.find(r => r.roomId === roomId)
  const roomMembers = members[roomId] || []
  const isDM = room?.type === 'DM'
  // For DMs, resolve the other participant's display info
  const dmOther = isDM ? roomMembers.find(m => m.userId !== user?.userId) : null

  const [tab, setTab] = useState('info')
  const [name, setName] = useState(room?.name || '')
  const [description, setDescription] = useState(room?.description || '')
  const [media, setMedia] = useState([])
  const [mediaFilter, setMediaFilter] = useState('all')
  const [mediaLightbox, setMediaLightbox] = useState(null) // { url, name } | null
  const [mediaForwardItem, setMediaForwardItem] = useState(null)
  const [mediaForwardedTo, setMediaForwardedTo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [addUserSearch, setAddUserSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])

  // Group avatar upload
  const [localAvatarUrl, setLocalAvatarUrl] = useState(room?.avatarUrl || null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef(null)

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
      setSuccess('Saved!'); setTimeout(() => setSuccess(''), 2500)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  /*
   * handleAvatarUpload — uploads a new group photo and saves the URL to the room.
   * Uses the media-service profile-picture endpoint (no roomId required) then
   * patches the room record with the returned URL.
   */
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so re-selecting the same file fires onChange again
    e.target.value = ''
    setAvatarUploading(true); setError('')
    try {
      const data = await api.uploadProfilePicture(file)
      const url = data.url || data.fileUrl || data.avatarUrl
      if (!url) throw new Error('Upload succeeded but no URL returned')
      await api.updateRoom(roomId, { name, description, avatarUrl: url })
      setLocalAvatarUrl(url)
      setSuccess('Group photo updated!'); setTimeout(() => setSuccess(''), 2500)
    } catch (e) { setError(e.message || 'Upload failed') }
    finally { setAvatarUploading(false) }
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

  // Fetch bulk presence when the Members tab opens; store results in chatStore
  // so they're available globally (ChatArea and Sidebar also benefit)
  useEffect(() => {
    if (tab !== 'members' || roomMembers.length === 0) return
    const ids = roomMembers.map(m => m.userId)
    api.getBulkPresence(ids)
      .then(list => setBulkPresenceStatuses(list))
      .catch(() => {})
  }, [tab, roomMembers])

  const [leaveLoading, setLeaveLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState(room?.inviteCode || null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)

  const handleGenerateInvite = async () => {
    setInviteLoading(true); setError('')
    try {
      const data = await api.generateInviteCode(roomId)
      setInviteCode(data.inviteCode)
    } catch (e) { setError(e.message) }
    finally { setInviteLoading(false) }
  }

  const handleRevokeInvite = async () => {
    if (!confirm('Revoke the invite link? Existing links will stop working.')) return
    try {
      await api.revokeInviteCode(roomId)
      setInviteCode(null)
    } catch (e) { setError(e.message) }
  }

  const handleCopyInvite = () => {
    if (!inviteCode) return
    const link = `${window.location.origin}/join/${inviteCode}`
    navigator.clipboard.writeText(link).then(() => {
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 2000)
    })
  }

  const handleLeaveRoom = async () => {
    if (!confirm('Leave this room? You will need to be re-invited to rejoin.')) return
    setLeaveLoading(true)
    try {
      await api.leaveRoom(roomId, user.userId)
      removeRoom(roomId)
      onClose()
    } catch (e) { setError(e.message) }
    finally { setLeaveLoading(false) }
  }

  /* The current user is an admin if their role in the room member list is ADMIN */
  const isAdmin = roomMembers.find(m => m.userId === user?.userId)?.role === 'ADMIN'

  /* Media tab helpers */
  const isMediaImage = (item) => {
    const ct = (item.mimeType || '').toLowerCase()
    const fn = (item.originalName || item.url || '').toLowerCase()
    return ct.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fn)
  }
  const isMediaVideo = (item) => (item.mimeType || '').toLowerCase().startsWith('video/')
  const mediaImages = media.filter(isMediaImage)
  const mediaFiles = media.filter(m => !isMediaImage(m))
  const mediaFiltered = mediaFilter === 'images' ? mediaImages
    : mediaFilter === 'files' ? mediaFiles
    : media

  const handleMediaDelete = async (item) => {
    if (!confirm(`Delete "${item.originalName}"? This cannot be undone.`)) return
    try {
      await api.deleteMedia(item.mediaId)
      setMedia(prev => prev.filter(m => m.mediaId !== item.mediaId))
    } catch {}
  }

  const handleMediaForward = (targetRoomId) => {
    if (!mediaForwardItem) return
    const type = isMediaImage(mediaForwardItem) ? 'IMAGE' : 'FILE'
    ws.sendMessage(targetRoomId, mediaForwardItem.originalName || 'Shared file', type, null, mediaForwardItem.url)
    setMediaForwardedTo(targetRoomId)
    setTimeout(() => { setMediaForwardItem(null); setMediaForwardedTo(null) }, 1200)
  }

  const mediaForwardableRooms = rooms.filter(r => r.roomId !== roomId)

  return (
    <div className="modal-overlay fade-in" onClick={onClose}>
      <div className="panel-card clay-lg scale-in" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-icon"><Settings size={18}/></div>
          <h2 className="modal-head-title">
            {isDM ? 'Conversation settings' : 'Group settings'}
          </h2>
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

          {/* Info tab */}
          {tab === 'info' && (
            <>
              {isDM ? (
                /* ── DM: show the other person's profile, no name/description fields ── */
                <>
                  {dmOther && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '8px 0 20px' }}>
                      <div className="rsp-member-av" style={{ width: 64, height: 64, fontSize: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                        {dmOther.avatarUrl
                          ? <img src={dmOther.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}/>
                          : (dmOther.fullName || dmOther.username || '?')[0].toUpperCase()}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{dmOther.fullName || dmOther.username}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{dmOther.username}</div>
                      </div>
                    </div>
                  )}
                  <div className="danger-zone">
                    <h4>Danger zone</h4>
                    <button className="btn btn-danger btn-block" onClick={handleClearHistory} style={{ marginBottom: 8 }}>
                      <Trash2 size={14}/> Clear message history
                    </button>
                    <button className="btn btn-danger btn-block" onClick={handleDeleteRoom}>
                      <Trash2 size={14}/> Delete conversation
                    </button>
                  </div>
                </>
              ) : (
                /* ── Group room: avatar, name, description, invite, danger zone ── */
                <>
                  {/* Group avatar */}
                  <div className="rsp-group-avatar-section">
                    <div
                      className="rsp-group-avatar-wrap"
                      onClick={isAdmin ? () => avatarInputRef.current?.click() : undefined}
                      title={isAdmin ? 'Change group photo' : undefined}
                      style={{ cursor: isAdmin ? 'pointer' : 'default' }}
                    >
                      {avatarUploading ? (
                        <div className="rsp-group-avatar rsp-group-avatar-initials">
                          <Loader2 size={28} className="spin" style={{ color: '#fff' }}/>
                        </div>
                      ) : localAvatarUrl ? (
                        <img src={localAvatarUrl} alt="Group" className="rsp-group-avatar rsp-group-avatar-img"/>
                      ) : (
                        <div className="rsp-group-avatar rsp-group-avatar-initials">
                          {(name || room?.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      {isAdmin && !avatarUploading && (
                        <div className="rsp-avatar-overlay">
                          <Camera size={20}/>
                          <span>Change photo</span>
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <p className="rsp-avatar-hint">Click to upload a group photo</p>
                    )}
                    {/* Privacy badge — read-only, cannot be changed after creation */}
                    <span className={`rsp-privacy-badge ${room?.isPrivate ? 'private' : 'public'}`}>
                      {room?.isPrivate ? <Lock size={11}/> : <Hash size={11}/>}
                      {room?.isPrivate ? 'Private group' : 'Public group'}
                    </span>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleAvatarUpload}
                    />
                  </div>

                  {/* Name & description */}
                  <div className="form-group">
                    <label className="form-label">Group name</label>
                    <input className="form-input" value={name} onChange={e => setName(e.target.value)} disabled={!isAdmin}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                    <textarea className="form-textarea" rows={3} value={description}
                      onChange={e => setDescription(e.target.value)} disabled={!isAdmin}
                      placeholder="What's this group about?"/>
                  </div>

                  {isAdmin && (
                    <>
                      <button className="btn btn-primary btn-block" onClick={handleUpdateRoom} disabled={loading} style={{ marginBottom: 20 }}>
                        {loading ? <Loader2 size={16} className="spin"/> : null} Save changes
                      </button>

                      {/* Invite link */}
                      <div className="rsp-section">
                        <h4 className="rsp-section-title"><Link size={13}/> Invite link</h4>
                        {inviteCode ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="form-input" readOnly value={`${window.location.origin}/join/${inviteCode}`}
                              style={{ fontSize: 12, fontFamily: 'monospace', flex: 1 }}/>
                            <button className="btn btn-primary" onClick={handleCopyInvite} style={{ flexShrink: 0, padding: '8px 12px' }}>
                              {inviteCopied ? <><Copy size={13}/> Copied!</> : <><Copy size={13}/> Copy</>}
                            </button>
                            <button className="btn btn-ghost" onClick={handleRevokeInvite} style={{ flexShrink: 0 }} title="Revoke link">
                              <X size={13}/>
                            </button>
                          </div>
                        ) : (
                          <button className="btn btn-ghost btn-block" onClick={handleGenerateInvite} disabled={inviteLoading}>
                            {inviteLoading ? <Loader2 size={14} className="spin"/> : <RefreshCw size={14}/>}
                            {' '}Generate invite link
                          </button>
                        )}
                      </div>

                      {/* Danger zone */}
                      <div className="danger-zone">
                        <h4>Danger zone</h4>
                        <button className="btn btn-danger btn-block" onClick={handleClearHistory} style={{ marginBottom: 8 }}>
                          <Trash2 size={14}/> Clear message history
                        </button>
                        <button className="btn btn-danger btn-block" onClick={handleDeleteRoom}>
                          <Trash2 size={14}/> Delete group
                        </button>
                      </div>
                    </>
                  )}

                  <div style={{ marginTop: isAdmin ? 12 : 4 }}>
                    <button className="btn btn-danger btn-block" onClick={handleLeaveRoom} disabled={leaveLoading}>
                      {leaveLoading ? <Loader2 size={14} className="spin"/> : <LogOut size={14}/>}
                      {' '}Leave group
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Members tab */}
          {tab === 'members' && (
            <>
              {/* Add member search — group rooms only */}
              {isAdmin && !isDM && (
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
                      <div className="rsp-member-av-wrap">
                        <div className="rsp-member-av">{m.role === 'ADMIN' ? '👑' : '👤'}</div>
                        {(() => {
                          const st = (presenceStatuses[m.userId] || '').toUpperCase()
                          if (!st || st === 'OFFLINE') return null
                          const cls = st === 'AWAY' ? 'away' : st === 'DND' ? 'dnd' : st === 'INVISIBLE' ? 'invisible' : 'online'
                          return <span className={`rsp-presence-dot ${cls}`}/>
                        })()}
                      </div>
                      <div className="rsp-member-info">
                        <div className="rsp-member-name">
                          {d.primary} {m.userId === user?.userId && <span className="rsp-you">you</span>}
                        </div>
                        {/* DMs: no role badge — just show username */}
                        {!isDM && (
                          <div className="rsp-member-role">{d.secondary}{m.isMuted ? ' • Muted' : ''}</div>
                        )}
                      </div>
                      {/* Admin actions: group rooms only — promote/mute/remove make no sense in a DM */}
                      {isAdmin && !isDM && m.userId !== user?.userId && (
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

          {/* Media tab: full-featured gallery with tabs, image grid/lightbox, file list */}
          {tab === 'media' && (
            <div className="rsp-media">
              {/* Sub-tabs */}
              <div className="media-gallery-tabs" style={{ marginBottom: 12 }}>
                {[
                  { id: 'all', label: 'All', count: media.length },
                  { id: 'images', label: 'Images', count: mediaImages.length },
                  { id: 'files', label: 'Files', count: mediaFiles.length },
                ].map(t => (
                  <button
                    key={t.id}
                    className={`media-gallery-tab ${mediaFilter === t.id ? 'active' : ''}`}
                    onClick={() => setMediaFilter(t.id)}
                  >
                    {t.id === 'images' ? <Image size={12} /> : t.id === 'files' ? <File size={12} /> : null}
                    {t.label}
                    <span className="media-gallery-count">{t.count}</span>
                  </button>
                ))}
              </div>

              {mediaFiltered.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>
                  <Image size={28}/><p style={{ marginTop: 8 }}>No {mediaFilter === 'all' ? 'media' : mediaFilter} shared yet</p>
                </div>
              ) : (
                <>
                  {/* Image grid */}
                  {(mediaFilter === 'all' || mediaFilter === 'images') && mediaImages.length > 0 && (
                    <div className="media-grid">
                      {(mediaFilter === 'images' ? mediaImages : mediaImages.slice(0, 12)).map((item, i) => (
                        <div
                          key={item.mediaId || i}
                          className="media-grid-item"
                          onClick={() => setMediaLightbox({ url: item.url, name: item.originalName })}
                        >
                          <img src={item.thumbnailUrl || item.url} alt={item.originalName || 'Image'} loading="lazy" />
                          <div className="media-grid-item-overlay">
                            <span className="media-grid-item-name">{item.originalName || 'Image'}</span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="media-item-del" onClick={e => { e.stopPropagation(); setMediaForwardItem(item) }} title="Forward">
                                <Forward size={12}/>
                              </button>
                              {item.uploaderId === user?.userId && (
                                <button className="media-item-del danger" onClick={e => { e.stopPropagation(); handleMediaDelete(item) }} title="Delete">
                                  <Trash2 size={12}/>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* File list */}
                  {(mediaFilter === 'all' || mediaFilter === 'files') && mediaFiles.length > 0 && (
                    <div className="media-file-list" style={{ marginTop: mediaFilter === 'all' && mediaImages.length > 0 ? 20 : 0 }}>
                      {mediaFiles.map((item, i) => (
                        <div key={item.mediaId || i} className="media-file-row">
                          <a
                            className="media-file-item"
                            href={item.url}
                            download={item.originalName || true}
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            <div className="media-file-icon">
                              {isMediaVideo(item) ? <Film size={18} /> : <FileText size={18} />}
                            </div>
                            <div className="media-file-info">
                              <div className="media-file-name">{item.originalName || 'File'}</div>
                              <div className="media-file-meta">
                                {item.sizeKb ? `${item.sizeKb} KB` : ''}
                                {item.mimeType ? ` · ${item.mimeType}` : ''}
                              </div>
                            </div>
                            <Download size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          </a>
                          <button className="media-item-del file-del" onClick={() => setMediaForwardItem(item)} title="Forward">
                            <Forward size={14}/>
                          </button>
                          {item.uploaderId === user?.userId && (
                            <button className="media-item-del file-del danger" onClick={() => handleMediaDelete(item)} title="Delete">
                              <Trash2 size={14}/>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Inline lightbox */}
              {mediaLightbox && (
                <div className="media-lightbox" onClick={() => setMediaLightbox(null)}>
                  <img src={mediaLightbox.url} alt="Preview" onClick={e => e.stopPropagation()} />
                  <div className="media-lightbox-actions" onClick={e => e.stopPropagation()}>
                    <a href={mediaLightbox.url} download={mediaLightbox.name || true} className="media-lightbox-btn" title="Download">
                      <Download size={18} />
                    </a>
                    <button className="media-lightbox-btn" title="Forward" onClick={() => {
                      const item = media.find(m => m.url === mediaLightbox.url)
                      if (item) { setMediaLightbox(null); setMediaForwardItem(item) }
                    }}>
                      <Forward size={18} />
                    </button>
                    <button className="media-lightbox-btn" title="Close" onClick={() => setMediaLightbox(null)}>
                      <X size={18} />
                    </button>
                  </div>
                </div>
              )}

              {/* Forward picker */}
              {mediaForwardItem && (
                <div className="media-forward-overlay" onClick={() => setMediaForwardItem(null)}>
                  <div className="media-forward-card" onClick={e => e.stopPropagation()}>
                    <div className="media-forward-head">
                      <Forward size={15} />
                      <span>Forward to…</span>
                      <button className="media-gallery-close" style={{ marginLeft: 'auto' }} onClick={() => setMediaForwardItem(null)}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="media-forward-name">{mediaForwardItem.originalName || 'File'}</div>
                    <div className="media-forward-list">
                      {mediaForwardableRooms.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No other rooms available</p>
                      ) : mediaForwardableRooms.map(r => (
                        <button
                          key={r.roomId}
                          className={`media-forward-room ${mediaForwardedTo === r.roomId ? 'sent' : ''}`}
                          onClick={() => handleMediaForward(r.roomId)}
                          disabled={!!mediaForwardedTo}
                        >
                          <span className="media-forward-room-name">{r.name || 'Room'}</span>
                          {mediaForwardedTo === r.roomId
                            ? <Check size={14} style={{ color: 'var(--success, #22c55e)' }} />
                            : <Forward size={13} style={{ color: 'var(--text-muted)' }} />
                          }
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
