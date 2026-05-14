/*
 * ChatLayout.jsx — Main Application Shell (Post-Login)
 *
 * Purpose:
 *   The root component rendered after a user logs in. It is responsible for:
 *   1. Connecting to the WebSocket server
 *   2. Loading the user's rooms and unread counts on startup
 *   3. Subscribing to real-time events (presence, personal messages, notifications)
 *   4. Sending periodic presence "ping" heartbeats
 *   5. Rendering the two-panel layout: Sidebar on the left, ChatArea on the right
 *
 * Layout structure:
 *   ┌──────────────────────────────────────────────┐
 *   │  Sidebar (room list)  │  ChatArea / EmptyState│
 *   └──────────────────────────────────────────────┘
 *   On mobile, the Sidebar overlays the ChatArea when sidebarOpen=true.
 *
 * WebSocket lifecycle:
 *   - ws.connect(token) is called once when the component mounts.
 *   - ws.onStateChange() registers a listener that updates the wsConnected flag,
 *     which is passed to Sidebar and ChatArea to show the connection status dot.
 *   - ws.subscribeToPresence() listens for online/offline events for all users.
 *   - ws.subscribeToPersonal() receives messages that are routed directly to this
 *     user — used to handle DMs where the user wasn't previously in the room list.
 *   - ws.subscribeToNotifications() receives server-pushed notifications (NEW_MESSAGE,
 *     ROOM_CREATED) so the unread counts and room list stay up to date.
 *   - On unmount (logout or tab close), setOffline is called and ws.disconnect() cleans up.
 *
 * Presence ping:
 *   A setInterval runs every 60 seconds calling api.ping(userId). This tells the
 *   presence-service the user is still active. If pings stop, the user goes offline
 *   after the TTL expires in Redis.
 */
import { useEffect, useRef, useState } from 'react'
import { useToastStore } from '../../store/toastStore'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { usePaymentStore } from '../../store/paymentStore'
import { usePresenceStore } from '../../store/presenceStore'
import { useIdleDetector } from '../../hooks/useIdleDetector'
import { api } from '../../services/api'
import { ws } from '../../services/websocket'
import { initForegroundListener } from '../../services/firebase'
import Sidebar from './Sidebar'
import ChatArea from '../chat/ChatArea'
import EmptyState from '../chat/EmptyState'
import RateLimitToast from '../chat/RateLimitToast'
import './ChatLayout.css'

