/*
 * websocket.js — Real-Time WebSocket Service (STOMP over SockJS)
 *
 * Purpose:
 *   Manages the persistent WebSocket connection between the browser and the
 *   websocket-service backend. All real-time features — receiving new chat messages,
 *   typing indicators, read receipts, emoji reactions, presence (online/offline),
 *   and notifications — flow through this single service.
 *
 * Technology stack:
 *   - STOMP (Simple Text Oriented Messaging Protocol): a messaging protocol that
 *     runs on top of WebSocket. It gives us named "destinations" (like pub/sub topics)
 *     so we can send to /app/chat.send and subscribe to /topic/room/123.
 *   - SockJS: a fallback transport library. If the browser blocks raw WebSockets
 *     (e.g., behind a corporate proxy), SockJS automatically falls back to long-polling
 *     HTTP so the connection still works.
 *
 * How subscriptions work:
 *   There are four types of subscriptions:
 *   1. Room subscriptions  (/topic/room/{id}/*)  — receive messages, typing, read receipts,
 *      edits, deletes, and reactions for a specific chat room.
 *   2. Presence subscription (/topic/presence) — receive online/offline events for any user.
 *   3. Personal queue (/user/{id}/queue/messages) — receive messages only meant for this
 *      user (e.g., DM delivery confirmations, guest limit errors).
 *   4. Notification queue (/user/{id}/queue/notifications) — receive real-time notification
 *      events (e.g., "someone mentioned you").
 *
 * Auto-reconnect and subscription restore:
 *   The STOMP client is configured with reconnectDelay=5000ms. If the connection drops,
 *   it automatically attempts to reconnect every 5 seconds. When reconnected, restoreSubscriptions()
 *   re-registers all previously active subscriptions so no events are missed.
 *
 * The WS_ENDPOINT switches between local dev (direct to port 8080) and production
 * (same-origin /ws path via the API Gateway's WebSocket routing).
 */
import { Client } from "@stomp/stompjs"
import SockJS from "sockjs-client/dist/sockjs"

const WS_ENDPOINT = import.meta.env.DEV ? "http://localhost:8080/ws" : "/ws"

class WebSocketService {
  /*
   * Constructor initializes all the internal state maps:
   *   roomSubscriptions   — Map<roomId, Subscription[]> — active STOMP subscriptions per room
   *   roomCallbacks       — Map<roomId, callbacks>       — the handler functions to call when events arrive
   *   presenceCallbacks   — Set<callback>                — handlers for online/offline events
   *   presenceSubscriptions — Subscription[]             — active presence STOMP subscriptions
   *   personalCallbacks   — Map<userId, callback>        — handlers for personal queue messages
   *   personalSubscriptions — Map<userId, Subscription[]>
   *   notificationCallbacks — Map<userId, callback>      — handlers for notification events
   *   notificationSubscriptions — Map<userId, Subscription>
   *   stateListeners      — Set<listener>                — called whenever connection goes up/down
   *   connected           — boolean flag for current state
   *   _token              — JWT saved for reconnect headers
   *   _connectPromise     — ensures only one connect() call runs at a time
   */
  constructor() {
    this.client = null
    this.roomSubscriptions = new Map()
    this.roomCallbacks = new Map()
    this.presenceCallbacks = new Set()
    this.presenceSubscriptions = []
    this.personalCallbacks = new Map()
    this.personalSubscriptions = new Map()
    this.notificationCallbacks = new Map()
    this.notificationSubscriptions = new Map()
    this.stateListeners = new Set()
    this.connected = false
    this._token = null
    this._connectPromise = null
  }

