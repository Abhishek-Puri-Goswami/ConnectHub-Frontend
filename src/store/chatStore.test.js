/*
 * chatStore.test.js — Unit Tests for useChatStore (Zustand)
 *
 * Coverage target: 90%+ branch coverage
 *
 * HOW TO RUN:
 *   npm run test:unit
 */

import { useChatStore } from './chatStore.js'

// ── helpers ──────────────────────────────────────────────────────────────────

const getState = () => useChatStore.getState()

const INITIAL_STATE = {
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},
  onlineUsers: new Set(),
  presenceStatuses: {},
  members: {},
  unreadCounts: {},
  messageReactions: {},
  sidebarOpen: false,
}

// ── reset before each test ────────────────────────────────────────────────────

beforeEach(() => {
  useChatStore.setState({ ...INITIAL_STATE, onlineUsers: new Set() })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Rooms
// ═══════════════════════════════════════════════════════════════════════════════

describe('setRooms', () => {
  it('replaces the rooms array', () => {
    const rooms = [{ roomId: 1, name: 'general' }, { roomId: 2, name: 'random' }]
    getState().setRooms(rooms)
    expect(getState().rooms).toEqual(rooms)
  })

  it('replaces previous rooms with a new array', () => {
    getState().setRooms([{ roomId: 1 }])
    getState().setRooms([{ roomId: 2 }, { roomId: 3 }])
    expect(getState().rooms).toHaveLength(2)
    expect(getState().rooms[0].roomId).toBe(2)
  })

  it('accepts an empty array', () => {
    getState().setRooms([{ roomId: 1 }])
    getState().setRooms([])
    expect(getState().rooms).toHaveLength(0)
  })
})

describe('setActiveRoom', () => {
  it('sets activeRoomId', () => {
    getState().setActiveRoom(42)
    expect(getState().activeRoomId).toBe(42)
  })

  it('can set to null', () => {
    getState().setActiveRoom(1)
    getState().setActiveRoom(null)
    expect(getState().activeRoomId).toBeNull()
  })
})

describe('addRoom', () => {
  it('prepends a new room to the front', () => {
    getState().setRooms([{ roomId: 2, name: 'old' }])
    getState().addRoom({ roomId: 1, name: 'new' })
    expect(getState().rooms[0].roomId).toBe(1)
    expect(getState().rooms).toHaveLength(2)
  })

  it('replaces an existing room with the same roomId (deduplication)', () => {
    getState().setRooms([{ roomId: 5, name: 'original' }])
    getState().addRoom({ roomId: 5, name: 'updated' })
    expect(getState().rooms).toHaveLength(1)
    expect(getState().rooms[0].name).toBe('updated')
  })

  it('places the new/updated room at the front after dedup', () => {
    getState().setRooms([{ roomId: 10 }, { roomId: 5, name: 'old' }, { roomId: 20 }])
    getState().addRoom({ roomId: 5, name: 'refreshed' })
    expect(getState().rooms[0].roomId).toBe(5)
  })
})

describe('removeRoom', () => {
  it('removes the room with the given roomId', () => {
    getState().setRooms([{ roomId: 1 }, { roomId: 2 }, { roomId: 3 }])
    getState().removeRoom(2)
    expect(getState().rooms.map(r => r.roomId)).toEqual([1, 3])
  })

  it('clears activeRoomId when the active room is removed', () => {
    getState().setRooms([{ roomId: 7 }])
    getState().setActiveRoom(7)
    getState().removeRoom(7)
    expect(getState().activeRoomId).toBeNull()
  })

  it('does NOT clear activeRoomId when a different room is removed', () => {
    getState().setRooms([{ roomId: 7 }, { roomId: 8 }])
    getState().setActiveRoom(7)
    getState().removeRoom(8)
    expect(getState().activeRoomId).toBe(7)
  })

  it('is a no-op when roomId does not exist', () => {
    getState().setRooms([{ roomId: 1 }])
    getState().removeRoom(999)
    expect(getState().rooms).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Messages — setMessages / addMessage / prependMessages
// ═══════════════════════════════════════════════════════════════════════════════

describe('setMessages', () => {
  it('sets messages for a room', () => {
    const msgs = [{ messageId: 1, content: 'hi' }]
    getState().setMessages('room1', msgs)
    expect(getState().messages['room1']).toEqual(msgs)
  })

  it('preserves messages for other rooms', () => {
    getState().setMessages('room1', [{ messageId: 1 }])
    getState().setMessages('room2', [{ messageId: 2 }])
    expect(getState().messages['room1']).toHaveLength(1)
    expect(getState().messages['room2']).toHaveLength(1)
  })
})

describe('addMessage', () => {
  const room = { roomId: 'r1', name: 'test', lastMessageAt: '2024-01-01T00:00:00Z' }

  beforeEach(() => {
    useChatStore.setState({ rooms: [room], messages: {}, onlineUsers: new Set() })
  })

  it('appends a new message to the room', () => {
    const msg = { messageId: 10, content: 'Hello', senderId: 1, type: 'TEXT' }
    getState().addMessage('r1', msg)
    expect(getState().messages['r1']).toHaveLength(1)
    expect(getState().messages['r1'][0].messageId).toBe(10)
  })

  it('ignores a duplicate message by messageId', () => {
    const msg = { messageId: 10, content: 'Hello', senderId: 1, type: 'TEXT' }
    getState().addMessage('r1', msg)
    getState().addMessage('r1', msg)
    expect(getState().messages['r1']).toHaveLength(1)
  })

  it('ignores a duplicate message by timestamp+senderId when messageId is absent', () => {
    const msg = { content: 'Hi', senderId: 2, timestamp: 'ts1', type: 'TEXT' }
    getState().addMessage('r1', msg)
    getState().addMessage('r1', msg)
    expect(getState().messages['r1']).toHaveLength(1)
  })

  it('allows two messages with same senderId but different timestamps', () => {
    getState().addMessage('r1', { content: 'A', senderId: 1, timestamp: 't1', type: 'TEXT' })
    getState().addMessage('r1', { content: 'B', senderId: 1, timestamp: 't2', type: 'TEXT' })
    expect(getState().messages['r1']).toHaveLength(2)
  })

  it('updates lastMessagePreview for TEXT type', () => {
    const msg = { messageId: 1, content: 'Hello world', senderId: 1, type: 'TEXT' }
    getState().addMessage('r1', msg)
    expect(getState().rooms.find(r => r.roomId === 'r1').lastMessagePreview).toBe('Hello world')
  })

  it('sets lastMessagePreview to "📷 Photo" for IMAGE type', () => {
    const msg = { messageId: 2, content: null, senderId: 1, type: 'IMAGE' }
    getState().addMessage('r1', msg)
    expect(getState().rooms.find(r => r.roomId === 'r1').lastMessagePreview).toBe('📷 Photo')
  })

  it('sets lastMessagePreview to "📎 File" for FILE type', () => {
    const msg = { messageId: 3, content: null, senderId: 1, type: 'FILE' }
    getState().addMessage('r1', msg)
    expect(getState().rooms.find(r => r.roomId === 'r1').lastMessagePreview).toBe('📎 File')
  })

  it('strips HTML entities from text content for the preview', () => {
    // DOMParser decodes entities AND extracts textContent (strips tags).
    // So &lt;b&gt;bold&lt;/b&gt; &amp; more → textContent → "bold & more"
    const msg = { messageId: 4, content: '&lt;b&gt;bold&lt;/b&gt; &amp; more', senderId: 1, type: 'TEXT' }
    getState().addMessage('r1', msg)
    const preview = getState().rooms.find(r => r.roomId === 'r1').lastMessagePreview
    expect(preview).not.toContain('&lt;')
    expect(preview).not.toContain('&amp;')
    // textContent of the parsed HTML strips tags, leaving the visible text
    expect(preview).toBe('bold & more')
  })

  it('sorts rooms by lastMessageAt after adding a message', () => {
    const room2 = { roomId: 'r2', name: 'second', lastMessageAt: '2024-01-02T00:00:00Z' }
    useChatStore.setState({ rooms: [room, room2], messages: {} })
    const msg = { messageId: 5, content: 'New', senderId: 1, type: 'TEXT' }
    getState().addMessage('r1', msg)
    // r1 should now be first because it has the newest lastMessageAt
    expect(getState().rooms[0].roomId).toBe('r1')
  })

  it('initialises messages array for a room that has no messages yet', () => {
    const msg = { messageId: 1, content: 'First', senderId: 1, type: 'TEXT' }
    getState().addMessage('newRoom', msg)
    expect(getState().messages['newRoom']).toHaveLength(1)
  })

  it('handles null/undefined content in preview without throwing', () => {
    const msg = { messageId: 6, content: null, senderId: 1, type: 'TEXT' }
    expect(() => getState().addMessage('r1', msg)).not.toThrow()
  })
})

describe('prependMessages', () => {
  it('prepends messages to the front of the room messages', () => {
    useChatStore.setState({ messages: { r1: [{ messageId: 3 }] } })
    getState().prependMessages('r1', [{ messageId: 1 }, { messageId: 2 }])
    expect(getState().messages['r1'].map(m => m.messageId)).toEqual([1, 2, 3])
  })

  it('initialises the room messages array if empty', () => {
    getState().prependMessages('r1', [{ messageId: 1 }])
    expect(getState().messages['r1']).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Messages — edit / delete / deleteForMe
// ═══════════════════════════════════════════════════════════════════════════════

describe('editMessage', () => {
  beforeEach(() => {
    useChatStore.setState({ messages: { r1: [{ messageId: 10, content: 'original' }] } })
  })

  it('updates content and sets isEdited=true', () => {
    getState().editMessage('r1', 10, 'updated')
    const msg = getState().messages['r1'][0]
    expect(msg.content).toBe('updated')
    expect(msg.isEdited).toBe(true)
  })

  it('does not affect other messages in the room', () => {
    useChatStore.setState({ messages: { r1: [{ messageId: 10, content: 'a' }, { messageId: 11, content: 'b' }] } })
    getState().editMessage('r1', 10, 'changed')
    expect(getState().messages['r1'][1].content).toBe('b')
  })
})

describe('deleteMessage', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: {
        r1: [{ messageId: 5, content: 'text', mediaUrl: 'http://img.jpg', thumbnailUrl: 'http://thumb.jpg' }]
      }
    })
  })

  it('marks the message as deleted and nulls content/media fields', () => {
    getState().deleteMessage('r1', 5)
    const msg = getState().messages['r1'][0]
    expect(msg.isDeleted).toBe(true)
    expect(msg.content).toBeNull()
    expect(msg.mediaUrl).toBeNull()
    expect(msg.thumbnailUrl).toBeNull()
  })

  it('keeps the message in the array (soft delete)', () => {
    getState().deleteMessage('r1', 5)
    expect(getState().messages['r1']).toHaveLength(1)
  })
})

describe('deleteMessageForMe', () => {
  it('removes the message entirely from the array', () => {
    useChatStore.setState({ messages: { r1: [{ messageId: 1 }, { messageId: 2 }] } })
    getState().deleteMessageForMe('r1', 1)
    expect(getState().messages['r1'].map(m => m.messageId)).toEqual([2])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Pin / Unpin
// ═══════════════════════════════════════════════════════════════════════════════

describe('pinMessage', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: {
        r1: [
          { messageId: 1, isPinned: false },
          { messageId: 2, isPinned: false },
          { messageId: 3, isPinned: true },
        ]
      }
    })
  })

  it('sets isPinned=true on the target message', () => {
    getState().pinMessage('r1', 2)
    expect(getState().messages['r1'].find(m => m.messageId === 2).isPinned).toBe(true)
  })

  it('unpins all other messages in the room', () => {
    getState().pinMessage('r1', 2)
    expect(getState().messages['r1'].find(m => m.messageId === 1).isPinned).toBe(false)
    expect(getState().messages['r1'].find(m => m.messageId === 3).isPinned).toBe(false)
  })
})

describe('unpinMessage', () => {
  it('sets isPinned=false on all messages in the room', () => {
    useChatStore.setState({
      messages: {
        r1: [{ messageId: 1, isPinned: true }, { messageId: 2, isPinned: false }]
      }
    })
    getState().unpinMessage('r1')
    getState().messages['r1'].forEach(m => expect(m.isPinned).toBe(false))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Room preview
// ═══════════════════════════════════════════════════════════════════════════════

describe('updateRoomPreview', () => {
  beforeEach(() => {
    useChatStore.setState({ rooms: [{ roomId: 'r1' }, { roomId: 'r2' }] })
  })

  it('updates lastMessagePreview for the specified room', () => {
    getState().updateRoomPreview('r1', 'Hey there', 99)
    expect(getState().rooms.find(r => r.roomId === 'r1').lastMessagePreview).toBe('Hey there')
  })

  it('sets lastMessageSenderId when senderId is provided', () => {
    getState().updateRoomPreview('r1', 'preview', 42)
    expect(getState().rooms.find(r => r.roomId === 'r1').lastMessageSenderId).toBe(42)
  })

  it('does NOT set lastMessageSenderId when senderId is null', () => {
    useChatStore.setState({ rooms: [{ roomId: 'r1', lastMessageSenderId: 5 }] })
    getState().updateRoomPreview('r1', 'preview', null)
    // null senderId → the field should not be overwritten
    expect(getState().rooms.find(r => r.roomId === 'r1').lastMessageSenderId).toBe(5)
  })

  it('does not affect other rooms', () => {
    getState().updateRoomPreview('r1', 'changed', 1)
    expect(getState().rooms.find(r => r.roomId === 'r2').lastMessagePreview).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Typing indicators
// ═══════════════════════════════════════════════════════════════════════════════

describe('setTyping', () => {
  it('adds a typing entry for a user in a room', () => {
    getState().setTyping('r1', 'user1', 'Alice')
    expect(getState().typingUsers['r1']['user1'].username).toBe('Alice')
  })

  it('records a timestamp', () => {
    const before = Date.now()
    getState().setTyping('r1', 'user1', 'Alice')
    const after = Date.now()
    const ts = getState().typingUsers['r1']['user1'].timestamp
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('initialises the room typing map if not present', () => {
    getState().setTyping('newRoom', 'u1', 'Bob')
    expect(getState().typingUsers['newRoom']).toBeDefined()
  })

  it('supports multiple users typing in the same room', () => {
    getState().setTyping('r1', 'u1', 'Alice')
    getState().setTyping('r1', 'u2', 'Bob')
    expect(Object.keys(getState().typingUsers['r1'])).toHaveLength(2)
  })
})

describe('clearTyping', () => {
  it('removes the typing entry for the user', () => {
    getState().setTyping('r1', 'u1', 'Alice')
    getState().clearTyping('r1', 'u1')
    expect(getState().typingUsers['r1']['u1']).toBeUndefined()
  })

  it('does not affect other typing users in the same room', () => {
    getState().setTyping('r1', 'u1', 'Alice')
    getState().setTyping('r1', 'u2', 'Bob')
    getState().clearTyping('r1', 'u1')
    expect(getState().typingUsers['r1']['u2']).toBeDefined()
  })

  it('is safe to call when room has no typing users', () => {
    expect(() => getState().clearTyping('nonexistentRoom', 'u1')).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Online presence
// ═══════════════════════════════════════════════════════════════════════════════

describe('setOnline / setOffline', () => {
  it('setOnline adds userId to onlineUsers Set', () => {
    getState().setOnline('user42')
    expect(getState().onlineUsers.has('user42')).toBe(true)
  })

  it('setOffline removes userId from onlineUsers Set', () => {
    getState().setOnline('user42')
    getState().setOffline('user42')
    expect(getState().onlineUsers.has('user42')).toBe(false)
  })

  it('setOffline is safe when userId is not in the set', () => {
    expect(() => getState().setOffline('nonexistent')).not.toThrow()
  })

  it('maintains other users when one goes offline', () => {
    getState().setOnline('u1')
    getState().setOnline('u2')
    getState().setOffline('u1')
    expect(getState().onlineUsers.has('u2')).toBe(true)
  })
})

describe('setPresenceStatus', () => {
  it('sets a presence status for a user', () => {
    getState().setPresenceStatus('u1', 'DND')
    expect(getState().presenceStatuses['u1']).toBe('DND')
  })

  it('overwrites an existing status', () => {
    getState().setPresenceStatus('u1', 'ONLINE')
    getState().setPresenceStatus('u1', 'AWAY')
    expect(getState().presenceStatuses['u1']).toBe('AWAY')
  })
})

describe('setBulkPresenceStatuses', () => {
  it('sets statuses for all users in the list', () => {
    getState().setBulkPresenceStatuses([
      { userId: 'u1', status: 'ONLINE' },
      { userId: 'u2', status: 'AWAY' },
    ])
    expect(getState().presenceStatuses['u1']).toBe('ONLINE')
    expect(getState().presenceStatuses['u2']).toBe('AWAY')
  })

  it('defaults to OFFLINE when status is missing', () => {
    getState().setBulkPresenceStatuses([{ userId: 'u1' }])
    expect(getState().presenceStatuses['u1']).toBe('OFFLINE')
  })

  it('skips entries with null userId', () => {
    getState().setBulkPresenceStatuses([{ userId: null, status: 'ONLINE' }])
    expect(getState().presenceStatuses[null]).toBeUndefined()
  })

  it('merges with existing statuses without wiping them', () => {
    getState().setPresenceStatus('existing', 'DND')
    getState().setBulkPresenceStatuses([{ userId: 'new', status: 'ONLINE' }])
    expect(getState().presenceStatuses['existing']).toBe('DND')
    expect(getState().presenceStatuses['new']).toBe('ONLINE')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Members
// ═══════════════════════════════════════════════════════════════════════════════

describe('setMembers', () => {
  it('sets members for a room', () => {
    const members = [{ userId: 1, username: 'Alice' }]
    getState().setMembers('r1', members)
    expect(getState().members['r1']).toEqual(members)
  })

  it('preserves members for other rooms', () => {
    getState().setMembers('r1', [{ userId: 1 }])
    getState().setMembers('r2', [{ userId: 2 }])
    expect(getState().members['r1']).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Unread counts
// ═══════════════════════════════════════════════════════════════════════════════

describe('setUnreadCounts', () => {
  it('sets the full unread counts map', () => {
    getState().setUnreadCounts({ r1: 3, r2: 7 })
    expect(getState().unreadCounts).toEqual({ r1: 3, r2: 7 })
  })
})

describe('incrementUnread', () => {
  it('increments unread count for a room', () => {
    getState().setUnreadCounts({ r1: 2 })
    getState().incrementUnread('r1')
    expect(getState().unreadCounts['r1']).toBe(3)
  })

  it('starts from 0 if room has no prior count', () => {
    getState().incrementUnread('newRoom')
    expect(getState().unreadCounts['newRoom']).toBe(1)
  })
})

describe('clearUnread', () => {
  it('sets unread count for a room to 0', () => {
    getState().setUnreadCounts({ r1: 10 })
    getState().clearUnread('r1')
    expect(getState().unreadCounts['r1']).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Reactions
// ═══════════════════════════════════════════════════════════════════════════════

describe('applyReactionEvent', () => {
  it('adds a reaction when action is ADD', () => {
    getState().applyReactionEvent('msg1', 'u1', '👍', 'ADD')
    expect(getState().messageReactions['msg1']).toContainEqual({ userId: 'u1', emoji: '👍' })
  })

  it('does not add a duplicate reaction', () => {
    getState().applyReactionEvent('msg1', 'u1', '👍', 'ADD')
    getState().applyReactionEvent('msg1', 'u1', '👍', 'ADD')
    expect(getState().messageReactions['msg1']).toHaveLength(1)
  })

  it('removes a reaction when action is REMOVE', () => {
    getState().applyReactionEvent('msg1', 'u1', '👍', 'ADD')
    getState().applyReactionEvent('msg1', 'u1', '👍', 'REMOVE')
    expect(getState().messageReactions['msg1']).toHaveLength(0)
  })

  it('REMOVE is safe when reaction does not exist', () => {
    expect(() => getState().applyReactionEvent('msg1', 'u1', '❤️', 'REMOVE')).not.toThrow()
  })

  it('supports multiple users reacting with the same emoji', () => {
    getState().applyReactionEvent('msg1', 'u1', '👍', 'ADD')
    getState().applyReactionEvent('msg1', 'u2', '👍', 'ADD')
    expect(getState().messageReactions['msg1']).toHaveLength(2)
  })

  it('only removes the matching user+emoji pair, not all reactions', () => {
    getState().applyReactionEvent('msg1', 'u1', '👍', 'ADD')
    getState().applyReactionEvent('msg1', 'u2', '👍', 'ADD')
    getState().applyReactionEvent('msg1', 'u1', '👍', 'REMOVE')
    expect(getState().messageReactions['msg1']).toHaveLength(1)
    expect(getState().messageReactions['msg1'][0].userId).toBe('u2')
  })
})

describe('setReactions', () => {
  it('sets the full reactions array for a message', () => {
    const reactions = [{ userId: 'u1', emoji: '🔥' }]
    getState().setReactions('msg1', reactions)
    expect(getState().messageReactions['msg1']).toEqual(reactions)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// markMessagesRead
// ═══════════════════════════════════════════════════════════════════════════════

describe('markMessagesRead', () => {
  const msgs = [
    { messageId: 'm1', senderId: 2, readBy: [], readReceipts: {} },
    { messageId: 'm2', senderId: 2, readBy: [], readReceipts: {} },
    { messageId: 'm3', senderId: 2, readBy: [], readReceipts: {} },
  ]

  beforeEach(() => {
    useChatStore.setState({ messages: { r1: msgs.map(m => ({ ...m })) } })
  })

  it('marks messages read up to (and including) the target messageId', () => {
    getState().markMessagesRead('r1', '1', 'm2')
    const state = getState().messages['r1']
    expect(state[0].readBy).toContain(1)
    expect(state[1].readBy).toContain(1)
    // m3 is AFTER the target — should NOT be marked
    expect(state[2].readBy).not.toContain(1)
  })

  it('sets deliveryStatus to READ on marked messages', () => {
    getState().markMessagesRead('r1', '1', 'm1')
    expect(getState().messages['r1'][0].deliveryStatus).toBe('READ')
  })

  it('does not re-add readerId when already in readBy', () => {
    useChatStore.setState({ messages: { r1: [{ messageId: 'm1', senderId: 2, readBy: [1], readReceipts: { 1: 'ts' } }] } })
    getState().markMessagesRead('r1', '1', 'm1')
    expect(getState().messages['r1'][0].readBy.filter(id => id === 1)).toHaveLength(1)
  })

  it('does not mark sender\'s own messages as read', () => {
    useChatStore.setState({ messages: { r1: [{ messageId: 'm1', senderId: 1, readBy: [], readReceipts: {} }] } })
    getState().markMessagesRead('r1', '1', 'm1')
    expect(getState().messages['r1'][0].readBy).not.toContain(1)
  })

  it('returns unchanged state when roomId has no messages', () => {
    const before = { ...getState().messages }
    getState().markMessagesRead('nonexistent', '1', 'm1')
    expect(getState().messages).toEqual(before)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// updateDeliveryStatus
// ═══════════════════════════════════════════════════════════════════════════════

describe('updateDeliveryStatus', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: {
        r1: [
          { messageId: 'm1', deliveryStatus: 'SENT', readBy: [], readReceipts: {} },
          { messageId: 'm2', deliveryStatus: 'SENT', readBy: [], readReceipts: {} },
        ]
      }
    })
  })

  it('updates deliveryStatus for the target message', () => {
    getState().updateDeliveryStatus('r1', 'm1', 'DELIVERED', null)
    expect(getState().messages['r1'][0].deliveryStatus).toBe('DELIVERED')
  })

  it('sets deliveredAt when status is DELIVERED and was not set before', () => {
    getState().updateDeliveryStatus('r1', 'm1', 'DELIVERED', null)
    expect(getState().messages['r1'][0].deliveredAt).toBeDefined()
  })

  it('does not overwrite an existing deliveredAt', () => {
    useChatStore.setState({
      messages: { r1: [{ messageId: 'm1', deliveryStatus: 'DELIVERED', deliveredAt: '2024-01-01', readBy: [], readReceipts: {} }] }
    })
    getState().updateDeliveryStatus('r1', 'm1', 'DELIVERED', null)
    expect(getState().messages['r1'][0].deliveredAt).toBe('2024-01-01')
  })

  it('adds readerId to readBy when status is READ', () => {
    getState().updateDeliveryStatus('r1', 'm1', 'READ', 5)
    expect(getState().messages['r1'][0].readBy).toContain(5)
  })

  it('adds readReceipts entry when status is READ', () => {
    getState().updateDeliveryStatus('r1', 'm1', 'READ', 5)
    expect(getState().messages['r1'][0].readReceipts[5]).toBeDefined()
  })

  it('does not affect other messages', () => {
    getState().updateDeliveryStatus('r1', 'm1', 'READ', 5)
    expect(getState().messages['r1'][1].deliveryStatus).toBe('SENT')
  })

  it('returns unchanged state when room has no messages', () => {
    const before = { ...getState().messages }
    getState().updateDeliveryStatus('nonexistent', 'm1', 'READ', 1)
    expect(getState().messages).toEqual(before)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════════════════════════════════════════════

describe('sidebar', () => {
  it('starts closed', () => {
    expect(getState().sidebarOpen).toBe(false)
  })

  it('toggleSidebar opens when closed', () => {
    getState().toggleSidebar()
    expect(getState().sidebarOpen).toBe(true)
  })

  it('toggleSidebar closes when open', () => {
    useChatStore.setState({ sidebarOpen: true })
    getState().toggleSidebar()
    expect(getState().sidebarOpen).toBe(false)
  })

  it('openSidebar sets sidebarOpen to true', () => {
    getState().openSidebar()
    expect(getState().sidebarOpen).toBe(true)
  })

  it('closeSidebar sets sidebarOpen to false', () => {
    getState().openSidebar()
    getState().closeSidebar()
    expect(getState().sidebarOpen).toBe(false)
  })
})
