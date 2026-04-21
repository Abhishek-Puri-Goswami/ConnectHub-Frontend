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
 *   6. Upgrade CTA / PRO badge — shown based on subscription status
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
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { usePaymentStore } from '../../store/paymentStore'
import { api } from '../../services/api'
import { enrichRoomMembers } from '../../utils/roomMembers'
import {
  MessageCircle, Search, Plus, LogOut, Settings,
  Hash, Lock, MoreHorizontal, Users, X, Zap, Shield, CreditCard
} from 'lucide-react'
import { formatDistanceToNowStrict, isToday, isYesterday, format } from 'date-fns'
import CreateRoomModal from '../chat/CreateRoomModal'
import ProfilePanel from '../chat/ProfilePanel'
import ThemeToggle from '../../theme/ThemeToggle'
import UpgradeModal from '../chat/UpgradeModal'
import './Sidebar.css'

export default function Sidebar({ wsConnected }) {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const { rooms, activeRoomId, setActiveRoom, unreadCounts, closeSidebar } = useChatStore()
  const { subscription, upgradeModalOpen, openUpgradeModal, closeUpgradeModal } = usePaymentStore()
  const subscriptionStatus = (subscription?.status || '').toUpperCase()
  const hasProSubscription = subscription?.plan !== 'FREE' && !['CANCELLED', 'EXPIRED'].includes(subscriptionStatus)

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createTab, setCreateTab] = useState('dm')
  const [showProfile, setShowProfile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  /* Close the floating "more" menu when Escape is pressed */
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  /* Client-side filter — searches room name and description */
  const filtered = rooms.filter(r =>
    (r.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  )

  /* When clicking a room: activate it, clear its unread count, close mobile sidebar */
  const handleRoomClick = (roomId) => {
    setActiveRoom(roomId)
    useChatStore.getState().clearUnread(roomId)
    closeSidebar()
  }

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
                    <Settings size={14}/> Profile settings
                  </button>
                  {/* Admin panel link is only shown to users with the ADMIN role */}
                  {user?.role?.toUpperCase() === 'ADMIN' && (
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

        {/* Quick action buttons — open CreateRoomModal pre-set to DM or Group tab */}
        <div className="sb-actions">
          <button
            className="sb-action primary"
            onClick={() => { setCreateTab('dm'); setShowCreate(true) }}
          >
            <MessageCircle size={15}/> Message
          </button>
          <button
            className="sb-action"
            onClick={() => { setCreateTab('group'); setShowCreate(true) }}
          >
            <Plus size={15}/> Group
          </button>
        </div>

        {/* Conversation list — one row per room, or an empty state message */}
        <div className="sb-list">
          {filtered.length === 0 ? (
            <div className="sb-empty">
              <div className="sb-empty-badge">
                <MessageCircle size={24}/>
              </div>
              <div className="sb-empty-title">
                {search ? 'No conversations match' : 'No conversations yet'}
              </div>
              <div className="sb-empty-sub">
                {search ? 'Try a different keyword' : 'Start a new message or create a group'}
              </div>
            </div>
          ) : (
            filtered.map(r => (
              <ConversationRow
                key={r.roomId}
                room={r}
                active={activeRoomId === r.roomId}
                unread={unreadCounts[r.roomId] || 0}
                onClick={() => handleRoomClick(r.roomId)}
              />
            ))
          )}
        </div>

        {/* Footer: current user info with click-to-open profile panel */}
        <div className="sb-footer">
          <button className="sb-user" onClick={() => setShowProfile(true)}>
            <div className="sb-user-av">
              {user?.username?.[0]?.toUpperCase() || '?'}
              {/* Green dot = WebSocket connected (online), grey = not connected */}
              <span className={`sb-user-dot ${wsConnected ? 'on' : 'off'}`} title={wsConnected ? 'Online' : 'Connecting…'}/>
            </div>
            <div className="sb-user-info">
              <div className="sb-user-name">{user?.fullName || user?.username || 'You'}</div>
              <div className="sb-user-handle">@{user?.username}</div>
            </div>
          </button>
        </div>

        {/* Show "Upgrade to PRO" for FREE users, or a "PRO" badge for subscribers */}
        {!hasProSubscription && (
          <button className="sb-upgrade-btn" onClick={openUpgradeModal}>
            <Zap size={14}/> Upgrade to PRO
          </button>
        )}
        {hasProSubscription && (
          <div className="sb-pro-badge">
            <Zap size={12}/> ConnectHub PRO
          </div>
        )}

        <div className="sb-bottom-bar">
          <button className="sb-bottom-btn" onClick={() => setShowProfile(true)}>
            <Settings size={16}/> <span>Settings</span>
          </button>
          <button className="sb-bottom-btn danger" onClick={handleLogout}>
            <LogOut size={16}/> <span>Logout</span>
          </button>
        </div>
      </div>

      {showCreate && <CreateRoomModal initialTab={createTab} onClose={() => setShowCreate(false)} />}
      {showProfile && <ProfilePanel onClose={() => setShowProfile(false)} />}
      <UpgradeModal isOpen={upgradeModalOpen} onClose={closeUpgradeModal} />
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
function ConversationRow({ room, active, unread, onClick }) {
  const { user } = useAuthStore()
  const { messages, onlineUsers, members: allMembers } = useChatStore()
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
  const preview = lastMsg
    ? (lastMsg.type === 'IMAGE' ? '📷 Photo'
      : lastMsg.type === 'FILE' ? '📎 File'
      : (lastMsg.content || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    : (isDM ? 'Start a conversation' : (room.description || (room.isPrivate ? 'Private channel' : 'Public channel')))

  /* Build the relative time label from the last message or room's lastMessageAt */
  const ts = lastMsg?.sentAt || lastMsg?.timestamp || room.lastMessageAt
  const timeLabel = ts ? formatRelative(new Date(ts)) : ''

  /* For DMs, show an online dot if the other user is currently online */
  const isOtherOnline = isDM && dmOtherId && onlineUsers.has(dmOtherId)

  /* Deterministic color from room name — same room always gets same color */
  const colorPalette = ['#FF8E72','#7AC9A7','#B8A4F4','#FFB547','#6BCEEA','#F47174']
  const avColor = colorPalette[(name.charCodeAt(0) || 0) % colorPalette.length]

  return (
    <button
      className={`sb-row ${active ? 'active' : ''} ${unread ? 'has-unread' : ''}`}
      onClick={onClick}
    >
      <div className="sb-row-av-wrap">
        {isDM ? (
          <div className="sb-row-av" style={{ background: avColor }}>
            {initial}
          </div>
        ) : (
          <div className="sb-row-av group">
            {room.isPrivate ? <Lock size={15}/> : <Hash size={15}/>}
          </div>
        )}
        {isOtherOnline && <span className="sb-row-dot"/>}
      </div>
      <div className="sb-row-body">
        <div className="sb-row-top">
          <span className="sb-row-name">{name}</span>
          {timeLabel && <span className="sb-row-time">{timeLabel}</span>}
        </div>
        <div className="sb-row-bottom">
          <span className="sb-row-preview">{preview}</span>
          {unread > 0 && <span className="sb-row-badge">{unread > 99 ? '99+' : unread}</span>}
        </div>
      </div>
    </button>
  )
}

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