  /*
   * connect(token) — establishes the STOMP WebSocket connection.
   *
   * If the client is already active, returns immediately (idempotent).
   * The JWT token is passed in the STOMP CONNECT frame headers so the backend
   * can authenticate the WebSocket connection without a separate HTTP request.
   *
   * Returns a Promise that resolves when the connection is established, or
   * rejects on a STOMP-level error. Uses a `settled` flag to avoid calling
   * resolve/reject more than once if events fire in unexpected order.
   */
  connect(token) {
    this._token = token
    if (this.client?.active) return this._connectPromise || Promise.resolve()

    this._connectPromise = new Promise((resolve, reject) => {
      let settled = false

      this.client = new Client({
        webSocketFactory: () => new SockJS(WS_ENDPOINT),
        connectHeaders: { Authorization: "Bearer " + token },
        reconnectDelay: 5000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        debug: (str) => {
          if (str.includes("CONNECT") || str.includes("ERROR")) console.log("[WS]", str)
        },
        onConnect: () => {
          this.connected = true
          this.restoreSubscriptions()
          this.notifyState(true)
          console.log("[WS] Connected")
          if (!settled) {
            settled = true
            resolve()
          }
        },
        onDisconnect: () => {
          this.connected = false
          this.clearActiveSubscriptions()
          this.notifyState(false)
          console.log("[WS] Disconnected")
        },
        onWebSocketClose: () => {
          this.connected = false
          this.clearActiveSubscriptions()
          this.notifyState(false)
        },
        onStompError: (frame) => {
          console.error("[WS] Error:", frame.headers?.message || "Unknown")
          if (!settled) {
            settled = true
            reject(new Error(frame.headers?.message || "WebSocket error"))
          }
        },
      })
      this.client.activate()
    })

    return this._connectPromise.finally(() => {
      this._connectPromise = null
    })
  }

  /*
   * disconnect() — cleanly shuts down the WebSocket connection.
   * Called when the user logs out. Clears all subscriptions and callbacks
   * first to prevent stale handlers from firing after logout.
   */
  disconnect() {
    if (this.client) {
      this.clearActiveSubscriptions()
      this.roomCallbacks.clear()
      this.presenceCallbacks.clear()
      this.personalCallbacks.clear()
      this.notificationCallbacks.clear()
      this.client.deactivate()
      this.connected = false
      this.notifyState(false)
      this.client = null
    }
  }

  /*
   * subscribeToRoom(roomId, callbacks) — subscribes to all real-time events for one room.
   *
   * The callbacks object should have these optional handler functions:
   *   onMessage(msg)   — a new chat message arrived in the room
   *   onTyping(data)   — someone started or stopped typing
   *   onRead(data)     — someone sent a read receipt
   *   onEdit(data)     — a message was edited
   *   onDelete(data)   — a message was deleted
   *   onReaction(data) — an emoji reaction was added or removed
   *
   * The callbacks are saved even if not currently connected, so restoreSubscriptions()
   * can re-register them when the connection comes back.
   */
  subscribeToRoom(roomId, callbacks) {
    this.roomCallbacks.set(roomId, callbacks)
    if (!this.connected || !this.client) return

    const existing = this.roomSubscriptions.get(roomId)
    if (existing) existing.forEach((subscription) => subscription.unsubscribe())

    const subs = []
    subs.push(this.client.subscribe("/topic/room/" + roomId,                (msg) => callbacks.onMessage?.(JSON.parse(msg.body))))
    subs.push(this.client.subscribe("/topic/room/" + roomId + "/typing",    (msg) => callbacks.onTyping?.(JSON.parse(msg.body))))
    subs.push(this.client.subscribe("/topic/room/" + roomId + "/read",      (msg) => callbacks.onRead?.(JSON.parse(msg.body))))
    subs.push(this.client.subscribe("/topic/room/" + roomId + "/edit",      (msg) => callbacks.onEdit?.(JSON.parse(msg.body))))
    subs.push(this.client.subscribe("/topic/room/" + roomId + "/delete",    (msg) => callbacks.onDelete?.(JSON.parse(msg.body))))
    subs.push(this.client.subscribe("/topic/room/" + roomId + "/reactions", (msg) => callbacks.onReaction?.(JSON.parse(msg.body))))
    this.roomSubscriptions.set(roomId, subs)
  }

  /*
   * unsubscribeFromRoom(roomId) — stops listening to a room's events.
   * Called when the user navigates away from a room or the room is deleted.
   */
  unsubscribeFromRoom(roomId) {
    const subs = this.roomSubscriptions.get(roomId)
    if (subs) {
      subs.forEach((subscription) => subscription.unsubscribe())
      this.roomSubscriptions.delete(roomId)
    }
    this.roomCallbacks.delete(roomId)
  }

  /*
   * subscribeToPresence(callback) — subscribes to the global presence topic.
   * The backend publishes to /topic/presence whenever any user goes online or offline.
   * The callback receives { userId, online: true/false } events, which the sidebar
   * uses to update the green/grey dot next to each user's name.
   */
  subscribeToPresence(callback) {
    this.presenceCallbacks.add(callback)
    if (this.connected && this.client) {
      this.presenceSubscriptions.push(
        this.client.subscribe("/topic/presence", (msg) => callback(JSON.parse(msg.body)))
      )
    }
  }

