/*
 * NotificationCenter.jsx — Notification Bell Dropdown
 *
 * Purpose:
 *   A bell icon button in the header that shows a badge with the unread notification count
 *   and, when clicked, opens a dropdown listing all notifications with their read/unread state.
 *
 * Notification types and icons:
 *   NEW_MESSAGE  → MessageCircle — someone sent a message in a room you're in
 *   MENTION      → AtSign       — someone @-mentioned you in a message
 *   ROOM_INVITE  → UserPlus     — you were added to a new room
 *   SYSTEM       → Bell         — system-level announcements
 *
 * How notifications are loaded and updated:
 *   1. On mount: fetches all notifications AND the unread count in parallel.
 *   2. Every 30 seconds: refreshes just the unread count (cheap poll to keep badge fresh).
 *   3. When the bell is clicked to OPEN the dropdown: re-fetches both to show latest data.
 *   4. Real-time updates: ChatLayout's ws.subscribeToNotifications() calls the store or
 *      re-fetches when a notification WebSocket event arrives (not handled here directly).
 *
 * Interaction:
 *   - Clicking an unread notification marks it as read (single mark-as-read API call).
 *   - The "Mark all read" button calls markAllNotifsRead() and clears all badges at once.
 *   - Clicking outside the dropdown (detected via a mousedown listener) closes it.
 *
 * This component is standalone — it manages its own local state (open, notifications,
 * unreadCount) rather than reading from a global store, because notification state is
 * only needed while this dropdown is mounted.
 */
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../services/api'
import { Bell, CheckCheck, MessageCircle, UserPlus, AtSign, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import './NotificationCenter.css'

const TYPE_ICONS = {
  NEW_MESSAGE: MessageCircle,
  MENTION: AtSign,
  ROOM_INVITE: UserPlus,
  SYSTEM: Bell,
}

export default function NotificationCenter() {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef()

  /*
   * On mount: load all notifications + unread count.
   * Set a 30-second interval to refresh just the count to keep the badge up to date
   * without polling the full notification list on every tick.
   */
  useEffect(() => {
    if (!user) return
    loadNotifications()
    const interval = setInterval(loadUnreadCount, 30000)
    return () => clearInterval(interval)
  }, [user?.userId])

  /*
   * Close the dropdown when clicking outside of it.
   * The mousedown event is used instead of click so it fires before the target
   * element's own click handler, preventing race conditions.
   */
  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  /* loadNotifications — fetches both full list and unread count in one round trip */
  const loadNotifications = async () => {
    try {
      const [notifs, count] = await Promise.all([
        api.getNotifications(user.userId),
        api.getUnreadCount(user.userId)
      ])
      setNotifications(notifs)
      setUnreadCount(count)
    } catch {}
  }

  /* loadUnreadCount — lightweight poll: only fetches the count, not the full list */
  const loadUnreadCount = async () => {
    try { setUnreadCount(await api.getUnreadCount(user.userId)) } catch {}
  }

  /*
   * handleMarkRead — marks one notification as read.
   * Updates the local list immediately (optimistic) and decrements the badge count.
   */
  const handleMarkRead = async (id) => {
    await api.markNotifRead(id)
    setNotifications(prev => prev.map(n => n.notificationId === id ? { ...n, isRead: true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  /* handleMarkAllRead — marks all notifications as read in one API call */
  const handleMarkAllRead = async () => {
    await api.markAllNotifsRead(user.userId)
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  /*
   * handleDelete — permanently removes a single notification.
   * Calls DELETE /notifications/{id} and removes it from the local list optimistically.
   * If the notification was unread, the badge count is decremented too.
   * stopPropagation prevents the parent row's onClick (mark-as-read) from also firing.
   */
  const handleDelete = async (e, id) => {
    e.stopPropagation()
    const notif = notifications.find(n => n.notificationId === id)
    try {
      await api.deleteNotif(id)
      setNotifications(prev => prev.filter(n => n.notificationId !== id))
      if (notif && !notif.isRead) setUnreadCount(c => Math.max(0, c - 1))
    } catch {}
  }

  return (
    <div className="nc-wrap" ref={ref}>
      {/* Bell button — shows badge with unread count if > 0 */}
      <button className="icon-btn nc-trigger" onClick={() => { setOpen(!open); if (!open) loadNotifications() }}>
        <Bell size={18}/>
        {unreadCount > 0 && <span className="nc-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {/* Dropdown panel — shown when open=true */}
      {open && (
        <div className="nc-dropdown clay-lg scale-in">
          <div className="nc-head">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button className="btn btn-ghost" onClick={handleMarkAllRead} style={{ fontSize: 11, padding: '4px 10px' }}>
                <CheckCheck size={13}/> Mark all read
              </button>
            )}
          </div>

          <div className="nc-list">
            {notifications.length === 0 ? (
              /* Empty state when there are no notifications yet */
              <div className="nc-empty">
                <Bell size={28}/>
                <p>Nothing here yet</p>
              </div>
            ) : notifications.map(n => {
              const Icon = TYPE_ICONS[n.type] || Bell
              return (
                /* Clicking an unread notification marks it as read */
                <div key={n.notificationId}
                  className={`nc-item ${n.isRead ? '' : 'unread'}`}
                  onClick={() => !n.isRead && handleMarkRead(n.notificationId)}>
                  <div className="nc-icon"><Icon size={16}/></div>
                  <div className="nc-content">
                    <div className="nc-title">{n.title || n.type}</div>
                    <div className="nc-message">{n.message}</div>
                    {/* Relative time: "2 minutes ago", "3 days ago" */}
                    <div className="nc-time">{n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : ''}</div>
                  </div>
                  {/* Blue dot indicator for unread notifications */}
                  {!n.isRead && <span className="nc-dot"/>}
                  {/* Delete button — permanently removes this notification */}
                  <button
                    className="nc-delete"
                    title="Delete notification"
                    onClick={(e) => handleDelete(e, n.notificationId)}
                  >
                    <X size={13}/>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
