/*
 * Sidebar.jsx — Left Panel: Conversation List + Navigation
 *
 * Purpose:
 *   The left panel of the chat layout. Shows the list of all rooms/DMs the user
 *   belongs to, with search, quick-create buttons, unread badges, and a footer
 *   with settings and logout.
 *
 * What it renders (top to bottom):
 *   1. Header row — "Messages" title + ThemeToggle + More menu (profile/admin/billing/logout)
 *   2. Search input — filters the room list by name in real time (client-side, no API call)
 *   3. Quick actions — "Message" (new DM) and "Group" (new group) buttons
 *   4. Conversation list — one ConversationRow per room, sorted by lastMessageAt
 *   5. Footer — current user avatar + name, with a click to open profile settings
 *   6. Upgrade CTA / plan badge — shown based on subscription status
 *   7. Bottom bar — Settings and Logout buttons
 *
 * ConversationRow (inner component):
 *   Renders a single room entry. For DMs it resolves the other user's name and
 *   avatar by fetching the member list. Shows:
 *   - Colored avatar with the room's initial (DMs) or a # / lock icon (groups)
 *   - Online dot for DM when the other user is online
 *   - Room name + relative timestamp of last message
 *   - Message preview (text, or "📷 Photo", or "📎 File")
 *   - Unread badge (red count bubble)
 *
 * formatRelative(date) — formats timestamps in a human-friendly way:
 *   Same day → "10:34 AM", Yesterday → "Yesterday", < 7 days → "3 days ago", older → "Jan 5"
 *
 * Props:
 *   wsConnected (boolean) — used to render the green/grey dot on the user's own avatar
 */
