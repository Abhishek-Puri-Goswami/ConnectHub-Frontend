/*
 * CreateRoomModal.jsx — New DM / Group Channel Creation Modal
 *
 * Purpose:
 *   A modal dialog that lets the user create either a Direct Message (DM) or a
 *   group channel. Rendered via React Portal directly into document.body so it
 *   is not affected by any parent component's CSS overflow or z-index.
 *
 * Three tabs:
 *   Channel (group) — enter a channel name, optional description, privacy toggle,
 *                     and search for multiple members to add.
 *   Direct message  — search for and select exactly one other user.
 *   Discover        — search ALL public rooms on the platform (GET /rooms/search?q=)
 *                     and join them with one click. Rooms the user already belongs to
 *                     are hidden from results.
 *
 * How member search works:
 *   The search input calls api.searchUsers() after the user types at least 2 characters.
 *   Results are filtered to exclude the current user (you can't DM yourself).
 *   For groups, multiple users can be selected. For DMs, selecting a new user
 *   replaces the previous selection (only one allowed).
 *   Selected users appear as chips above the search results.
 *
 * How room creation works:
 *   On submit, api.createRoom() is called with:
 *     - type: "DM" or "GROUP"
 *     - name: "DM-<username>" for DMs (sidebar strips the "DM-" prefix to show the name)
 *     - memberIds: array of selected user IDs
 *   On success, the new room is added to chatStore and made active (the user is taken
 *   to the new conversation immediately).
 *
 * Props:
 *   onClose      — called when the modal should close (backdrop click or Cancel button)
 *   initialTab   — "dm", "group", or "discover" — which tab to show on open
 */
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { X, Hash, Lock, User, Loader2, Search, MessageCircle, Users, Check, Compass } from 'lucide-react'
import './CreateRoomModal.css'