export default function ChatLayout() {
  const { token, user } = useAuthStore()
  const { activeRoomId, setRooms, setOnline, setOffline, setPresenceStatus, sidebarOpen, closeSidebar } = useChatStore()
  const { fetchSubscription } = usePaymentStore()
  const [wsConnected, setWsConnected] = useState(false)
  const pingRef = useRef(null)

  // Idle detection: auto-AWAY after 5 min, restore on activity
  useIdleDetector(user?.userId)

  /*
   * FCM foreground listener — fires when a push message arrives while the tab
   * is open. Firebase suppresses the OS notification in this case, so we show
   * the content as an in-app toast instead so the user never misses it.
   * The unsubscribe function is returned from initForegroundListener and cleaned
   * up on unmount (or if the user logs out).
   */
  useEffect(() => {
    const unsubscribe = initForegroundListener((title, body) => {
      useToastStore.getState().addToast(`${title}: ${body}`, 'info', 6000)
    })
    return () => { if (unsubscribe) unsubscribe() }
  }, [])

  /*
   * Fetch the user's subscription tier once on login.
   * This populates paymentStore.subscription so the Sidebar can show the
   * "Upgrade" button or the plan badge, and so rate limits are applied correctly.
   * Also refreshes the user's own profile to ensure avatarUrl is always current.
   */
  useEffect(() => {
    if (user) {
      fetchSubscription()
      // Refresh profile in background — ensures avatarUrl from a previous session
      // or OAuth login is always hydrated into the store
      if (user.userId) {
        api.getProfile(user.userId)
          .then(profile => {
            if (profile) useAuthStore.getState().updateUser({
              avatarUrl: profile.avatarUrl || profile.avatar || profile.profilePicture || user.avatarUrl,
              fullName: profile.fullName || user.fullName,
              bio: profile.bio,
              phoneNumber: profile.phoneNumber,
            })
          })
          .catch(() => {})
      }
    }
  }, [user?.userId])

  /*
   * Main setup effect — runs once per login session.
   * Registers all WebSocket subscriptions and loads initial data.
   * The cleanup function disconnects cleanly when the user logs out.
   */
  useEffect(() => {
    if (!user) return

    // Hydrate the user's own presence status from the backend
    usePresenceStore.getState().initStatus(user.userId)

    /*
     * Listen for WebSocket connection state changes.
     * When connected, mark the user as online in the presence-service.
     * The wsConnected boolean is passed down to Sidebar and ChatArea to show
     * a green/grey dot indicating live connectivity.
     */
    const unsubscribeState = ws.onStateChange((connected) => {
      setWsConnected(connected)
      if (connected) api.setOnline(user.userId).catch(() => {})
    })

    /*
     * Load the initial room list from the room-service.
     * Sorts rooms by lastMessageAt so the most recently active room appears first.
     */
    Promise.all([
      api.getUserRooms(user.userId),
      api.getWsUnreadCounts(user.userId).catch(() => ({})),
    ]).then(([rooms, counts]) => {
      const sorted = rooms.sort((a, b) =>
        new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
      )
      setRooms(sorted)
      const state = useChatStore.getState()
      state.setUnreadCounts(counts)
      // The backend's async Feign call to update lastMessagePreview can fail silently,
      // leaving it null even for rooms that have messages. For any room that has ever
      // had a message (lastMessageAt is set) but no stored preview, fetch the last
      // message so the sidebar always shows real content regardless of read/unread state.
      sorted.forEach(room => {
        if (room.lastMessageAt && !room.lastMessagePreview) {
          api.getMessages(room.roomId, null, 1)
            .then(data => {
              const list = data.content || data
              const msg = Array.isArray(list) ? list[0] : null
              if (!msg || msg.isDeleted) return
              const preview = msg.type === 'IMAGE' ? '📷 Photo'
                : msg.type === 'FILE' ? '📎 File'
                : (() => {
                    try {
                      let t = (msg.content || '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'")
                      const doc = new DOMParser().parseFromString(t, 'text/html')
                      return (doc.documentElement.textContent || t).substring(0, 200)
                    } catch { return (msg.content || '').substring(0, 200) }
                  })()
              if (preview) state.updateRoomPreview(room.roomId, preview, msg.senderId)
            })
            .catch(() => {})
        }
      })
    }).catch(console.error)

    /*
     * Subscribe to global presence events.
     * When any user goes online or offline, update the onlineUsers Set in chatStore
     * so presence dots in the sidebar and member list update in real time.
     */
    ws.subscribeToPresence(p => {
      const status = (p.status || '').toUpperCase()
      // INVISIBLE users appear offline to others; ONLINE/AWAY/DND remain in the online set
      if (status === 'INVISIBLE' || status === 'OFFLINE' || (!status && !p.online)) {
        setOffline(p.userId)
      } else {
        setOnline(p.userId)
      }
      // Always store the precise status so UI can show AWAY/DND/INVISIBLE dots
      if (p.userId != null) setPresenceStatus(p.userId, status || (p.online ? 'ONLINE' : 'OFFLINE'))
    })

    /*
     * Subscribe to personal message queue.
     * This receives messages that are routed directly to this user — primarily used
     * when someone sends a DM to a room that doesn't yet appear in the user's sidebar.
     * If the incoming message is from a new room, we reload the room list to show it.
     * Also increments the unread count if the user isn't currently viewing that room.
     */
    ws.subscribeToPersonal(user.userId, (msg) => {
      const state = useChatStore.getState()
      if (msg.type === 'delivery-ack') {
        state.updateDeliveryStatus(msg.roomId, msg.messageId, msg.status)
        return
      }
      state.addMessage(msg.roomId, msg)

      /*
       * Keep the sidebar preview in sync whenever a message arrives on the personal
       * queue. subscribeToNotifications only fires for the offline Kafka path, so
       * online recipients who receive messages here would otherwise see a stale
       * "Start a conversation" preview until they refresh.
       */
      if (msg.senderId !== user.userId) {
        const preview = msg.type === 'IMAGE' ? '📷 Photo'
          : msg.type === 'FILE' ? '📎 File'
          : (msg.content || '').substring(0, 200)
        if (preview) state.updateRoomPreview(msg.roomId, preview, msg.senderId)
      }

      const roomExists = state.rooms.find(r => r.roomId === msg.roomId)
      if (!roomExists) {
        api.getUserRooms(user.userId)
          .then(rooms => state.setRooms(rooms.sort((a, b) =>
            new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
          )))
          .catch(console.error)
      }
      if (msg.senderId !== user.userId && (state.activeRoomId !== msg.roomId || document.hidden)) {
        state.incrementUnread(msg.roomId)
      }
    })

    /*
     * Subscribe to the notification queue for this user.
     * Handles two notification types:
     *   NEW_MESSAGE  — increments the unread count for the source room (if not currently viewing it).
     *   ROOM_CREATED — reloads the room list so the new room appears in the sidebar immediately.
     */
    ws.subscribeToNotifications(user.userId, (notif) => {
      if (notif.type === 'ACCOUNT_SUSPENDED') {
        // Admin suspended this user — update local state so ProtectedRoute shows SuspendedPage
        useAuthStore.getState().updateUser({ active: false })
        return
      }
      if (notif.type === 'NEW_MESSAGE' && notif.roomId) {
        const state = useChatStore.getState()
        const isDND = usePresenceStore.getState().userStatus === 'DND'
        // Always update the sidebar preview so content stays current.
        // When DND is active, skip incrementing the unread badge — the user
        // has signalled they don't want to be interrupted. Counts resume the
        // moment they switch away from DND.
        if (!isDND && (state.activeRoomId !== notif.roomId || document.hidden)) {
          state.incrementUnread(notif.roomId)
        }
        if (notif.message) {
          state.updateRoomPreview(notif.roomId, notif.message, notif.actorId)
        }
      } else if (notif.type === 'ROOM_CREATED') {
        const state = useChatStore.getState()
        api.getUserRooms(user.userId)
          .then(rooms => state.setRooms(rooms.sort((a, b) =>
            new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
          )))
          .catch(console.error)
      }
    })

    /*
     * Connect to the WebSocket server with the current JWT token.
     * The STOMP client will automatically reconnect if the connection drops.
     */
    ws.connect(token).catch((err) => {
      console.error('[WS] Initial connect failed:', err)
      setWsConnected(false)
    })

    /*
     * Start the presence heartbeat ping (every 60 seconds).
     * This keeps the user's online status alive in Redis.
     */
    if (pingRef.current) clearInterval(pingRef.current)
    pingRef.current = setInterval(() => { api.ping(user.userId).catch(() => {}) }, 60_000)

    return () => {
      api.setOffline(user.userId).catch(() => {})
      ws.disconnect()
      unsubscribeState()
      if (pingRef.current) clearInterval(pingRef.current)
    }
  }, [token, user?.userId])

  return (
    <div className="chat-layout">
      {/* Decorative background blobs — purely visual, aria-hidden so screen readers skip them */}
      <div className="chat-layout-blobs" aria-hidden>
        <div className="layout-blob b1" />
        <div className="layout-blob b2" />
        <div className="layout-blob b3" />
      </div>

      {/* Mobile overlay — clicking it closes the sidebar */}
      {sidebarOpen && <div className="sidebar-overlay fade-in" onClick={closeSidebar} />}

      <aside className={`sidebar-container ${sidebarOpen ? 'open' : ''}`}>
        <Sidebar wsConnected={wsConnected} />
      </aside>

      <main className="chat-container">
        {activeRoomId
          ? <ChatArea key={activeRoomId} wsConnected={wsConnected} />
          : <EmptyState />}
      </main>

      {/* RateLimitToast listens for "rateLimitHit" window events from any HTTP/WS source */}
      <RateLimitToast />
    </div>
  )
}