import { useState, useEffect, memo, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { usePaymentStore } from '../../store/paymentStore'
import { usePresenceStore } from '../../store/presenceStore'
import { api } from '../../services/api'
import { enrichRoomMembers } from '../../utils/roomMembers'
import {
  MessageCircle, Search, Plus, LogOut, Settings,
  Hash, Lock, MoreHorizontal, Users, X, Zap, Shield, CreditCard,
  Check, CheckCheck, ChevronDown,
} from 'lucide-react'
import { formatDistanceToNowStrict, isToday, isYesterday, format } from 'date-fns'
import CreateRoomModal from '../chat/CreateRoomModal'
import ProfilePanel from '../chat/ProfilePanel'
import ThemeToggle from '../../theme/ThemeToggle'
import UpgradeModal from '../chat/UpgradeModal'
import Avatar from '../common/Avatar'
import { decodeHtml } from '../chat/MessageBubble'
import './Sidebar.css'

const STATUS_OPTIONS = [
  { value: 'ONLINE',    label: 'Online',          cls: 'on'        },
  { value: 'AWAY',      label: 'Away',            cls: 'away'      },
  { value: 'DND',       label: 'Do Not Disturb',  cls: 'dnd'       },
  { value: 'INVISIBLE', label: 'Invisible',        cls: 'invisible' },
]

export default function Sidebar({ wsConnected }) {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const { rooms, activeRoomId, setActiveRoom, unreadCounts, closeSidebar } = useChatStore()
  const { subscription, upgradeModalOpen, openUpgradeModal, closeUpgradeModal } = usePaymentStore()
  const subscriptionStatus = (subscription?.status || '').toUpperCase()
  const userRole = (user?.role || '').toUpperCase()
  const hasProSubscription = userRole === 'ADMIN' || userRole === 'PLATFORM_ADMIN'
    || (subscriptionStatus === 'ACTIVE' && subscription?.plan !== 'FREE')

  const { userStatus, isAutoAway, setStatus: setPresenceStatus } = usePresenceStore()

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createTab, setCreateTab] = useState('dm')
  const [showProfile, setShowProfile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showProBenefits, setShowProBenefits] = useState(false)
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const [dmExpanded, setDmExpanded] = useState(true)
  const [groupExpanded, setGroupExpanded] = useState(true)

  const handleStatusChange = (status) => {
    setStatusPickerOpen(false)
    setPresenceStatus(user.userId, status)
  }

  const dotClass = !wsConnected ? 'off'
    : userStatus === 'AWAY' ? 'away'
    : userStatus === 'DND' ? 'dnd'
    : userStatus === 'INVISIBLE' ? 'invisible'
    : 'on'

  /* Close the floating "more" menu when Escape is pressed */
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  /* Client-side filter — searches room name and description — memoized */
  const filtered = useMemo(() =>
    rooms.filter(r =>
      (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase())
    ), [rooms, search])

  /* Split into DMs and Groups for sectioned rendering */
  const filteredDMs     = useMemo(() => filtered.filter(r => r.type === 'DM'),    [filtered])
  const filteredGroups  = useMemo(() => filtered.filter(r => r.type !== 'DM'),    [filtered])

  /* When clicking a room: activate it, clear its unread count, close mobile sidebar */
  const handleRoomClick = useCallback((roomId) => {
    setActiveRoom(roomId)
    useChatStore.getState().clearUnread(roomId)
    closeSidebar()
  }, [setActiveRoom, closeSidebar])

  /* Logout: call the backend to invalidate the refresh token, then clear local state */
  const handleLogout = async () => {
    try { await api.logout() } catch {}
    clearAuth()
  }

  return (
    <>
      <div className="sb clay-lg">

        {/* Header row: title + compact theme toggle + more menu */}
        <div className="sb-head">
          <h1 className="sb-title">Messages</h1>
          <div className="sb-head-actions">
            <ThemeToggle compact />
            <button
              className="icon-btn"
              onClick={() => setMenuOpen(v => !v)}
              title="More"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={18}/>
            </button>
            <button
              className="icon-btn sb-mobile-close"
              onClick={closeSidebar}
              title="Close"
            >
              <X size={18}/>
            </button>
            {menuOpen && (
              <>
                {/* Backdrop closes the menu when clicking outside */}
                <div className="sb-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="sb-menu scale-in">
                  <button onClick={() => { setShowProfile(true); setMenuOpen(false) }}>
                    <Settings size={14}/> Settings
                  </button>
                  {/* Admin panel link shown to ADMIN and PLATFORM_ADMIN */}
                  {['ADMIN', 'PLATFORM_ADMIN'].includes(user?.role?.toUpperCase()) && (
                  <button onClick={() => { navigate('/admin'); setMenuOpen(false) }}>
                    <Shield size={14}/> Admin Panel
                  </button>
                  )}
                  <button onClick={() => { navigate('/billing'); setMenuOpen(false) }}>
                    <CreditCard size={14}/> Billing
                  </button>

                  <div className="sb-menu-sep"/>
                  <button className="sb-menu-danger" onClick={handleLogout}>
                    <LogOut size={14}/> Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Search input — filters the room list client-side on every keystroke */}
        <div className="sb-search-wrap">
          <Search size={15} className="sb-search-icon"/>
          <input
            className="sb-search"
            placeholder="Search conversations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="sb-search-clear" onClick={() => setSearch('')} title="Clear">
              <X size={13}/>
            </button>
          )}
        </div>

        {/* Conversation list — sectioned by DM vs Group */}
        <div className="sb-list">
          {filtered.length === 0 ? (
            <div className="sb-empty">
              <div className="sb-empty-badge"><MessageCircle size={24}/></div>
              <div className="sb-empty-title">
                {search ? 'No conversations match' : 'No conversations yet'}
              </div>
              <div className="sb-empty-sub">
                {search ? 'Try a different keyword' : 'Start a new message or create a group'}
              </div>
            </div>
          ) : (
            <>
              {/* ── Direct Messages section ── */}
              {filteredDMs.length > 0 && (
                <>
                  <div className="sb-section-header">
                    <button
                      className="sb-section-toggle"
                      onClick={() => setDmExpanded(v => !v)}
                      aria-expanded={dmExpanded}
                    >
                      <ChevronDown size={12} className={`sb-section-chevron ${dmExpanded ? '' : 'collapsed'}`}/>
                      <MessageCircle size={12}/>
                      <span>Direct messages</span>
                      <span className="sb-section-count">{filteredDMs.length}</span>
                    </button>
                    <button
                      className="sb-section-add"
                      title="New direct message"
                      onClick={() => { setCreateTab('dm'); setShowCreate(true) }}
                    >
                      <Plus size={12}/>
                    </button>
                  </div>
                  {dmExpanded && filteredDMs.map(r => (
                    <ConversationRow
                      key={r.roomId}
                      room={r}
                      active={activeRoomId === r.roomId}
                      unread={unreadCounts[r.roomId] || 0}
                      onClick={() => handleRoomClick(r.roomId)}
                    />
                  ))}
                </>
              )}

              {/* ── Groups section ── */}
              {filteredGroups.length > 0 && (
                <>
                  <div className={`sb-section-header ${filteredDMs.length > 0 ? 'has-top-border' : ''}`}>
                    <button
                      className="sb-section-toggle"
                      onClick={() => setGroupExpanded(v => !v)}
                      aria-expanded={groupExpanded}
                    >
                      <ChevronDown size={12} className={`sb-section-chevron ${groupExpanded ? '' : 'collapsed'}`}/>
                      <Users size={12}/>
                      <span>Groups</span>
                      <span className="sb-section-count">{filteredGroups.length}</span>
                    </button>
                    <button
                      className="sb-section-add"
                      title="New group"
                      onClick={() => { setCreateTab('group'); setShowCreate(true) }}
                    >
                      <Plus size={12}/>
                    </button>
                  </div>
                  {groupExpanded && filteredGroups.map(r => (
                    <ConversationRow
                      key={r.roomId}
                      room={r}
                      active={activeRoomId === r.roomId}
                      unread={unreadCounts[r.roomId] || 0}
                      onClick={() => handleRoomClick(r.roomId)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer: avatar (click = status picker) + user info (click = profile) */}
        <div className="sb-footer">
          <div className="sb-user-card">
            <div className="sb-status-wrap">
              <button
                className="sb-status-trigger"
                onClick={() => setStatusPickerOpen(v => !v)}
                title="Set status"
                aria-expanded={statusPickerOpen}
              >
                <div className="sb-user-av-wrap">
                  <Avatar src={user?.avatarUrl} name={user?.username || '?'} className="sb-user-av" />
                  <span className={`sb-user-dot ${dotClass}`} title={dotClass === 'off' ? 'Connecting…' : STATUS_OPTIONS.find(o => o.cls === dotClass)?.label || 'Online'}/>
                </div>
              </button>
              {statusPickerOpen && (
                <>
                  <div className="sb-status-backdrop" onClick={() => setStatusPickerOpen(false)} />
                  <div className="sb-status-picker scale-in">
                    <div className="sb-status-picker-title">Set status</div>
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        className={`sb-status-option ${userStatus === opt.value ? 'active' : ''}`}
                        onClick={() => handleStatusChange(opt.value)}
                      >
                        <span className={`sb-status-dot ${opt.cls}`} />
                        {opt.label}
                        {userStatus === opt.value && <Check size={13} style={{ marginLeft: 'auto', flexShrink: 0 }}/>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button className="sb-user-info-btn" onClick={() => setShowProfile(true)}>
                <div className="sb-user-name">{user?.fullName || user?.username || 'You'}</div>
                <div className="sb-user-handle">@{user?.username}</div>
              </button>
              <button className="sb-status-text-btn" onClick={() => setStatusPickerOpen(v => !v)} title="Set status">
                <span className={`sb-status-dot ${dotClass}`}/>
                {STATUS_OPTIONS.find(o => o.value === userStatus)?.label || 'Online'}
                {isAutoAway && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 2 }}>(auto)</span>}
              </button>
            </div>
          </div>
        </div>

        {/* Show "Upgrade to Premium" for FREE users, or a "Premium" badge for subscribers */}
        {!hasProSubscription && (
          <button className="sb-upgrade-btn" onClick={openUpgradeModal}>
            <Zap size={14}/> Upgrade to Premium
          </button>
        )}
        {hasProSubscription && (
          <button className="sb-pro-badge" onClick={() => setShowProBenefits(true)} title="View Premium benefits">
            <Zap size={12}/> ConnectHub Premium
          </button>
        )}
      </div>

      {showCreate && <CreateRoomModal initialTab={createTab} onClose={() => setShowCreate(false)} />}
      {showProfile && <ProfilePanel onClose={() => setShowProfile(false)} />}
      <UpgradeModal isOpen={upgradeModalOpen} onClose={closeUpgradeModal} />
      {showProBenefits && createPortal(
        <div className="upgrade-overlay" onClick={() => setShowProBenefits(false)}>
          <div className="upgrade-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="upgrade-close" onClick={() => setShowProBenefits(false)}><X size={18}/></button>
            <div className="upgrade-hero">
              <div className="upgrade-icon-wrap"><Zap size={28} className="upgrade-icon"/></div>
              <h2 className="upgrade-title">You're on ConnectHub Premium</h2>
              <p className="upgrade-sub">Here's what's included in your plan:</p>
            </div>
            <ul className="upgrade-features">
              {[
                '30 messages/min (5× free limit)',
                '10 GB media storage',
                'Unlimited group chats',
                '30 media uploads/min',
                'Message history forever',
                'Priority support',
              ].map(f => (
                <li key={f}><Check size={14} className="upgrade-check"/>{f}</li>
              ))}
            </ul>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/*
 * ConversationRow — a single clickable entry in the room list.
 *
 * For DM rooms, this component fetches the other user's profile to display
 * their name and show an online dot. The fetch is cancelled if the component
 * unmounts (via the `cancelled` flag) to avoid setting state on an unmounted component.
 *
 * Props:
 *   room   — the room object from chatStore
 *   active — whether this is the currently open room (highlights the row)
 *   unread — number of unread messages (shows as a red badge)
 *   onClick — called when the row is clicked
 */
/*
 * SidebarTick — delivery status icon for the last message in a conversation row.
 * Only shown when the current user sent the last message.
 */
function SidebarTick({ status, readBy, roomMembers, userId }) {
  const others = (roomMembers || []).filter(m => m.userId !== userId)
  const allRead = others.length > 0 && others.every(m => (readBy || []).includes(m.userId))
  const effective = allRead || status === 'READ' ? 'READ' : (status || 'SENT')

  const style = { display: 'inline-flex', alignItems: 'center', marginRight: 3, flexShrink: 0 }
  if (effective === 'READ')
    return <span style={{ ...style, color: 'var(--accent)' }}><CheckCheck size={13}/></span>
  if (effective === 'DELIVERED')
    return <span style={{ ...style, color: 'var(--text-muted)' }}><CheckCheck size={13}/></span>
  return <span style={{ ...style, color: 'var(--text-muted)' }}><Check size={13}/></span>
}

const ConversationRow = memo(function ConversationRow({ room, active, unread, onClick }) {
  const { user } = useAuthStore()
  const { messages, onlineUsers, presenceStatuses, members: allMembers } = useChatStore()
  const cachedMembers = allMembers[room.roomId]
  const isDM = room.type === 'DM'

  /*
   * For DM rooms, resolve the other user's display name.
   * The room name stored in the database is "DM-<otherUsername>", so we strip the prefix
   * as an initial guess. Then we fetch the member list to get the full profile.
   * Uses cached members from chatStore if already loaded to avoid redundant API calls.
   */
  const [dmName, setDmName] = useState(() =>
    room.name?.startsWith('DM-') ? room.name.substring(3) : (room.name || 'Direct message')
  )
  const [dmOtherId, setDmOtherId] = useState(null)
  const [dmAvatarUrl, setDmAvatarUrl] = useState(null)

  useEffect(() => {
    if (!isDM) return
    let cancelled = false
    const resolve = async () => {
      try {
        let list = cachedMembers
        if (!list) {
          const raw = await api.getRoomMembers(room.roomId)
          list = await enrichRoomMembers(raw)
        }
        const other = list.find(m => m.userId !== user.userId)
        if (!cancelled && other) {
          setDmName(other.fullName || other.username || `User ${other.userId}`)
          setDmOtherId(other.userId)
          setDmAvatarUrl(other.avatarUrl)
        }
      } catch {}
    }
    resolve()
    return () => { cancelled = true }
  }, [isDM, room.roomId, user?.userId, cachedMembers])

  const name = isDM ? dmName : (room.name || 'Conversation')
  const initial = (name || '?').charAt(0).toUpperCase()

  /*
   * Build the message preview text shown under the room name.
   * Shows "📷 Photo" or "📎 File" for media messages.
   * Decodes HTML entities (&amp; &lt; etc.) in text messages.
   * Falls back to the room description or a placeholder for empty rooms.
   */
  const roomMsgs = messages[room.roomId] || []
  const lastMsg = roomMsgs[roomMsgs.length - 1]
  /* Use messages from store if available, fall back to lastMessagePreview stored
   * on the room object (populated by the backend when each message is sent). */
  const preview = lastMsg
    ? (lastMsg.isDeleted ? 'Message deleted'
      : lastMsg.type === 'IMAGE' ? '📷 Photo'
      : lastMsg.type === 'FILE' ? '📎 File'
      : decodeHtml(lastMsg.content || ''))
    : decodeHtml(room.lastMessagePreview || '')
      || (unread > 0 ? 'New message' : (isDM ? 'Start a conversation' : (room.description || (room.isPrivate ? 'Private group' : 'Public group'))))

  /* Build the relative time label from the last message or room's lastMessageAt */
  const ts = lastMsg?.sentAt || lastMsg?.timestamp || room.lastMessageAt
  const parseTs = (s) => typeof s === 'number' ? new Date(s)
    : new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z')
  const timeLabel = ts ? formatRelative(parseTs(ts)) : ''

  /* For DMs, show a status dot reflecting the other user's presence status */
  const isOtherOnline = isDM && dmOtherId && onlineUsers.has(dmOtherId)
  const otherStatus = isDM && dmOtherId ? (presenceStatuses[dmOtherId] || (isOtherOnline ? 'ONLINE' : null)) : null
  // Dot class: null → no dot, else colored by status
  const dotStatusClass = otherStatus === 'AWAY' ? 'away'
    : otherStatus === 'DND' ? 'dnd'
    : otherStatus === 'INVISIBLE' ? null // invisible users appear offline
    : otherStatus === 'ONLINE' ? '' // default green
    : null

  /* Delivery ticks — only for our own last message */
  const isOwnLastMsg = lastMsg && lastMsg.senderId === user?.userId
  const roomMembers = cachedMembers || []

  return (
    <button
      className={`sb-row ${active ? 'active' : ''} ${unread ? 'has-unread' : ''}`}
      onClick={onClick}
    >
      <div className="sb-row-av-wrap">
        {isDM ? (
          <Avatar src={dmAvatarUrl} name={name} className="sb-row-av" />
        ) : (
          <div className="sb-row-av group">
            {room.isPrivate ? <Lock size={15}/> : <Hash size={15}/>}
          </div>
        )}
        {dotStatusClass !== null && <span className={`sb-row-dot ${dotStatusClass}`}/>}
      </div>
      <div className="sb-row-body">
        <div className="sb-row-top">
          <span className="sb-row-name">{name}</span>
          {timeLabel && <span className="sb-row-time">{timeLabel}</span>}
        </div>
        <div className="sb-row-bottom">
          <span className="sb-row-preview">
            <span className="sb-row-preview-text">{preview}</span>
          </span>
          {unread > 0 && <span className="sb-row-badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
})

/*
 * formatRelative(date) — returns a human-readable relative time string.
 *   Today     → "10:34 AM"  (exact time)
 *   Yesterday → "Yesterday"
 *   < 7 days  → "3 days ago"
 *   Older     → "Jan 5"  (month + day)
 */
function formatRelative(date) {
  if (isToday(date)) return format(date, 'h:mm a')
  if (isYesterday(date)) return 'Yesterday'
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 7) return `${days} days ago`
  return format(date, 'MMM d')
}
