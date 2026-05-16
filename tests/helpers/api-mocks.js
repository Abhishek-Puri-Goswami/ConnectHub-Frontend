/**
 * api-mocks.js — Playwright test helpers for mocking the ConnectHub backend API.
 *
 * Exports mock data constants (MOCK_USER, MOCK_ROOM, …) and helper functions
 * (seedAuth, mockChatApis, mockPasswordLogin, …) that intercept HTTP requests
 * made by the frontend during E2E tests.
 */

// ── Mock data constants ───────────────────────────────────────────────────────

export const MOCK_USER = {
  userId: 'user-1',
  id: 'user-1',
  username: 'jane_doe',
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  role: 'USER',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  subscriptionTier: 'FREE',
  emailVerified: true,
  createdAt: '2024-01-01T00:00:00Z',
}

export const MOCK_ADMIN_USER = {
  userId: 'admin-1',
  id: 'admin-1',
  username: 'admin_user',
  fullName: 'Admin User',
  email: 'admin@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  subscriptionTier: 'PRO',
  emailVerified: true,
  createdAt: '2023-12-01T00:00:00Z',
}

export const MOCK_ROOM = {
  id: 'room-1',
  roomId: 'room-1',
  name: 'General',
  type: 'GROUP',
  isPrivate: false,
  description: 'General discussion',
  createdBy: 'user-1',
  lastMessageAt: new Date().toISOString(),
  // Provide a preview so ChatLayout skips the api.getMessages() preview fetch
  // (condition: lastMessageAt && !lastMessagePreview → triggers the fetch)
  lastMessagePreview: 'Welcome to General',
  createdAt: '2024-01-01T00:00:00Z',
  memberCount: 5,
}

export const MOCK_DM_ROOM = {
  id: 'dm-1',
  roomId: 'dm-1',
  name: 'DM-jane_doe',
  type: 'DM',
  isPrivate: true,
  createdBy: 'user-1',
  lastMessageAt: new Date(Date.now() - 3_600_000).toISOString(),
  createdAt: '2024-01-10T00:00:00Z',
  memberCount: 2,
}

export const MOCK_MESSAGE = {
  id: 'msg-1',
  roomId: 'room-1',
  senderId: 'user-1',
  content: 'Hello everyone!',
  type: 'TEXT',
  sentAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  isEdited: false,
  deliveryStatus: 'DELIVERED',
  reactions: [],
}

export const MOCK_SUBSCRIPTION = {
  id: 'sub-free',
  plan: 'FREE',
  status: 'ACTIVE',
}

export const MOCK_PRO_SUBSCRIPTION = {
  id: 'sub-1',
  plan: 'PREMIUM',
  status: 'ACTIVE',
  razorpaySubId: 'sub_mock_123',
  startDate: '2024-01-01T00:00:00Z',
}

// ── Internal auth response ────────────────────────────────────────────────────

const MOCK_AUTH_RESPONSE = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  user: MOCK_USER,
}

// ── seedAuth ──────────────────────────────────────────────────────────────────

/**
 * Injects auth tokens and user data into localStorage before the next page
 * navigation so the Zustand authStore initialises with a valid session.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} user  One of MOCK_USER or MOCK_ADMIN_USER (default: MOCK_USER)
 */
export async function seedAuth(page, user = MOCK_USER) {
  await page.addInitScript(({ accessToken, refreshToken, userStr }) => {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', userStr)
  }, {
    accessToken: 'mock-access-token-' + user.userId,
    refreshToken: 'mock-refresh-token-' + user.userId,
    userStr: JSON.stringify(user),
  })
}

// ── mockChatApis ──────────────────────────────────────────────────────────────

/**
 * Mocks all API calls made by ChatLayout and its child components on startup:
 * rooms list, room members, presence, unread counts, subscription, notifications.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ rooms?: object[], subscription?: object, payments?: object[] }} options
 */
