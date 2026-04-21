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
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { usePaymentStore } from '../../store/paymentStore'
import { api } from '../../services/api'
import { ws } from '../../services/websocket'
import Sidebar from './Sidebar'
import ChatArea from '../chat/ChatArea'
import EmptyState from '../chat/EmptyState'
import RateLimitToast from '../chat/RateLimitToast'
import './ChatLayout.css'

export default function ChatLayout() {
  const { token, user } = useAuthStore()
  const { activeRoomId, setRooms, setOnline, setOffline, sidebarOpen, closeSidebar } = useChatStore()
  const { fetchSubscription } = usePaymentStore()
  const [wsConnected, setWsConnected] = useState(false)
  const pingRef = useRef(null)

  /*
   * Fetch the user's subscription tier once on login.
   * This populates paymentStore.subscription so the Sidebar can show the
   * "Upgrade to PRO" button or the "PRO" badge, and so rate limits are applied correctly.
   */
  useEffect(() => {
    if (user) fetchSubscription()
  }, [user?.userId])

  /*
   * Main setup effect — runs once per login session.
   * Registers all WebSocket subscriptions and loads initial data.
   * The cleanup function disconnects cleanly when the user logs out.
   */
  useEffect(() => {
    if (!user) return

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
    api.getUserRooms(user.userId)
      .then(rooms => setRooms(rooms.sort((a, b) =>
        new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
      )))
      .catch(console.error)

    /*
     * Load per-room unread counts from the WebSocket service's Redis store.
     * These counts were tracked even while the user was offline, so the sidebar
     * immediately shows the correct unread badges without waiting for WebSocket events.
     */
    api.getWsUnreadCounts(user.userId)
      .then(counts => {
        const state = useChatStore.getState()
        state.setUnreadCounts(counts)
      })
      .catch(console.error)

    /*
     * Subscribe to global presence events.
     * When any user goes online or offline, update the onlineUsers Set in chatStore
     * so presence dots in the sidebar and member list update in real time.
     */
    ws.subscribeToPresence(p => {
      if (p.status === 'ONLINE') setOnline(p.userId)
      else setOffline(p.userId)
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
      state.addMessage(msg.roomId, msg)
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
      console.log('[Notification]', notif)
      if (notif.type === 'NEW_MESSAGE' && notif.roomId) {
        const state = useChatStore.getState()
        if (state.activeRoomId !== notif.roomId || document.hidden) {
          state.incrementUnread(notif.roomId)
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
