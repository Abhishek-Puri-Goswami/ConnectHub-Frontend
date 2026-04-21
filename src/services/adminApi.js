/*
 * adminApi.js — Admin-Only API Service
 *
 * Purpose:
 *   A dedicated API service class for platform administration endpoints.
 *   Kept separate from the main api.js to make it obvious which calls require
 *   ADMIN role — mixing admin calls into the general service would make it
 *   harder to audit what actions are restricted.
 *
 * How it works:
 *   Like the main ApiService, every method calls the internal req() helper,
 *   which attaches the JWT token from localStorage as a Bearer header.
 *   The API Gateway's JwtAuthenticationFilter verifies that the token's role
 *   claim is ADMIN before forwarding these requests to the auth-service.
 *   If a non-admin user somehow calls these, the backend returns 403 Forbidden.
 *
 * Endpoints covered:
 *   - User management: list all users, suspend, reactivate, delete
 *   - Audit logs: paginated history of all admin actions (who did what and when)
 */
const API = '/api/v1'

class AdminApiService {
  /*
   * req(method, path, body) — internal helper for making authenticated HTTP requests.
   *
   * Always reads the JWT from localStorage and attaches it as a Bearer token.
   * Unlike the main api.js req(), this version does NOT automatically handle
   * token refresh on 401 — admin sessions are expected to be long-lived and
   * an expired token here means the admin should re-login.
   *
   * Also attaches a numeric `status` field to thrown errors so the AdminDashboard
   * component can distinguish between 403 (forbidden) and 404 (not found).
   */
  async req(method, path, body) {
    const token = localStorage.getItem('accessToken')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = 'Bearer ' + token

    const config = { method, headers }
    if (body) config.body = JSON.stringify(body)

    const res = await fetch(API + path, config)
    if (res.status === 204) return null
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
    if (!res.ok) {
      const msg = data?.message || data?.error || 'Admin request failed'
      const err = new Error(msg)
      err.status = res.status
      throw err
    }
    return data
  }

  /*
   * getAllUsers() — fetches every registered user account in the system.
   * Returns an array of user objects with id, username, email, role, and status.
   * Used by AdminDashboard to render the full user management table.
   */
  getAllUsers() {
    return this.req('GET', '/auth/admin/users')
  }

  /*
   * suspendUser(userId) — disables a user account so they cannot log in.
   * The backend sets the user's status to SUSPENDED. Their data is preserved
   * and can be restored with reactivateUser(). Use for policy violations.
   */
  suspendUser(userId) {
    return this.req('PUT', `/auth/admin/users/${userId}/suspend`)
  }

  /*
   * reactivateUser(userId) — re-enables a previously suspended account.
   * Sets the user's status back to ACTIVE so they can log in again.
   */
  reactivateUser(userId) {
    return this.req('PUT', `/auth/admin/users/${userId}/reactivate`)
  }

  /*
   * deleteUser(userId) — permanently removes a user account and all their data.
   * This is irreversible. The backend also cascades to delete their messages,
   * room memberships, and notifications via Kafka events.
   */
  deleteUser(userId) {
    return this.req('DELETE', `/auth/admin/users/${userId}`)
  }

  /*
   * getAuditLogs(page, size) — fetches a paginated list of admin audit log entries.
   * Each entry records: who performed an action, what the action was, when it happened,
   * and which entity was affected. Used to track admin activity for compliance.
   * Defaults to page 0 with 50 entries per page.
   */
  getAuditLogs(page = 0, size = 50) {
    return this.req('GET', `/auth/admin/audit?page=${page}&size=${size}`)
  }
}

export const adminApi = new AdminApiService()
