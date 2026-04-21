/*
 * ChatArea.jsx — Right Panel: Message List, Input, and Conversation Info
 *
 * Purpose:
 *   The main chat panel shown when the user selects a room. It handles:
 *   1. Loading the initial 50 messages from the REST API on room open
 *   2. Subscribing to real-time WebSocket events (new messages, typing, edits, reactions)
 *   3. Infinite scroll upward — loading older messages when the user scrolls to the top
 *   4. Sending messages, edits, deletes, and read receipts via WebSocket
 *   5. Rendering the conversation header, message list, typing indicator, and input bar
 *   6. A right-side info panel showing member list or DM contact info
 *
 * Message grouping:
 *   Messages are grouped by calendar day (day separators: "Today", "Yesterday", "Monday, Jan 5").
 *   Within a day, consecutive messages from the same sender within 5 minutes are "clustered" —
 *   only the first message in a cluster shows the sender's avatar (showAvatar=true).
 *
 * Scroll behavior:
 *   - On room open: instantly scrolls to the bottom to show the latest messages.
 *   - When a new WebSocket message arrives: auto-scrolls if the user is already near the bottom.
 *   - When the user scrolls up near the top: triggers loadMore() for infinite scroll pagination.
 *   - A "scroll to bottom" button appears when the user has scrolled up far enough.
 *
 * Props:
 *   wsConnected (boolean) — used to decide whether to subscribe to WebSocket room events
 *
 * Sub-components in this file:
 *   SkeletonRow   — placeholder rows shown while messages are loading
 *   DaySeparator  — the "Today" / "Yesterday" / date divider between message groups
 */
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { api } from '../../services/api'
import { ws } from '../../services/websocket'
import MessageBubble, { decodeHtml } from './MessageBubble'
import MessageInput from './MessageInput'
import TypingIndicator from './TypingIndicator'
import MessageSearch from './MessageSearch'
import RoomSettingsPanel from './RoomSettingsPanel'

