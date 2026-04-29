/*
 * api.js — Central HTTP API Service
 *
 * Purpose:
 *   A single class that wraps every REST API call made by the frontend.
 *   All components import the shared `api` instance and call methods like
 *   api.login(), api.getMessages(), api.uploadFile() instead of calling
 *   fetch() directly. This keeps all network logic in one place.
 *
 * How authentication works:
 *   - Every authenticated request attaches "Authorization: Bearer <token>"
 *     from localStorage (put there during login).
 *   - If the server returns 401 (token expired), the `req()` method
 *     automatically calls tryRefresh() to get a new token using the
 *     refresh token, then retries the original request once.
 *   - If refresh also fails, localStorage is cleared and the user is
 *     redirected to /login.
 *
 * Error handling:
 *   - 204 responses return null (no body).
 *   - For all errors, the service extracts the human-readable message from
 *     the backend's ApiResponse format ({ success, message }) or Spring's
 *     default error format ({ error, message, path }) and throws it.
 *
 * The base path "/api/v1" routes through the API Gateway (Spring Cloud Gateway),
 * which forwards requests to the correct microservice based on the path prefix
 * (e.g. /auth/* → auth-service, /rooms/* → room-service, etc.).
 */
import { useToastStore } from '../store/toastStore';

const API = "/api/v1"

// Helper to identify microservice based on API routing prefix
function getServiceName(path) {
  if (path.startsWith('/auth')) return 'Authentication Service';
  if (path.startsWith('/rooms')) return 'Room Service';
  if (path.startsWith('/messages')) return 'Message Service';
  if (path.startsWith('/users')) return 'User Administration';
  if (path.startsWith('/billing') || path.startsWith('/payments')) return 'Payment Service';
  if (path.startsWith('/presence')) return 'Presence Service';
  if (path.startsWith('/media')) return 'Media Provider';
  if (path.startsWith('/notifications')) return 'Notification Service';
  return 'Backend Service';
}