export async function mockChatApis(page, options = {}) {
  const rooms        = options.rooms        || [MOCK_ROOM]
  const subscription = options.subscription || MOCK_SUBSCRIPTION
  const payments     = options.payments     || []

  // User rooms list (ChatLayout initial load) — GET /api/v1/rooms/user/{userId}
  await page.route('**/api/v1/rooms/user/**', route =>
    route.fulfill({ json: rooms })
  )

  // Room members with nested sub-paths (e.g. /check)
  await page.route('**/api/v1/rooms/*/members/**', route =>
    route.fulfill({ json: { isMember: true } })
  )
  // Room members list
  await page.route('**/api/v1/rooms/*/members', route =>
    route.fulfill({ json: [{ userId: MOCK_USER.userId, role: 'MEMBER', fullName: MOCK_USER.fullName, username: MOCK_USER.username }] })
  )

  // User profile — GET /api/v1/auth/profile/{userId}
  // ChatLayout calls this on mount to refresh avatarUrl; enrichRoomMembers also calls it
  await page.route('**/api/v1/auth/profile/**', route =>
    route.fulfill({ json: MOCK_USER })
  )

  // Per-room unread counts — GET /api/v1/ws/unread/{userId}
  await page.route('**/api/v1/ws/unread/**', route =>
    route.fulfill({ json: {} })
  )

  // Presence — covers online/offline/ping/bulk/status/initStatus
  await page.route('**/api/v1/presence/**', route =>
    route.fulfill({ status: 200, json: { online: false, status: 'ONLINE' } })
  )

  // Subscription status — GET /api/v1/payments/subscription/status
  await page.route('**/api/v1/payments/subscription/status', route =>
    route.fulfill({ json: subscription })
  )

  // Payment history — GET /api/v1/payments/subscription/payments
  await page.route('**/api/v1/payments/subscription/payments', route =>
    route.fulfill({ json: payments })
  )

  // Notifications — covers unread-count, list, email-preferences
  await page.route('**/api/v1/notifications/**', route =>
    route.fulfill({ json: { count: 0 } })
  )

  // Message preview fetch — ChatLayout calls GET /api/v1/messages/room/{roomId}?limit=1
  // for rooms that have lastMessageAt but no stored lastMessagePreview.
  // Without this mock the call fails and can leave the sidebar in a loading state.
  await page.route('**/api/v1/messages/room/**', route =>
    route.fulfill({ json: { content: [], totalElements: 0 } })
  )

  // User search — default empty
  await page.route('**/api/v1/auth/search**', route =>
    route.fulfill({ json: [] })
  )

  // Silent token refresh
  await page.route('**/api/v1/auth/refresh', route =>
    route.fulfill({ json: MOCK_AUTH_RESPONSE })
  )

  // Logout
  await page.route('**/api/v1/auth/logout', route =>
    route.fulfill({ status: 204, body: '' })
  )
}

// ── Password login ────────────────────────────────────────────────────────────

export async function mockPasswordLogin(page) {
  await page.route('**/api/v1/auth/login', route =>
    route.fulfill({ json: MOCK_AUTH_RESPONSE })
  )
}

export async function mockPasswordLoginFailure(page, message = 'Invalid credentials') {
  await page.route('**/api/v1/auth/login', route =>
    route.fulfill({ status: 401, json: { success: false, message } })
  )
}

// ── Email OTP (login) ─────────────────────────────────────────────────────────

export async function mockSendEmailOtp(page) {
  await page.route('**/api/v1/auth/login/email/request-otp', route =>
    route.fulfill({ json: { success: true, cooldownSeconds: 45 } })
  )
}

export async function mockVerifyEmailOtp(page) {
  await page.route('**/api/v1/auth/login/email/verify-otp', route =>
    route.fulfill({ json: MOCK_AUTH_RESPONSE })
  )
}

// ── Registration ──────────────────────────────────────────────────────────────

export async function mockRegister(page) {
  await page.route('**/api/v1/auth/register', route =>
    route.fulfill({ status: 201, body: '' })
  )
}

export async function mockRegisterDuplicateEmail(page) {
  await page.route('**/api/v1/auth/register', route =>
    route.fulfill({ status: 409, json: { success: false, message: 'Email already registered' } })
  )
}

// ── Email OTP (registration verification) ────────────────────────────────────

export async function mockVerifyOtp(page) {
  await page.route('**/api/v1/auth/verify-registration-otp', route =>
    route.fulfill({ json: MOCK_AUTH_RESPONSE })
  )
}

export async function mockResendOtp(page) {
  await page.route('**/api/v1/auth/resend-registration-otp', route =>
    route.fulfill({ json: { success: true, cooldownSeconds: 60 } })
  )
}

// ── User search ───────────────────────────────────────────────────────────────

export async function mockUserSearch(page, users = []) {
  // Registered after mockChatApis so this takes precedence (Playwright LIFO)
  await page.route('**/api/v1/auth/search**', route =>
    route.fulfill({ json: users })
  )
}

// ── Room creation ─────────────────────────────────────────────────────────────

export async function mockCreateRoom(page, room = MOCK_DM_ROOM) {
  await page.route('**/api/v1/rooms', route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ json: room })
    } else {
      route.continue()
    }
  })
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function mockAdminUsers(page, users = [MOCK_USER, MOCK_ADMIN_USER]) {
  await page.route('**/api/v1/auth/admin/users', route =>
    route.fulfill({ json: users })
  )
}

export async function mockAuditLogs(page, logs = []) {
  await page.route('**/api/v1/auth/admin/audit**', route =>
    route.fulfill({
      json: {
        content: logs,
        number: 0,
        // Return totalPages > 1 so pagination controls render when there are logs
        totalPages: logs.length > 0 ? 2 : 0,
        totalElements: logs.length,
      },
    })
  )
}