import MediaGallery from './MediaGallery'
import { enrichRoomMembers, getMemberDisplay } from '../../utils/roomMembers'
import {
  Menu, Info, Search, ArrowDown,
  Hash, Lock, Settings, Pin, Users, X, Loader2, Image as ImageIcon
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import './ChatArea.css'

/*
 * SkeletonRow — animated placeholder shown while the message list is loading.
 * The `own` prop mirrors the layout of sent vs received messages for a realistic skeleton.
 */
function SkeletonRow({ own }) {
  return (
    <div className={`sk-row ${own ? 'own' : ''}`}>
      {!own && <div className="skeleton sk-av-circle"/>}
      <div className={`skeleton sk-bubble ${own ? 'own' : ''}`}/>
      {own && <div className="skeleton sk-av-circle"/>}
    </div>
  )
}

/*
 * DaySeparator — a horizontal rule with a date label between message groups.
 * Shows "Today", "Yesterday", or the full weekday + date for older messages.
 */
function DaySeparator({ date }) {
  const label = isToday(date) ? 'Today'
    : isYesterday(date) ? 'Yesterday'
    : format(date, 'EEEE, MMMM d')
  return (
    <div className="day-sep">
      <span className="day-sep-label">{label}</span>
    </div>
  )
}

export default function ChatArea({ wsConnected }) {
  const { user } = useAuthStore()
  const {
    activeRoomId, rooms, messages, setMessages, addMessage, prependMessages,
    editMessage, deleteMessage, setTyping, clearTyping, setMembers, members,
    incrementUnread, clearUnread, toggleSidebar, typingUsers, applyReactionEvent,
    onlineUsers, markMessagesRead, updateDeliveryStatus,
  } = useChatStore()

  const room = rooms.find(r => r.roomId === activeRoomId)
  const roomMessages = messages[activeRoomId] || []
  const roomTyping = typingUsers[activeRoomId] || {}
  const roomMembers = members[activeRoomId] || []

  /*
   * For DM rooms: resolve the name and identity of the other participant.
   * This drives the avatar color, the header name, and the online dot in the header.
   */
  let headerName = room?.name || 'Chat'
  let otherMember = null
  if (room?.type === 'DM') {
    otherMember = roomMembers.find(m => m.userId !== user?.userId)
    if (otherMember) headerName = otherMember.fullName || otherMember.username || `User ${otherMember.userId}`
    else if (room.name?.startsWith('DM-')) headerName = room.name.substring(3)
  }

  /* Consistent avatar color derived from the room name's first character */
  const initial = (headerName || '?').charAt(0).toUpperCase()
  const palette = ['#FF8E72','#7AC9A7','#B8A4F4','#FFB547','#6BCEEA','#F47174']
  const avColor = palette[(headerName.charCodeAt(0) || 0) % palette.length]

  /* Online status for the DM header subtitle and info panel */
  const isOtherOnline = otherMember && onlineUsers.has(otherMember.userId)
  const typingEntries = Object.entries(roomTyping).filter(([id]) => String(id) !== String(user?.userId))

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showRoomSettings, setShowRoomSettings] = useState(false)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [pinnedMsg, setPinnedMsg] = useState(null)
  const [toast, setToast] = useState(null)
  const [showMediaGallery, setShowMediaGallery] = useState(false)

  /* showToast — shows a temporary status message at the top of the chat area for 2.5 seconds */
  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2500)
  }

  /*
   * Keyboard shortcuts:
   *   Escape    — cancel reply, close search/settings/info panels
   *   Ctrl+F    — toggle message search
   */
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setReplyTo(null); setShowSearch(false); setShowRoomSettings(false)
        setShowInfoPanel(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); setShowSearch(s => !s)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  /*
   * Room change effect — runs when the active room changes.
   * 1. Fetches the last 50 messages from the REST API (newest first, reversed for display).
   * 2. Fetches and enriches the member list (adds names/avatars from auth-service).
   * 3. Finds any pinned message to show in the pinned bar at the top.
   * 4. Scrolls to the bottom once loaded.
   * 5. Sends a read receipt for the last message so the sender sees the double-tick.
   * 6. Marks the room as read in the room-service for accurate unread count tracking.
   */
  useEffect(() => {
    if (!activeRoomId) return
    setLoading(true)
    setPinnedMsg(null)
    Promise.all([
      api.getMessages(activeRoomId),
      api.getRoomMembers(activeRoomId).then(enrichRoomMembers)
    ]).then(([msgs, mems]) => {
      const list = msgs.content || msgs
      const arr = Array.isArray(list) ? [...list].reverse() : []
      setMessages(activeRoomId, arr)
      setMembers(activeRoomId, mems)
      setHasMore(arr.length >= 50)
      const pinned = arr.find(m => m.isPinned)
      if (pinned) setPinnedMsg(pinned)
      setTimeout(() => scrollToBottom('auto'), 50)
      if (arr.length > 0) {
        const lastMsg = arr[arr.length - 1]
        if (lastMsg.messageId && lastMsg.senderId !== user?.userId) {
          ws.sendReadReceipt(activeRoomId, lastMsg.messageId)
        }
      }
      api.markRoomRead(activeRoomId, user?.userId).catch(() => {})
    }).catch(console.error).finally(() => setLoading(false))
    clearUnread(activeRoomId)
  }, [activeRoomId])

  /*
   * WebSocket room subscription effect — runs when wsConnected or activeRoomId changes.
   * Subscribes to all real-time events for the current room:
   *
   * onMessage  — adds the new message to the store; sends a read receipt if tab is visible
   * onTyping   — shows/clears the typing indicator; auto-expires after 4 seconds
   * onRead     — updates the read/delivery status of messages (shows double-tick indicator)
   * onEdit     — updates the message text in-place
   * onDelete   — removes the message from the list
   * onReaction — applies the ADD/REMOVE reaction delta to the central reactions store
   *
   * Cleanup: unsubscribes from the room when the component unmounts or the room changes.
   */
  useEffect(() => {
    if (!wsConnected || !activeRoomId) return
    ws.subscribeToRoom(activeRoomId, {
      onMessage: (msg) => {
        addMessage(activeRoomId, msg)
        if (isNearBottom()) setTimeout(() => scrollToBottom(), 50)
        if (msg.senderId !== user.userId && !document.hidden && msg.messageId) {
          ws.sendReadReceipt(activeRoomId, msg.messageId)
        }
      },
      onTyping: (data) => {
        if (data.senderId === user.userId) return
        if (data.typing) {
          setTyping(activeRoomId, data.senderId, data.senderUsername || 'Someone')
          setTimeout(() => clearTyping(activeRoomId, data.senderId), 4000)
        } else {
          clearTyping(activeRoomId, data.senderId)
        }
      },
      onRead: (data) => {
        if (data.readerId && data.readerId !== user.userId) {
          if (data.messageId) updateDeliveryStatus(activeRoomId, data.messageId, 'READ', data.readerId)
          else markMessagesRead(activeRoomId, data.readerId, data.upToMessageId)
        }
      },
      onEdit: (data) => editMessage(activeRoomId, data.messageId, data.newContent),
      onDelete: (data) => deleteMessage(activeRoomId, data.messageId),
      onReaction: (data) => {
        if (data.messageId && data.senderId != null && data.emoji)
          applyReactionEvent(data.messageId, data.senderId, data.emoji, data.action || 'ADD')
      },
    })
    return () => ws.unsubscribeFromRoom(activeRoomId)
  }, [wsConnected, activeRoomId])

  /* scrollToBottom — scrolls the message list to the last message */
  const scrollToBottom = (behavior = 'smooth') =>
    messagesEndRef.current?.scrollIntoView({ behavior })

  /* isNearBottom — true if the user is within 180px of the bottom of the scroll container */
  const isNearBottom = () => {
    const el = messagesContainerRef.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 180
  }

  /*
   * handleScroll — called on every scroll event.
   * Shows/hides the "jump to bottom" button.
   * Triggers loadMore() when the user scrolls within 80px of the top.
   */
  const handleScroll = () => {
    const el = messagesContainerRef.current
    if (!el) return
    setShowScrollBtn(!isNearBottom())
    if (el.scrollTop < 80 && hasMore && !loadingMore) loadMore()
  }

  /*
   * loadMore — fetches the next page of older messages.
   * Uses the sentAt timestamp of the oldest currently-loaded message as the `before` cursor.
   * After prepending the older messages, restores the scroll position using a requestAnimationFrame
   * so the user doesn't see the view jump to the top.
   */
  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    const msgs = messages[activeRoomId] || []
    if (!msgs.length) return
    setLoadingMore(true)
    try {
      const older = await api.getMessages(activeRoomId, msgs[0].sentAt)
      const list = older.content || older
      if (list.length < 50) setHasMore(false)
      if (list.length > 0) {
        const el = messagesContainerRef.current
        const prevH = el.scrollHeight
        prependMessages(activeRoomId, [...list].reverse())
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevH })
      }
    } catch (e) { console.error(e) }
    finally { setLoadingMore(false) }
  }

  /*
   * handleSend — sends a new message via WebSocket.
   * The content, type (TEXT/IMAGE/FILE), and optional mediaUrl are passed from MessageInput.
   * If the WebSocket is disconnected, shows an error toast.
   */
  const handleSend = (content, type = 'TEXT', mediaUrl = null) => {
    const sent = ws.sendMessage(activeRoomId, content, type, replyTo?.messageId, mediaUrl)
    setReplyTo(null)
    if (!sent) showToast('Reconnecting… message not sent', 'err')
  }

  /*
   * handleEdit — saves a message edit via both REST and WebSocket.
   * The REST call persists it to the database. The WebSocket publish broadcasts
   * the change to all other room members instantly.
   */
  const handleEdit = async (msg, newContent) => {
    try {
      await api.editMessage(msg.messageId, newContent)
      ws.sendEdit(activeRoomId, msg.messageId, newContent)
      showToast('Message edited')
    } catch (e) { console.error('Edit failed:', e); showToast('Edit failed', 'err') }
  }

  /* handleDelete — deletes a message via REST + broadcasts via WebSocket */
  const handleDelete = async (msg) => {
    try {
      await api.deleteMessage(msg.messageId)
      ws.sendDelete(activeRoomId, msg.messageId)
      showToast('Message deleted')
    } catch (e) { console.error('Delete failed:', e); showToast('Delete failed', 'err') }
  }

  /*
   * Group messages by day and determine cluster boundaries.
   * A new cluster starts when:
   *   - The sender changes, OR
   *   - More than 5 minutes have passed since the previous message
   * Only the first message in a cluster gets showAvatar=true.
   */
  const groupedMessages = []
  let lastDate = null
  roomMessages.forEach((msg, i) => {
    const msgDate = msg.sentAt ? new Date(msg.sentAt)
      : msg.timestamp ? new Date(msg.timestamp)
      : new Date()
    const dateStr = format(msgDate, 'yyyy-MM-dd')
    if (dateStr !== lastDate) {
      groupedMessages.push({ type: 'separator', date: msgDate, key: `sep-${dateStr}` })
      lastDate = dateStr
    }
    const prev = roomMessages[i - 1]
    const prevTime = prev?.sentAt ? new Date(prev.sentAt).getTime()
      : prev?.timestamp ? new Date(prev.timestamp).getTime() : 0
    const msgTime = msgDate.getTime()
    const newCluster = !prev || prev.senderId !== msg.senderId || (msgTime - prevTime > 300000)
    groupedMessages.push({
      type: 'message', msg, showAvatar: newCluster,
      key: msg.messageId || `msg-${i}-${msgTime}`
    })
  })

  /*
   * subtitle — the text shown below the room name in the header.
   * For DMs: "typing..." → "Active now" → "Offline"
   * For groups: "N members" (+ " · typing..." if someone is typing)
   */
  const subtitle = room?.type === 'DM'
    ? (typingEntries.length > 0 ? 'typing…'
      : isOtherOnline ? 'Active now'
      : 'Offline')
    : `${roomMembers.length} members${typingEntries.length > 0 ? ' · typing…' : ''}`

  return (
    <div className="ca clay-lg">
      {/* Temporary status toast — "Message edited", "Upload failed", etc. */}
      {toast && (
        <div className={`toast ${toast.kind === 'err' ? 'toast-err' : ''}`}>
          <span className="toast-dot"/> {toast.msg}
        </div>
      )}

      {/* Chat header: hamburger (mobile), avatar, name + subtitle, search + info buttons */}
      <header className="ca-head">
        <button className="icon-btn ca-menu-btn" onClick={toggleSidebar} title="Menu">
          <Menu size={20}/>
        </button>

        <div className="ca-head-av-wrap">
          {room?.type === 'DM' ? (
            <div className="ca-head-av" style={{ background: avColor }}>
              {initial}
              {isOtherOnline && <span className="ca-head-av-dot"/>}
            </div>
          ) : (
            <div className="ca-head-av group">
              {room?.isPrivate ? <Lock size={18}/> : <Hash size={18}/>}
            </div>
          )}
        </div>

        <div className="ca-head-body">
          <h2 className="ca-head-title">{headerName}</h2>
          <span className={`ca-head-sub ${isOtherOnline ? 'online' : ''} ${typingEntries.length > 0 ? 'typing' : ''}`}>
            {subtitle}
          </span>
        </div>

        <div className="ca-head-actions">
          <button
            className={`ca-action-btn ${showSearch ? 'active' : ''}`}
            onClick={() => setShowSearch(s => !s)}
            title="Search (Ctrl+F)"
          >
            <Search size={18}/>
          </button>

          <button
            className={`ca-action-btn ${showInfoPanel ? 'active' : ''}`}
            onClick={() => setShowInfoPanel(s => !s)}
            title="Conversation info"
          >
            <Info size={18}/>
          </button>
        </div>
      </header>

      {/* Message search bar — slides in below the header when Search is clicked */}
      {showSearch && <MessageSearch roomId={activeRoomId} onClose={() => setShowSearch(false)} />}

      {/* Pinned message bar — shown when a room has a pinned message */}
      {pinnedMsg && !showSearch && (
        <div className="pinned-bar">
          <Pin size={13}/>
          <span className="pinned-label">Pinned</span>
          <span className="pinned-text">
            {decodeHtml(pinnedMsg.content?.slice(0, 100))}{pinnedMsg.content?.length > 100 ? '…' : ''}
          </span>
        </div>
      )}

      <div className="ca-body">
        <div className="ca-main">
          {/* Scrollable message list */}
          <div className="ca-scroll" ref={messagesContainerRef} onScroll={handleScroll}>
            {loadingMore && (
              <div className="ca-loading-more">
                <Loader2 size={14} className="spin"/> Loading older messages…
              </div>
            )}

            {loading ? (
              /* Skeleton placeholders while loading */
              <div className="ca-sk-list">
                <SkeletonRow/>
                <SkeletonRow own/>
                <SkeletonRow/>
                <SkeletonRow/>
                <SkeletonRow own/>
              </div>
            ) : roomMessages.length === 0 ? (
              /* Empty room state */
              <div className="ca-empty">
                <div className="ca-empty-badge">💬</div>
                <div className="ca-empty-title">No messages yet</div>
                <div className="ca-empty-sub">Be the first to say hello!</div>
              </div>
            ) : (
              /* Render day separators and message bubbles */
              groupedMessages.map(item => {
                if (item.type === 'separator')
                  return <DaySeparator key={item.key} date={item.date} />
                return (
                  <MessageBubble
                    key={item.key}
                    message={item.msg}
                    roomId={activeRoomId}
                    isOwn={item.msg.senderId === user?.userId}
                    showAvatar={item.showAvatar}
                    onReply={() => setReplyTo(item.msg)}
                    onEdit={(content) => handleEdit(item.msg, content)}
                    onDelete={() => handleDelete(item.msg)}
                  />
                )
              })
            )}
            {/* Invisible anchor at the bottom — scrollToBottom() targets this */}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing indicator shown below the message list */}
          {typingEntries.length > 0 && (
            <TypingIndicator users={typingEntries.map(([, v]) => v.username)} />
          )}

          {/* Jump-to-bottom button — visible when scrolled up */}
          {showScrollBtn && (
            <button className="ca-scroll-btn" onClick={() => scrollToBottom()} title="Scroll to latest">
              <ArrowDown size={18}/>
            </button>
          )}

          {/* Reply preview bar — shown above the input when replying to a message */}
          {replyTo && (() => {
            const rm = roomMembers.find(m => m.userId === replyTo.senderId)
            const rName = rm?.fullName || rm?.username || replyTo.senderUsername || `User #${replyTo.senderId}`
            const firstLine = replyTo.content?.split('\n')[0] || ''
            return (
              <div className="ca-reply-preview">
                <div className="ca-reply-bar"/>
                <div className="ca-reply-body">
                  <span className="ca-reply-author">Replying to {rName}</span>
                  <span className="ca-reply-text">
                    {decodeHtml(firstLine.slice(0, 80))}
                    {firstLine.length > 80 || replyTo.content?.includes('\n') ? '…' : ''}
                  </span>
                </div>
                <button className="icon-btn" onClick={() => setReplyTo(null)} title="Cancel reply">
                  <X size={16}/>
                </button>
              </div>
            )
          })()}

          <MessageInput onSend={handleSend} roomId={activeRoomId} />
        </div>

        {/* Right-side info panel — member list for groups, contact info for DMs */}
        {showInfoPanel && (
          <aside className="ca-info-panel">
            <div className="ca-info-head">
              <h3>{room?.type === 'DM' ? 'Contact info' : `Members (${roomMembers.length})`}</h3>
              <button className="icon-btn" onClick={() => setShowInfoPanel(false)} title="Close">
                <X size={16}/>
              </button>
            </div>

            {room?.type === 'DM' && otherMember ? (
              /* DM contact info: avatar, name, online status, email, phone, settings button */
              <div className="ca-info-dm">
                <div className="ca-info-dm-av" style={{ background: avColor }}>
                  {initial}
                  {isOtherOnline && <span className="ca-head-av-dot"/>}
                </div>
                <div className="ca-info-dm-name">{headerName}</div>
                <div className="ca-info-dm-handle">@{otherMember.username}</div>
                <div className="ca-info-dm-status">
                  <span className={`ca-status-pill ${isOtherOnline ? 'on' : 'off'}`}>
                    {isOtherOnline ? 'Active now' : 'Offline'}
                  </span>
                </div>
                {otherMember.email && (
                  <div className="ca-info-field">
                    <span className="ca-info-label">Email</span>
                    <span className="ca-info-value">{otherMember.email}</span>
                  </div>
                )}
                {otherMember.phoneNumber && (
                  <div className="ca-info-field">
                    <span className="ca-info-label">Phone</span>
                    <span className="ca-info-value">{otherMember.phoneNumber}</span>
                  </div>
                )}

                <button
                  className="btn btn-ghost btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowRoomSettings(true)}
                >
                  <Settings size={14}/> Conversation settings
                </button>
                <button
                  className="btn btn-ghost btn-block"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowMediaGallery(true)}
                >
                  <ImageIcon size={14}/> View shared media
                </button>
              </div>
            ) : (
              /* Group member list: sorted admin-first, then current user, then alphabetical */
              <>
                <div className="ca-info-members">
                  {[...roomMembers].sort((a, b) => {
                    const prio = (m) => m.role === 'ADMIN' ? 1 : (m.userId === user?.userId ? 2 : 3)
                    const d = prio(a) - prio(b); if (d) return d
                    return (a.fullName || a.username || '').localeCompare(b.fullName || b.username || '')
                  }).map(m => {
                    const disp = getMemberDisplay(m)
                    const isYou = m.userId === user?.userId
                    const nameDisp = isYou ? 'You' : disp.primary
                    const isOnline = onlineUsers.has(m.userId) || m.status === 'ONLINE'
                    const mColor = palette[(String(disp.primary).charCodeAt(0) || 0) % palette.length]
                    return (
                      <div key={m.userId || m.id} className="ca-member-row">
                        <div className="ca-member-av" style={{ background: mColor }}>
                          {(nameDisp[0] || '?').toUpperCase()}
                          <span className={`ca-member-dot ${isOnline ? 'on' : 'off'}`}/>
                        </div>
                        <div className="ca-member-info">
                          <div className="ca-member-name">
                            {nameDisp}
                            {m.role === 'ADMIN' && <span className="ca-member-badge">Admin</span>}
                          </div>
                          <div className="ca-member-sub">{disp.secondary}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <button
                  className="btn btn-ghost btn-block"
                  style={{ margin: '12px 16px 16px', width: 'calc(100% - 32px)' }}
                  onClick={() => setShowRoomSettings(true)}
                >
                  <Settings size={14}/> Channel settings
                </button>
                <button
                  className="btn btn-ghost btn-block"
                  style={{ margin: '8px 16px 16px', width: 'calc(100% - 32px)' }}
                  onClick={() => setShowMediaGallery(true)}
                >
                  <ImageIcon size={14}/> View shared media
                </button>
              </>
            )}
          </aside>
        )}
      </div>

      {showRoomSettings && <RoomSettingsPanel roomId={activeRoomId} onClose={() => setShowRoomSettings(false)} />}
      {showMediaGallery && <MediaGallery roomId={activeRoomId} onClose={() => setShowMediaGallery(false)} />}
    </div>
  )
}