class ApiService {
  /*
   * req() — the core method that all API calls use internally.
   * Parameters:
   *   method  — HTTP verb ("GET", "POST", "PUT", "DELETE")
   *   path    — API path after /api/v1 (e.g. "/auth/login")
   *   body    — optional request body object (will be JSON.stringify'd)
   *   auth    — if true (default), attach the JWT Bearer token
   *
   * Automatic token refresh:
   *   If a 401 is received, we attempt a silent token refresh. On success,
   *   the same request is retried once with the new token. On failure, the
   *   session is cleared and the user is redirected to the login page.
   */
  async req(method, path, body, auth = true, quiet = false) {
    const headers = { "Content-Type": "application/json" }
    const token = localStorage.getItem("accessToken")
    if (auth && token) headers["Authorization"] = "Bearer " + token

    const config = { method, headers }
    if (body) config.body = JSON.stringify(body)

    const toast = (msg, variant) => { if (!quiet) useToastStore.getState().addToast(msg, variant) }

    let res;
    try {
      res = await fetch(API + path, config)
    } catch (err) {
      toast("API Gateway or Network is unreachable.", 'danger');
      throw err;
    }

    if (res.status === 401 && auth) {
      const ok = await this.tryRefresh()
      if (ok) return this.req(method, path, body, auth, quiet)

      toast("Your session has expired. Please log in again.", 'warning');
      localStorage.clear()
      window.location.href = "/login"
      throw new Error("Session expired")
    }

    if (res.status === 204) return null
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
    if (!res.ok) {
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        const serviceName = getServiceName(path);
        const errorMsg = `${serviceName} is currently unavailable. Please try again later.`;
        toast(errorMsg, 'danger');
        throw new Error(errorMsg);
      }

      /*
       * Handle both response formats:
       *   ApiResponse { success, message }   — our custom backend format
       *   Spring default { error, message, path } — built-in error format
       */
      const msg = data?.message || data?.error || (Array.isArray(data?.errors) ? data.errors.join(', ') : null) || 'Request failed'
      toast(msg, 'danger');
      throw new Error(msg)
    }
    return data
  }

  /*
   * refreshSession() — silently renews the access token using the refresh token.
   *
   * The refresh token is a long-lived JWT stored in localStorage. When the
   * access token expires (after 24h by default), this method calls
   * POST /auth/refresh to get a fresh pair of tokens.
   *
   * On success, the new tokens and updated user object (which includes the
   * latest subscriptionTier) are saved back to localStorage.
   * Returns true on success, false on failure.
   */
  async refreshSession() {
    const rt = localStorage.getItem("refreshToken")
    if (!rt) return false
    try {
      const res = await fetch(API + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (!res.ok) return false
      const data = await res.json()
      localStorage.setItem("accessToken", data.accessToken)
      localStorage.setItem("refreshToken", data.refreshToken)
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user))
      return true
    } catch {
      return false
    }
  }

  async tryRefresh() {
    return this.refreshSession()
  }

  /*
   * Registration methods — these are called without auth (false) because
   * the user does not have a token yet at this stage.
   *
   * register(d)    — submits the sign-up form (username, email, password).
   *                  The backend creates the account and sends an email OTP.
   * verifyOtp(d)   — the user types the 6-digit OTP from their email.
   *                  The backend marks the account as verified and returns tokens.
   * resendOtp(email) — if the OTP email was never received, this triggers a resend.
   */
  register(d) { return this.req("POST", "/auth/register", d, false) }
  verifyOtp(d) { return this.req("POST", "/auth/verify-registration-otp", d, false) }
  resendOtp(email) { return this.req("POST", "/auth/resend-registration-otp", { email }, false) }

  /*
   * Phone OTP methods — used when a user wants to register or log in using
   * their phone number instead of email+password.
   *
   * requestPhoneOtp(phoneNumber) — asks the backend to send an SMS OTP to the given number.
   * verifyPhoneOtp(phoneNumber, otp) — validates the OTP the user typed. On success,
   *   the backend returns access and refresh tokens just like a normal login.
   */
  requestPhoneOtp(phoneNumber) {
    return this.req("POST", "/auth/phone/request-otp", { phoneNumber }, false)
  }
  verifyPhoneOtp(phoneNumber, otp) {
    return this.req("POST", "/auth/phone/verify-otp", { phoneNumber, otp }, false)
  }

  /*
   * Login methods — the app supports four ways to log in:
   *
   * 1. login(d)              — classic username/email + password. Most common path.
   * 2. loginAsGuest()        — creates a temporary anonymous session. No sign-up needed.
   * 3. Email OTP flow:
   *      requestEmailLoginOtp(email) — sends a one-time code to the user's email.
   *      loginWithEmailOtp(email, otp) — verifies the code and returns tokens.
   * 4. Phone OTP flow:
   *      requestPhoneLoginOtp(phoneNumber) — sends SMS OTP.
   *      loginWithPhoneOtp(phoneNumber, otp) — verifies and returns tokens.
   *
   * All login methods use auth=false because there is no token yet.
   */
  login(d) { return this.req("POST", "/auth/login", d, false) }
  loginAsGuest() { return this.req("POST", "/auth/guest", null, false) }

  requestEmailLoginOtp(email) {
    return this.req("POST", "/auth/login/email/request-otp", { email }, false)
  }
  loginWithEmailOtp(email, otp) {
    return this.req("POST", "/auth/login/email/verify-otp", { email, otp }, false)
  }

  requestPhoneLoginOtp(phoneNumber) {
    return this.req("POST", "/auth/login/phone/request-otp", { phoneNumber }, false)
  }
  loginWithPhoneOtp(phoneNumber, otp) {
    return this.req("POST", "/auth/login/phone/verify-otp", { phoneNumber, otp }, false)
  }

  /*
   * Session and password management:
   *
   * logout()           — invalidates the refresh token on the backend, so it can
   *                      no longer be used to get new access tokens. The frontend
   *                      then clears localStorage separately.
   * forgotPassword()   — starts the 3-step reset flow: sends an OTP to the email.
   * verifyResetOtp()   — validates the OTP from the forgot-password email.
   * resetPassword()    — submits the new password after OTP is verified.
   */
  logout() { return this.req("POST", "/auth/logout") }
  forgotPassword(email) { return this.req("POST", "/auth/forgot-password", { email }, false) }
  verifyResetOtp(d) { return this.req("POST", "/auth/verify-reset-otp", d, false) }
  resetPassword(d) { return this.req("POST", "/auth/reset-password", d, false) }

  /*
   * User profile methods — all go to the auth-service via /auth/* path.
   *
   * getProfile(id)          — fetches the full profile of a user by their ID.
   * updateProfile(id, d)    — saves changes like display name, avatar, bio.
   * changePassword(id, d)   — updates the user's password (requires old + new).
   * searchUsers(q)          — searches all users by username/email for @-mentions
   *                           or adding members to a group.
   * updateStatus(id, status)— sets the user's custom status text (e.g. "In a meeting").
   * checkUsername(username) — checks if a username is already taken (used in register form).
   * getUsersByIds(ids)       — batch-fetches multiple user profiles at once, used
   *                           to enrich room member lists with names/avatars.
   */
  getProfile(id) { return this.req("GET", "/auth/profile/" + id) }
  updateProfile(id, d) { return this.req("PUT", "/auth/profile/" + id, d) }
  changePassword(id, d) { return this.req("PUT", "/auth/password/" + id, d) }
  searchUsers(q) { return this.req("GET", "/auth/search?q=" + encodeURIComponent(q)) }
  updateStatus(id, status) { return this.req("PUT", "/auth/status/" + id, { status }) }
  checkUsername(username) { return this.req("GET", "/auth/search?q=" + encodeURIComponent(username), null, true) }
  getUsersByIds(ids) { return this.req("POST", "/auth/users/batch", ids) }

  /*
   * Room (channel/DM) methods — all routed to the room-service via /rooms/* path.
   *
   * createRoom(d)              — creates a new DM or group room. The body includes
   *                              name, type (DM/GROUP), and initial member IDs.
   * getUserRooms(uid)          — fetches all rooms the user belongs to (shown in sidebar).
   * getRoom(id)                — fetches a single room's details (name, avatar, etc.).
   * getRoomMembers(id)         — fetches the list of members in a room.
   * addMember / removeMember   — add or remove a user from a group room.
   * updateRoom(id, d)          — edits room name or avatar (admin/owner only).
   * deleteRoom(id)             — deletes the room and all its messages (owner only).
   * updateMemberRole(...)      — promotes/demotes a member to ADMIN or MEMBER role.
   * muteMember(...)            — mutes/unmutes a specific member in a room.
   * pinMessage / unpinMessage  — sets or clears the pinned message shown at the top.
   * markRoomRead(rid, uid)     — resets the unread message counter for the user in this room.
   * checkMembership(rid, uid)  — checks if a specific user is in the room (used by admin).
   * getAllRooms()               — admin-only: fetches every room in the system.
   */
  createRoom(d) { return this.req("POST", "/rooms", d) }
  getUserRooms(uid) { return this.req("GET", "/rooms/user/" + uid) }
  getRoom(id) { return this.req("GET", "/rooms/" + id) }
  getRoomMembers(id) { return this.req("GET", "/rooms/" + id + "/members") }
  addMember(rid, uid) { return this.req("POST", "/rooms/" + rid + "/members/" + uid) }
  removeMember(rid, uid) { return this.req("DELETE", "/rooms/" + rid + "/members/" + uid) }
  updateRoom(id, d) { return this.req("PUT", "/rooms/" + id, d) }
  deleteRoom(id) { return this.req("DELETE", "/rooms/" + id) }
  updateMemberRole(rid, uid, role) { return this.req("PUT", "/rooms/" + rid + "/members/" + uid + "/role", { role }) }
  muteMember(rid, uid, m) { return this.req("PUT", "/rooms/" + rid + "/members/" + uid + "/mute?muted=" + m) }
  pinMessage(rid, mid) { return this.req("PUT", "/rooms/" + rid + "/pin/" + mid) }
  unpinMessage(rid) { return this.req("DELETE", "/rooms/" + rid + "/pin") }
  markRoomRead(rid, uid) { return this.req("PUT", "/rooms/" + rid + "/read/" + uid) }
  checkMembership(rid, uid) { return this.req("GET", "/rooms/" + rid + "/members/" + uid + "/check") }
  getAllRooms() { return this.req("GET", "/rooms") }

  /*
   * Message methods — routed to the message-service via /messages/* path.
   *
   * getMessages(roomId, before, limit)
   *   — fetches up to `limit` messages in the room. The `before` parameter is a
   *     timestamp used for pagination: pass the timestamp of the oldest message
   *     currently shown to load the next page of older messages (infinite scroll).
   *
   * editMessage(id, content) — updates the text of an existing message.
   * deleteMessage(id)        — soft-deletes a message (shown as "deleted" in chat).
   * searchMessages(rid, kw)  — full-text search within a room for a keyword.
   * addReaction(mid, emoji)  — adds an emoji reaction to a message.
   * removeReaction(mid, emoji) — removes the current user's emoji reaction.
   * getReactions(mid)        — fetches all reactions on a message (emoji + who reacted).
   * clearHistory(rid)        — admin: wipes all messages in a room at once.
   */
  getMessages(roomId, before, limit = 50) {
    let u = "/messages/room/" + roomId + "?limit=" + limit
    if (before) u += "&before=" + encodeURIComponent(before)
    return this.req("GET", u)
  }
  editMessage(id, content) { return this.req("PUT", "/messages/" + id, { content }) }
  deleteMessage(id) { return this.req("DELETE", "/messages/" + id) }
  searchMessages(rid, kw) { return this.req("GET", "/messages/room/" + rid + "/search?keyword=" + encodeURIComponent(kw)) }
  addReaction(mid, emoji) { return this.req("POST", "/messages/" + mid + "/reactions", { emoji }) }
  removeReaction(mid, emoji) { return this.req("DELETE", "/messages/" + mid + "/reactions?emoji=" + encodeURIComponent(emoji)) }
  getReactions(mid) { return this.req("GET", "/messages/" + mid + "/reactions") }
  clearHistory(rid) { return this.req("DELETE", "/messages/room/" + rid + "/clear") }

  /*
   * uploadFile(file, roomId) — uploads a file (image, video, document) to the
   *   media-service, which stores it in AWS S3 and returns a public URL.
   *
   *   Why it does NOT use req():
   *   File uploads use multipart/form-data (FormData), not JSON. The req() method
   *   always sets "Content-Type: application/json", which would break the upload.
   *   So this method builds its own fetch() call without a Content-Type header,
   *   letting the browser set the correct multipart boundary automatically.
   *
   * getRoomMedia(rid) — fetches a list of all files ever shared in a room,
   *   used to populate the Media Gallery panel.
   */
  async uploadFile(file, roomId) {
    const fd = new FormData()
    fd.append("file", file)
    fd.append("roomId", roomId)
    const token = localStorage.getItem("accessToken")
    const res = await fetch(API + "/media/upload", {
      method: "POST",
      headers: token ? { Authorization: "Bearer " + token } : {},
      body: fd,
    })
    if (!res.ok) {
      const raw = await res.text()
      let errText = "HTTP " + res.status
      try {
        const errJson = JSON.parse(raw)
        errText = errJson.message || errJson.error || raw || errText
      } catch (e) {
        if (raw) errText += ": " + raw
      }
      throw new Error(errText)
    }
    return res.json()
  }
  getRoomMedia(rid) { return this.req("GET", "/media/room/" + rid) }

  /*
   * Notification methods — routed to the notification-service via /notifications/* path.
   *
   * getNotifications(uid)    — fetches all notifications for the user (mentions, joins, etc.).
   * markNotifRead(id)        — marks a single notification as read.
   * markAllNotifsRead(uid)   — marks every notification as read at once ("clear all").
   * getUnreadCount(uid)      — returns just the count of unread notifications,
   *                            used to show the red badge on the notification bell icon.
   * getWsUnreadCounts(uid)   — fetches per-room unread message counts stored by
   *                            the WebSocket service in Redis, used to show unread
   *                            badges on room names in the sidebar.
   */
  getNotifications(uid) { return this.req("GET", "/notifications/user/" + uid) }
  markNotifRead(id) { return this.req("PUT", "/notifications/" + id + "/read") }
  markAllNotifsRead(uid) { return this.req("PUT", "/notifications/user/" + uid + "/read-all") }
  getUnreadCount(uid) { return this.req("GET", "/notifications/user/" + uid + "/unread-count") }
  getWsUnreadCounts(uid) { return this.req("GET", "/ws/unread/" + uid) }
  resetWsUnreadCount(uid, rid) { return this.req("DELETE", "/ws/unread/" + uid + "?roomId=" + encodeURIComponent(rid), null, true, true) }

  /*
   * Presence methods — routed to the presence-service via /presence/* path.
   * These methods track whether a user is currently online.
   *
   * ping(uid)            — sent periodically (every ~30s) while the user is active.
   *                        The presence-service uses this heartbeat to keep the user
   *                        marked as online in Redis. If pings stop, the user goes offline.
   * setOnline(uid)       — explicitly marks the user as online when the app loads.
   *                        Includes deviceType and sessionId so multiple devices are tracked.
   * setOffline(uid)      — explicitly marks the user as offline when they close the app
   *                        (sent via the beforeunload browser event).
   * getPresence(uid)     — checks if a specific user is currently online.
   * getBulkPresence(ids) — checks online status for multiple users at once (used in
   *                        the sidebar and member list to show green/grey dot indicators).
   */
  ping(uid) { return this.req("POST", "/presence/ping/" + uid) }
  setOnline(uid) { return this.req("POST", "/presence/online/" + uid, { deviceType: 'WEB', sessionId: 'browser' }) }
  setOffline(uid) { return this.req("POST", "/presence/offline/" + uid) }
  getPresence(uid) { return this.req("GET", "/presence/" + uid) }
  getBulkPresence(ids) { return this.req("POST", "/presence/bulk", ids) }
}

export const api = new ApiService()
