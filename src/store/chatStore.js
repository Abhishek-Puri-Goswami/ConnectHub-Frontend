/*
 * chatStore.js — Global Chat State (Zustand)
 *
 * Purpose:
 *   The central data store for everything the chat UI needs: rooms, messages,
 *   typing indicators, online presence, member lists, unread counts, and
 *   emoji reactions. All chat components read from and write to this store.
 *
 * Why one store for all of this?
 *   These pieces of state are tightly coupled. For example, when a new message
 *   arrives via WebSocket, we need to update messages AND re-sort the room list
 *   AND increment the unread count all at once. Keeping them in one store lets
 *   us do that in a single atomic update.
 *
 * State fields:
 *   rooms          — array of all rooms the user belongs to (sorted by lastMessageAt)
 *   activeRoomId   — the roomId of the currently open chat
 *   messages       — { roomId: [message] } — messages loaded per room
 *   typingUsers    — { roomId: { userId: { username, timestamp } } } — who is currently typing
 *   onlineUsers    — Set<userId> of users known to be online right now
 *   members        — { roomId: [member] } — member list per room
 *   unreadCounts   — { roomId: number } — count of unread messages per room
 *   messageReactions — { messageId: [{ userId, emoji }] } — emoji reactions keyed by message
 *   sidebarOpen    — boolean for mobile sidebar visibility
 */
import { create } from 'zustand'

