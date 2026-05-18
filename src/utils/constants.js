/**
 * constants.js — Application-Wide String Constants
 *
 * Central registry for all literal string values used across the frontend.
 * Importing from here instead of scattering raw strings throughout components:
 *
 *   - Eliminates typos (a misspelled status like "DELIVERD" is a JS error, not a
 *     silent UI bug where the tick never turns blue).
 *   - Enables IDE auto-complete and "Find All References" for every usage.
 *   - Makes future renames a single-file change rather than a global search.
 *   - Provides a self-documenting reference of every status/type the backend can send.
 *
 * HOW TO USE:
 *   import { DELIVERY_STATUS, ROOM_TYPES, PRESENCE } from '../utils/constants'
 *   if (msg.deliveryStatus === DELIVERY_STATUS.READ) { ... }
 */

// ── Message Delivery Status ───────────────────────────────────────────────────

/**
 * DELIVERY_STATUS — matches the deliveryStatus field on Message entities.
 * The value flows: SENT → DELIVERED → READ as recipients interact with messages.
 */
export const DELIVERY_STATUS = Object.freeze({
  /** Message saved to the database; not yet delivered to any session. */
  SENT:      'SENT',
  /** Message delivered to at least one recipient device/session. */
  DELIVERED: 'DELIVERED',
  /** Message has been read by all intended recipients. */
  READ:      'READ',
})

// ── Room / Chat Types ─────────────────────────────────────────────────────────

/**
 * ROOM_TYPES — matches the type field on Room entities.
 */
export const ROOM_TYPES = Object.freeze({
  /** Group chat — multiple participants, has a name and optional description. */
  GROUP: 'GROUP',
  /** Direct message — exactly two participants, name is derived from the other user. */
  DM:    'DM',
})

// ── Presence / Online Status ──────────────────────────────────────────────────

/**
 * PRESENCE — matches the status field in presence events and presenceStatuses store.
 * Used to decide which dot colour to render next to a user's avatar.
 */
export const PRESENCE = Object.freeze({
  /** User is active and accepting messages. Green dot. */
  ONLINE:    'ONLINE',
  /** User has been idle for 5+ minutes (auto-set by idle detector). Yellow dot. */
  AWAY:      'AWAY',
  /** User manually set Do-Not-Disturb — unread badges are suppressed. Red dot. */
  DND:       'DND',
  /** User is online but appears offline to other users. No dot shown. */
  INVISIBLE: 'INVISIBLE',
  /** User has no active session. Grey dot. */
  OFFLINE:   'OFFLINE',
})

// ── Message Types ─────────────────────────────────────────────────────────────

/**
 * MESSAGE_TYPES — matches the type field on Message entities.
 * Controls how the message bubble renders its content.
 */
export const MESSAGE_TYPES = Object.freeze({
  /** Plain text content. Rendered as HTML after XSS sanitisation. */
  TEXT:   'TEXT',
  /** A photo uploaded via the media-service. Shows an inline preview. */
  IMAGE:  'IMAGE',
  /** A file (non-image) uploaded via the media-service. Shows a download link. */
  FILE:   'FILE',
  /** System-generated message (e.g., user joined / left). Shown in grey italic. */
  SYSTEM: 'SYSTEM',
})

// ── WebSocket Notification Types ──────────────────────────────────────────────

/**
 * NOTIF_TYPES — matches the type field in server-pushed notification payloads.
 * Used by ChatLayout's subscribeToNotifications handler to route events.
 */
export const NOTIF_TYPES = Object.freeze({
  /** A new message arrived in a room the user is not currently viewing. */
  NEW_MESSAGE:       'NEW_MESSAGE',
  /** A room was created and the user is a member (triggers sidebar refresh). */
  ROOM_CREATED:      'ROOM_CREATED',
  /** Platform admin suspended this user's account. */
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
})

// ── Subscription Plans ────────────────────────────────────────────────────────

/**
 * PLANS — subscription tier identifiers returned by the payment-service.
 */
export const PLANS = Object.freeze({
  FREE:     'FREE',
  PREMIUM:  'PREMIUM',
  PLATINUM: 'PLATINUM',
})

// ── User Roles ────────────────────────────────────────────────────────────────

/**
 * ROLES — user role values returned in the JWT and user profile objects.
 */
export const ROLES = Object.freeze({
  USER:           'USER',
  ADMIN:          'ADMIN',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
})