  /*
   * subscribeToPersonal(userId, callback) — subscribes to messages meant only for this user.
   *
   * Two personal queues are subscribed:
   * 1. /user/{id}/queue/messages — delivery confirmations or special server-initiated messages
   * 2. /user/{id}/queue/errors   — server-side error events. Currently handles LIMIT_EXCEEDED,
   *    which fires a "guestLimitExceeded" window event to trigger the upgrade modal.
   */
  subscribeToPersonal(userId, callback) {
    this.personalCallbacks.set(userId, callback)
    if (this.connected && this.client) {
      const existing = this.personalSubscriptions.get(userId)
      if (existing) existing.forEach(s => s.unsubscribe())

      const subs = []
      subs.push(this.client.subscribe("/user/" + userId + "/queue/messages", (msg) => callback(JSON.parse(msg.body))))
      subs.push(this.client.subscribe("/user/" + userId + "/queue/errors", (msg) => {
        try {
          const err = JSON.parse(msg.body)
          if(err.reason === 'LIMIT_EXCEEDED') {
            window.dispatchEvent(new CustomEvent('guestLimitExceeded', { detail: err }))
          }
        } catch(e) {}
      }))
      this.personalSubscriptions.set(userId, subs)
    }
  }

  /*
   * subscribeToNotifications(userId, callback) — subscribes to real-time notification events.
   * The backend pushes events here when something noteworthy happens (e.g., a mention, a
   * new room invite). The callback is used by NotificationCenter to update the badge count
   * and notification list without needing to poll the REST API.
   */
  subscribeToNotifications(userId, callback) {
    this.notificationCallbacks.set(userId, callback)
    if (this.connected && this.client) {
      const existing = this.notificationSubscriptions.get(userId)
      existing?.unsubscribe()
      this.notificationSubscriptions.set(
        userId,
        this.client.subscribe("/user/" + userId + "/queue/notifications", (msg) => {
          try { callback(JSON.parse(msg.body)) } catch (e) { console.error('[WS] Notification parse error', e) }
        })
      )
    }
  }