export const useChatStore = create((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},
  onlineUsers: new Set(),
  members: {},
  unreadCounts: {},
  messageReactions: {},

  /*
   * setRooms(rooms) — replaces the entire room list (called on initial load).
   * setActiveRoom(roomId) — marks which room the user is currently viewing.
   * addRoom(room) — adds a new room to the top of the list, removing any duplicate first.
   */
  setRooms: (rooms) => set({ rooms }),
  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),
  addRoom: (room) => set(s => {
    const existingRooms = s.rooms.filter(r => r.roomId !== room.roomId)
    return { rooms: [room, ...existingRooms] }
  }),

  /*
   * setMessages(roomId, msgs) — replaces the full message list for a room.
   * Called when the user first opens a room and the initial 50 messages are loaded.
   */
  setMessages: (roomId, msgs) => set(s => ({
    messages: { ...s.messages, [roomId]: msgs }
  })),

  /*
   * addMessage(roomId, msg) — appends a single new message to a room.
   * Called when a new message arrives via WebSocket.
   *
   * Duplicate prevention: checks messageId first (for WebSocket messages that
   * also arrive via REST), then falls back to timestamp+senderId as a key.
   * This prevents the same message from appearing twice.
   *
   * Also re-sorts the room list so the room with the newest message floats to the top.
   */
  addMessage: (roomId, msg) => set(s => {
    const existing = s.messages[roomId] || []
    if (existing.find(m =>
      (m.messageId && m.messageId === msg.messageId) ||
      (!m.messageId && m.timestamp === msg.timestamp && m.senderId === msg.senderId)
    )) return s
    return {
      messages: { ...s.messages, [roomId]: [...existing, msg] },
      rooms: s.rooms.map(r => r.roomId === roomId ? { ...r, lastMessageAt: new Date().toISOString() } : r)
        .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
    }
  }),

  /*
   * prependMessages(roomId, msgs) — adds older messages to the start of the list.
   * Called when the user scrolls to the top and triggers "load more" pagination.
   */
  prependMessages: (roomId, msgs) => set(s => ({
    messages: { ...s.messages, [roomId]: [...msgs, ...(s.messages[roomId] || [])] }
  })),

  /*
   * editMessage(roomId, msgId, newContent) — updates a message's text in local state.
   * Called when an edit event arrives from the WebSocket, so the change shows
   * instantly without needing to reload the message list.
   */
  editMessage: (roomId, msgId, newContent) => set(s => ({
    messages: { ...s.messages, [roomId]: (s.messages[roomId] || []).map(m =>
      m.messageId === msgId ? { ...m, content: newContent, isEdited: true } : m
    )}
  })),

  /*
   * deleteMessage(roomId, msgId) — removes a message from local state.
   * Called when a delete event arrives from the WebSocket.
   */
  deleteMessage: (roomId, msgId) => set(s => ({
    messages: { ...s.messages, [roomId]: (s.messages[roomId] || []).filter(m => m.messageId !== msgId) }
  })),

  /*
   * setTyping(roomId, userId, username) — records that a user is typing.
   * Stores a timestamp alongside each typingUser entry so TypingIndicator can
   * expire stale entries (in case the "stop typing" event is never received).
   */
  setTyping: (roomId, userId, username) => set(s => {
    const room = { ...(s.typingUsers[roomId] || {}) }
    room[userId] = { username, timestamp: Date.now() }
    return { typingUsers: { ...s.typingUsers, [roomId]: room } }
  }),

  /*
   * clearTyping(roomId, userId) — removes a user from the typing indicator.
   * Called when the WebSocket receives typing: false from the user.
   */
  clearTyping: (roomId, userId) => set(s => {
    const room = { ...(s.typingUsers[roomId] || {}) }
    delete room[userId]
    return { typingUsers: { ...s.typingUsers, [roomId]: room } }
  }),

  /*
   * setOnline(userId) / setOffline(userId) — maintain a Set of currently online user IDs.
   * Called when presence events arrive from the WebSocket's /topic/presence subscription.
   * The Set is used by the sidebar and member list to render green/grey dot indicators.
   */
  setOnline: (userId) => set(s => {
    const next = new Set(s.onlineUsers); next.add(userId); return { onlineUsers: next }
  }),

  setOffline: (userId) => set(s => {
    const next = new Set(s.onlineUsers); next.delete(userId); return { onlineUsers: next }
  }),

  /*
   * setMembers(roomId, members) — stores the member list for a room.
   * Called when the user opens the room settings panel or when the room is first loaded.
   */
  setMembers: (roomId, members) => set(s => ({
    members: { ...s.members, [roomId]: members }
  })),

  /*
   * setUnreadCounts(counts) — replaces all unread counts at once.
   * Called on initial load by fetching from the WebSocket service's Redis store.
   * incrementUnread(roomId) — adds 1 when a new message arrives in a room the user isn't viewing.
   * clearUnread(roomId) — resets to 0 when the user opens a room and reads the messages.
   */
  setUnreadCounts: (counts) => set({ unreadCounts: counts }),

  incrementUnread: (roomId) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: (s.unreadCounts[roomId] || 0) + 1 }
  })),

  clearUnread: (roomId) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: 0 }
  })),

  /*
   * applyReactionEvent(messageId, senderId, emoji, action) — updates reactions for one message.
   *
   * Called when a reaction WebSocket event arrives. Instead of refetching all reactions
   * from the REST API, this applies a tiny ADD/REMOVE delta to the existing reaction list.
   * This keeps reactions in sync in real time across all users in the room.
   *
   * The reactions are stored centrally in messageReactions (not inside each message object)
   * so that WebSocket events can update them regardless of which component rendered the message.
   */
  applyReactionEvent: (messageId, senderId, emoji, action) => set(s => {
    const current = s.messageReactions[messageId] || []
    let updated
    if (action === 'REMOVE') {
      updated = current.filter(r => !(r.userId === senderId && r.emoji === emoji))
    } else {
      const exists = current.some(r => r.userId === senderId && r.emoji === emoji)
      updated = exists ? current : [...current, { userId: senderId, emoji }]
    }
    return { messageReactions: { ...s.messageReactions, [messageId]: updated } }
  }),

  /*
   * setReactions(messageId, reactions) — replaces the full reaction list for a message.
   * Called after fetching reactions via the REST API (e.g., when a message is first rendered).
   */
  setReactions: (messageId, reactions) => set(s => ({
    messageReactions: { ...s.messageReactions, [messageId]: reactions }
  })),

  /*
   * markMessagesRead(roomId, readerId, upToMessageId) — updates the readBy list for messages.
   * Called when a read receipt WebSocket event arrives. Adds the reader's ID to the readBy
   * array of each message, which MessageBubble uses to render the double-tick indicator.
   */
  markMessagesRead: (roomId, readerId, upToMessageId) => set(s => {
    const msgs = s.messages[roomId]
    if (!msgs) return s
    let found = false
    const updated = msgs.map(m => {
      if (m.messageId === upToMessageId) found = true
      if (found || m.messageId === upToMessageId) {
      }
      const readBy = m.readBy || []
      if (!readBy.includes(readerId) && m.senderId !== readerId) {
        return { ...m, readBy: [...readBy, readerId], deliveryStatus: 'READ' }
      }
      return m
    })
    return { messages: { ...s.messages, [roomId]: updated } }
  }),

  /*
   * updateDeliveryStatus(roomId, messageId, status, readerId) — updates a specific message's
   * delivery status (SENT → DELIVERED → READ). Also appends the readerId to readBy.
   * Called when the server confirms delivery of a message we sent.
   */
  updateDeliveryStatus: (roomId, messageId, status, readerId) => set(s => {
    const msgs = s.messages[roomId]
    if (!msgs) return s
    const updated = msgs.map(m => {
      if (m.messageId === messageId) {
        const readBy = [...(m.readBy || [])]
        if (readerId && !readBy.includes(readerId)) readBy.push(readerId)
        return { ...m, deliveryStatus: status, readBy }
      }
      return m
    })
    return { messages: { ...s.messages, [roomId]: updated } }
  }),

  /*
   * sidebarOpen / toggleSidebar / closeSidebar / openSidebar
   * Controls whether the sidebar is visible on mobile (narrow screens).
   * On desktop the sidebar is always shown. On mobile it overlays the chat.
   */
  sidebarOpen: false,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
  openSidebar: () => set({ sidebarOpen: true }),
}))