export default function CreateRoomModal({ onClose, initialTab = 'group' }) {
  const { user } = useAuthStore()
  const { addRoom, setActiveRoom, rooms } = useChatStore()
  const [tab, setTab] = useState(initialTab)

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])

  // Discover tab — public room search
  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverResults, setDiscoverResults] = useState([])
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [joiningRoomId, setJoiningRoomId] = useState(null)

  /*
   * handleSearch — queries the auth-service for users matching the input.
   * Only triggers when query is at least 2 characters to avoid spamming the API
   * for single-character inputs. Filters out the current user from results.
   */
  const handleSearch = async (q) => {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    try {
      const results = await api.searchUsers(q)
      setSearchResults(results.filter(u => u.userId !== user.userId))
    } catch {}
  }

  /*
   * toggleUser — adds or removes a user from the selectedUsers list.
   * For DMs: replaces the current selection (only one user allowed).
   * For groups: toggles inclusion in the multi-select list.
   */
  const toggleUser = (u) => {
    if (tab === 'dm') setSelectedUsers(prev => prev.length > 0 && prev[0].userId === u.userId ? [] : [u])
    else setSelectedUsers(prev => prev.find(x => x.userId === u.userId) ? prev.filter(x => x.userId !== u.userId) : [...prev, u])
  }

  /*
   * handleDiscoverSearch — calls GET /rooms/search?q= to find public rooms on the platform.
   * Filters out rooms the user already belongs to (they're already in the sidebar).
   * Requires at least 1 character to search; empty query clears results.
   */
  const handleDiscoverSearch = useCallback(async (q) => {
    setDiscoverQuery(q)
    if (!q.trim()) { setDiscoverResults([]); return }
    setDiscoverLoading(true)
    try {
      const results = await api.searchRooms(q.trim())
      // Filter rooms the user is already a member of
      const myRoomIds = new Set(rooms.map(r => r.roomId || r.id))
      setDiscoverResults((results || []).filter(r => !myRoomIds.has(r.roomId || r.id)))
    } catch { setDiscoverResults([]) }
    finally { setDiscoverLoading(false) }
  }, [rooms])

  /*
   * handleJoinRoom — adds the current user to a discovered public room.
   * Calls POST /rooms/{id}/members/{uid}, then adds the room to the sidebar
   * and navigates to it, closing the modal.
   */
  const handleJoinRoom = async (room) => {
    setJoiningRoomId(room.roomId || room.id)
    try {
      await api.addMember(room.roomId || room.id, user.userId)
      addRoom(room)
      setActiveRoom(room.roomId || room.id)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not join room')
      setJoiningRoomId(null)
    }
  }

  /*
   * handleCreate — validates and submits the room creation request.
   * Validation:
   *   - Group: name is required, at least one member must be selected.
   *   - DM: exactly one user must be selected.
   * On success: adds room to sidebar (addRoom), navigates to it (setActiveRoom), closes modal.
   */
  const handleCreate = async () => {
    setError('')
    if (tab === 'group' && !name.trim()) { setError('Room name is required'); return }
    if (tab === 'group' && selectedUsers.length < 1) { setError('Add at least one member'); return }
    if (tab === 'dm' && selectedUsers.length !== 1) { setError('Select one user for DM'); return }
    setLoading(true)
    try {
      const room = await api.createRoom({
        name: tab === 'dm' ? `DM-${selectedUsers[0].username}` : name.trim(),
        description: description.trim() || null,
        type: tab === 'dm' ? 'DM' : 'GROUP',
        isPrivate: tab === 'group' ? isPrivate : false,
        memberIds: selectedUsers.map(u => u.userId),
      })
      addRoom(room)
      setActiveRoom(room.roomId)
      onClose()
    } catch (err) { setError(err.message || 'Could not create') }
    finally { setLoading(false) }
  }

  return createPortal(
    /* Overlay backdrop — clicking outside the card closes the modal */
    <div className="modal-overlay fade-in" onClick={onClose}>
      {/* stopPropagation prevents clicks inside the card from closing it */}
      <div role="dialog" className="modal-card clay-lg scale-in" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-head-icon">
            {tab === 'dm' ? <MessageCircle size={18}/> : tab === 'discover' ? <Compass size={18}/> : <Users size={18}/>}
          </div>
          <h2 className="modal-head-title">
            {tab === 'dm' ? 'New direct message' : tab === 'discover' ? 'Discover rooms' : 'Create group'}
          </h2>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>

        {/* Tab switcher: Channel | Direct message | Discover */}
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'group' ? 'active' : ''}`} onClick={() => setTab('group')}>
            <Users size={14}/> Group
          </button>
          <button className={`modal-tab ${tab === 'dm' ? 'active' : ''}`} onClick={() => setTab('dm')}>
            <User size={14}/> Direct message
          </button>
          <button className={`modal-tab ${tab === 'discover' ? 'active' : ''}`} onClick={() => setTab('discover')}>
            <Compass size={14}/> Discover
          </button>
        </div>

        {/* Group / DM body — hidden on Discover tab */}
        {tab !== 'discover' && <div className="modal-body">
          {/* Group-only fields: name, description, private toggle */}
          {tab === 'group' && (
            <>
              <div className="form-group">
                <label className="form-label">Group name<span className="req">*</span></label>
                <input
                  className="form-input"
                  placeholder="general-chat"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input
                  className="form-input"
                  placeholder="What's this group about?"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
              {/* Private channels only show up for invited members, not in public search */}
              <label className="priv-toggle">
                <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)}/>
                <Lock size={14}/>
                <span>Private group — only invited members can join</span>
              </label>
            </>
          )}

          {/* User search — shared between DM and group tabs */}
          <div className="form-group">
            <label className="form-label">{tab === 'dm' ? 'Select user' : 'Add members'}<span className="req">*</span></label>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
              <input
                className="form-input"
                placeholder="Search by name, username or email…"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                style={{ paddingLeft: 40 }}
              />
            </div>
          </div>

          {/* Selected user chips — appear above search results */}
          {selectedUsers.length > 0 && (
            <div className="mdl-selected">
              {selectedUsers.map(u => (
                <span key={u.userId} className="mdl-chip">
                  {u.username}
                  <button onClick={() => toggleUser(u)} aria-label="Remove">×</button>
                </span>
              ))}
            </div>
          )}

          {/* Search results list — each row is clickable to toggle selection */}
          {searchResults.length > 0 && (
            <div className="mdl-results">
              {searchResults.map(u => {
                const sel = selectedUsers.find(x => x.userId === u.userId)
                return (
                  <button
                    key={u.userId}
                    className={`mdl-result ${sel ? 'selected' : ''}`}
                    onClick={() => toggleUser(u)}
                  >
                    <div className="mdl-result-av">{(u.username?.[0] || '?').toUpperCase()}</div>
                    <div className="mdl-result-info">
                      <div className="mdl-result-name">{u.username}</div>
                      <div className="mdl-result-email">{u.fullName || u.email}</div>
                    </div>
                    {sel && <Check size={16} style={{ color: 'var(--primary)' }}/>}
                  </button>
                )
              })}
            </div>
          )}

          {error && <p className="error-text"><X size={14}/> {error}</p>}
        </div>}

        {/* ── Discover tab body ── */}
        {tab === 'discover' && (
          <div className="modal-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Search public rooms on the platform and join with one click.
            </p>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}/>
              <input
                className="form-input"
                placeholder="Search rooms by name…"
                value={discoverQuery}
                onChange={e => handleDiscoverSearch(e.target.value)}
                style={{ paddingLeft: 40 }}
                autoFocus
              />
            </div>

            {discoverLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <Loader2 size={20} className="spin" style={{ color: 'var(--primary)' }}/>
              </div>
            )}

            {!discoverLoading && discoverQuery && discoverResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                No public rooms found for "{discoverQuery}"
              </div>
            )}

            {discoverResults.length > 0 && (
              <div className="mdl-results">
                {discoverResults.map(room => (
                  <div key={room.roomId || room.id} className="mdl-result" style={{ cursor: 'default' }}>
                    <div className="mdl-result-av" style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                      <Hash size={14}/>
                    </div>
                    <div className="mdl-result-info" style={{ flex: 1 }}>
                      <div className="mdl-result-name">{room.name}</div>
                      <div className="mdl-result-email">
                        {room.description || 'No description'} · {room.memberCount || 0} members
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ padding: '5px 14px', fontSize: 12, flexShrink: 0 }}
                      onClick={() => handleJoinRoom(room)}
                      disabled={joiningRoomId === (room.roomId || room.id)}
                    >
                      {joiningRoomId === (room.roomId || room.id)
                        ? <Loader2 size={13} className="spin"/>
                        : 'Join'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && <p className="error-text"><X size={14}/> {error}</p>}
          </div>
        )}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          {tab !== 'discover' && (
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? <Loader2 size={16} className="spin"/> : null}
              {loading ? 'Creating…' : (tab === 'dm' ? 'Start chat' : 'Create group')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