  /*
   * onStateChange(listener) — registers a callback to be called when the connection
   * goes up or down. Returns an unsubscribe function so components can clean up in useEffect.
   * Used by ChatLayout to show a "reconnecting..." indicator in the UI.
   */
  onStateChange(listener) {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  /*
   * sendMessage(roomId, content, type, replyTo, mediaUrl) — publishes a new chat message.
   *
   * The message is sent to /app/chat.send. The backend's ChatWebSocketHandler receives it,
   * persists it to the database via Kafka, then broadcasts it to all room subscribers on
   * /topic/room/{roomId}. Returns false if not connected so the UI can show an error.
   */
  sendMessage(roomId, content, type, replyTo, mediaUrl) {
    if (!this.connected) return false
    this.client.publish({
      destination: "/app/chat.send",
      body: JSON.stringify({
        roomId,
        content,
        type: type || "TEXT",
        replyToMessageId: replyTo || null,
        mediaUrl: mediaUrl || null,
      }),
    })
    return true
  }

  /*
   * sendTyping(roomId, isTyping) — broadcasts a typing indicator event.
   * Sent to /app/chat.typing with isTyping=true when the user starts typing,
   * and isTyping=false when they stop. The backend relays this to room subscribers
   * so others see the "John is typing..." animation in real time.
   */
  sendTyping(roomId, isTyping) {
    if (!this.connected) return false
    this.client.publish({ destination: "/app/chat.typing", body: JSON.stringify({ roomId, typing: isTyping }) })
    return true
  }

  /*
   * sendReadReceipt(roomId, upToMessageId) — tells the server the user has read
   * all messages up to a specific message. The backend updates read state and
   * broadcasts to room members so they can see double-tick / read indicators.
   */
  sendReadReceipt(roomId, upToMessageId) {
    if (!this.connected) return false
    this.client.publish({ destination: "/app/chat.read", body: JSON.stringify({ roomId, upToMessageId }) })
    return true
  }

  /*
   * sendReaction(roomId, messageId, emoji, action) — adds or removes an emoji reaction.
   * action should be "ADD" or "REMOVE". The backend updates the reaction count and
   * broadcasts to /topic/room/{roomId}/reactions so all members see the change instantly.
   */
  sendReaction(roomId, messageId, emoji, action) {
    if (!this.connected) return false
    this.client.publish({
      destination: "/app/chat.react",
      body: JSON.stringify({ roomId, messageId, emoji, action }),
    })
    return true
  }

  /*
   * sendEdit(roomId, messageId, newContent) — sends a message edit over WebSocket.
   * The backend updates the message in the database and broadcasts the change to all
   * room members on /topic/room/{roomId}/edit so their UI updates in real time.
   */
  sendEdit(roomId, messageId, newContent) {
    if (!this.connected) return false
    this.client.publish({
      destination: "/app/chat.edit",
      body: JSON.stringify({ roomId, messageId, newContent }),
    })
    return true
  }

  /*
   * sendDelete(roomId, messageId) — sends a message deletion event over WebSocket.
   * The backend soft-deletes the message and broadcasts to room members so their
   * message list immediately shows "This message was deleted."
   */
  sendDelete(roomId, messageId) {
    if (!this.connected) return false
    this.client.publish({
      destination: "/app/chat.delete",
      body: JSON.stringify({ roomId, messageId }),
    })
    return true
  }

  /*
   * restoreSubscriptions() — called by onConnect after every (re)connection.
   *
   * When the WebSocket reconnects (e.g. after a network drop), all STOMP subscription
   * objects become invalid because they belong to the old connection. This method
   * re-registers every subscription that was previously active using the saved callbacks,
   * ensuring no events are missed after reconnection.
   */
  restoreSubscriptions() {
    for (const [roomId, callbacks] of this.roomCallbacks.entries()) {
      this.subscribeToRoom(roomId, callbacks)
    }

    this.presenceSubscriptions = []
    for (const callback of this.presenceCallbacks) {
      this.presenceSubscriptions.push(
        this.client.subscribe("/topic/presence", (msg) => callback(JSON.parse(msg.body)))
      )
    }

    for (const [userId, callback] of this.personalCallbacks.entries()) {
      const existing = this.personalSubscriptions.get(userId)
      if (existing) existing.forEach(s => s.unsubscribe())

      const subs = []
      subs.push(this.client.subscribe("/user/" + userId + "/queue/messages", (msg) => callback(JSON.parse(msg.body))))
      subs.push(this.client.subscribe("/user/" + userId + "/queue/errors", (msg) => {
        try {
          const err = JSON.parse(msg.body)
          if(err.reason === 'LIMIT_EXCEEDED') {
            window.dispatchEvent(new CustomEvent('guestLimitExceeded', { detail: err }))
          }
        } catch(e) {}
      }))
      this.personalSubscriptions.set(userId, subs)
    }

    for (const [userId, callback] of this.notificationCallbacks.entries()) {
      const existing = this.notificationSubscriptions.get(userId)
      existing?.unsubscribe()
      this.notificationSubscriptions.set(
        userId,
        this.client.subscribe("/user/" + userId + "/queue/notifications", (msg) => {
          try { callback(JSON.parse(msg.body)) } catch (e) { console.error('[WS] Notification parse error', e) }
        })
      )
    }
  }

  /*
   * clearActiveSubscriptions() — unsubscribes from all active STOMP topics.
   * Called on disconnect or just before restoring subscriptions on reconnect.
   * Does NOT clear the callback maps (those are preserved for restore).
   */
  clearActiveSubscriptions() {
    this.roomSubscriptions.forEach((subs) => subs.forEach((subscription) => subscription.unsubscribe()))
    this.roomSubscriptions.clear()
    this.presenceSubscriptions.forEach((subscription) => subscription.unsubscribe())
    this.presenceSubscriptions = []
    this.personalSubscriptions.forEach((subs) => subs.forEach((subscription) => subscription.unsubscribe()))
    this.personalSubscriptions.clear()
    this.notificationSubscriptions.forEach((subscription) => subscription.unsubscribe())
    this.notificationSubscriptions.clear()
  }

  /*
   * notifyState(connected) — calls all registered state listeners with the new
   * connection status (true = connected, false = disconnected).
   * This is how ChatLayout knows to show or hide the "reconnecting" banner.
   */
  notifyState(connected) {
    this.stateListeners.forEach((listener) => listener(connected))
  }
}

export const ws = new WebSocketService()
