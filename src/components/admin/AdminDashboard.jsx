/*
 * AdminDashboard.jsx — Platform Administration Panel
 *
 * Purpose:
 *   A full-page admin interface (accessible only to users with ADMIN or
 *   PLATFORM_ADMIN role) that lets platform administrators manage users
 *   and view a detailed audit trail of all admin actions.
 *
 * Two tabs:
 *   1. Users tab — shows all registered users in a sortable table with
 *      the ability to suspend, reactivate, or permanently delete accounts.
 *   2. Audit Logs tab — shows a paginated timeline of admin actions
 *      (suspend, reactivate, delete) with actor, target, IP address, and timestamp.
 *
 * Stats section:
 *   Four counters at the top (Total Users, Active, Suspended, Admins) are
 *   derived client-side by filtering the `users` array already in the store.
 *   No extra API call is needed for this.
 *
 * Search:
 *   The search bar on the Users tab calls setSearchQuery() in adminStore, which
 *   stores the query. filteredUsers() is a selector in the store that filters
 *   the users array by name, email, or username client-side. This means the
 *   search is instant — no API call per keystroke.
 *
 * Confirmation modal:
 *   Destructive actions (suspend, reactivate, delete) require confirmation to
 *   prevent accidental clicks. Clicking an action button sets `confirmAction`
 *   to an object { type, userId, name }. The modal reads this to show the
 *   appropriate message. Confirming calls handleAction() which dispatches
 *   the right store action. Cancelling sets confirmAction back to null.
 *
 * Protection rules:
 *   - The logged-in admin cannot act on their own account (isCurrentUser check).
 *   - Other admins are shown as "Protected" and cannot be suspended or deleted.
 *     This prevents admins from accidentally locking themselves out.
 *
 * Audit log entries:
 *   getAuditIcon() maps the action string to a colored icon:
 *   SUSPEND → orange Ban icon, REACTIVATE → green UserCheck, DELETE → red Trash2.
 *   Unknown actions fall back to the Activity icon.
 *   Pagination is handled by passing a page number to fetchAuditLogs(page).
 *
 * Error handling:
 *   Errors from store actions are stored in the adminStore `error` field and
 *   displayed in a red alert bar at the top of the content area.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../../store/adminStore'
import { useAuthStore } from '../../store/authStore'
import {
  Shield, Users, Search, ArrowLeft, Ban, CheckCircle, Trash2,
  ScrollText, Loader2, AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  UserX, UserCheck, Activity, ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react'
import { format } from 'date-fns'
import './AdminDashboard.css'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    users, auditLogs, auditPage, loading, error,
    searchQuery, setSearchQuery,
    fetchUsers, fetchAuditLogs, suspendUser, reactivateUser, deleteUser,
    filteredUsers,
  } = useAdminStore()

  /*
   * tab — which panel is visible: 'users' or 'audit'.
   * confirmAction — holds the pending destructive action so the confirmation
   * modal knows what to show. Null when no action is pending.
   */
  const [tab, setTab] = useState('users')
  const [confirmAction, setConfirmAction] = useState(null)
  
  // Table state
  const [usersPage, setUsersPage] = useState(0)
  const [sortField, setSortField] = useState('joined') // name, username, role, status, joined
  const [sortDirection, setSortDirection] = useState('desc') // asc, desc

  useEffect(() => {
    setUsersPage(0)
  }, [searchQuery])

  /* Load all users and the first page of audit logs on mount */
  useEffect(() => {
    fetchUsers()
    fetchAuditLogs(0)
  }, [])

  /*
   * filtered — the search-filtered user list from the store selector.
   * stats — four counters derived by filtering the full users array.
   * Both are recalculated on every render but are fast since they only scan
   * an in-memory array.
   */
  const filtered = filteredUsers()
  
  const sortedUsers = [...filtered].sort((a, b) => {
    let valA, valB
    if (sortField === 'name') {
      valA = (a.fullName || a.username || '').toLowerCase()
      valB = (b.fullName || b.username || '').toLowerCase()
    } else if (sortField === 'username') {
      valA = (a.username || '').toLowerCase()
      valB = (b.username || '').toLowerCase()
    } else if (sortField === 'role') {
      valA = (a.role || '').toUpperCase()
      valB = (b.role || '').toUpperCase()
    } else if (sortField === 'status') {
      valA = (a.accountStatus || a.status || '').toUpperCase()
      valB = (b.accountStatus || b.status || '').toUpperCase()
    } else {
      valA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      valB = b.createdAt ? new Date(b.createdAt).getTime() : 0
    }
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  const USERS_PER_PAGE = 10
  const totalUserPages = Math.ceil(sortedUsers.length / USERS_PER_PAGE) || 1
  // Ensure page bounds
  const validUsersPage = Math.min(usersPage, totalUserPages - 1)
  const paginatedUsers = sortedUsers.slice(validUsersPage * USERS_PER_PAGE, (validUsersPage + 1) * USERS_PER_PAGE)

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'joined' ? 'desc' : 'asc')
    }
    setUsersPage(0)
  }

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.3, marginLeft: 6 }} />
    return sortDirection === 'asc' 
      ? <ArrowUp size={12} style={{ color: 'var(--accent)', marginLeft: 6 }} /> 
      : <ArrowDown size={12} style={{ color: 'var(--accent)', marginLeft: 6 }} />
  }

  const stats = {
    total: users.length,
    active: users.filter(u => (u.accountStatus || u.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length,
    suspended: users.filter(u => (u.accountStatus || u.status || 'ACTIVE').toUpperCase() === 'SUSPENDED').length,
    admins: users.filter(u => (u.role || '').toUpperCase() === 'ADMIN' || (u.role || '').toUpperCase() === 'PLATFORM_ADMIN').length,
  }

  /*
   * handleAction — executes the confirmed action from the modal.
   * Dispatches the appropriate store action based on confirmAction.type.
   * Errors are caught silently here because they are stored in adminStore.error
   * and displayed in the error bar. The modal is always dismissed after.
   */
  const handleAction = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'suspend') await suspendUser(confirmAction.userId)
      if (confirmAction.type === 'reactivate') await reactivateUser(confirmAction.userId)
      if (confirmAction.type === 'delete') await deleteUser(confirmAction.userId)
    } catch { /* error is in store */ }
    setConfirmAction(null)
  }

  /*
   * getAuditIcon — maps an audit log action string to a colored icon config.
   * The action strings come from the backend (e.g., "SUSPEND_USER", "DELETE_USER").
   * We check for substrings rather than exact equality to be resilient to naming
   * variations between backend versions.
   */
  const getAuditIcon = (action) => {
    if (action?.includes('SUSPEND')) return { cls: 'suspend', Icon: Ban }
    if (action?.includes('REACTIVATE')) return { cls: 'reactivate', Icon: UserCheck }
    if (action?.includes('DELETE')) return { cls: 'delete', Icon: Trash2 }
    return { cls: 'default', Icon: Activity }
  }

  return (
    <div className="admin-page">
      {/* Page header with title and Back to Chat navigation */}
      <div className="admin-header">
        <div className="admin-header-left">
          <div className="admin-header-icon">
            <Shield size={24} />
          </div>
          <div>
            <h1>Admin Dashboard</h1>
            <p>Manage users, review activity, and maintain platform health</p>
          </div>
        </div>
        <button className="admin-back-btn" onClick={() => navigate('/chat')}>
          <ArrowLeft size={15} /> Back to Chat
        </button>
      </div>

      {/* Stats row — derived from in-memory users array, no extra API call */}
      <div className="admin-stats">
        <div className="admin-stat-card">
          <div className="admin-stat-icon coral"><Users size={18} /></div>
          <div className="admin-stat-value">{stats.total}</div>
          <div className="admin-stat-label">Total Users</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon mint"><CheckCircle size={18} /></div>
          <div className="admin-stat-value">{stats.active}</div>
          <div className="admin-stat-label">Active Users</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon danger"><Ban size={18} /></div>
          <div className="admin-stat-value">{stats.suspended}</div>
          <div className="admin-stat-label">Suspended</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-icon lavender"><Shield size={18} /></div>
          <div className="admin-stat-value">{stats.admins}</div>
          <div className="admin-stat-label">Admins</div>
        </div>
      </div>

      {/* Toolbar: tab switcher + search bar (only on Users tab) */}
      <div className="admin-toolbar">
        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
            onClick={() => setTab('users')}>
            <Users size={14} /> Users
          </button>
          <button className={`admin-tab ${tab === 'audit' ? 'active' : ''}`}
            onClick={() => setTab('audit')}>
            <ScrollText size={14} /> Audit Logs
          </button>
        </div>

        {/* Search bar — filters users client-side via adminStore.setSearchQuery */}
        {tab === 'users' && (
          <div className="admin-search-bar">
            <Search size={15} />
            <input
              placeholder="Search by name, email, or username…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Error banner from the store (API failures for suspend/delete etc.) */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger)', fontSize: '0.84rem', fontWeight: 600 }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ── Users Tab ───────────────────────────────────────────────── */}
      {tab === 'users' && (
        <>
          {loading && users.length === 0 ? (
            <div className="admin-empty">
              <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p>Loading users…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><UserX size={24} /></div>
              <h3>No users found</h3>
              <p>{searchQuery ? 'Try a different search term' : 'No registered users yet'}</p>
            </div>
          ) : (
            <div className="admin-tab-content">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>User <SortIcon field="name" /></div>
                    </th>
                    <th onClick={() => handleSort('username')} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>Username <SortIcon field="username" /></div>
                    </th>
                    <th onClick={() => handleSort('role')} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>Role <SortIcon field="role" /></div>
                    </th>
                    <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>Status <SortIcon field="status" /></div>
                    </th>
                    <th onClick={() => handleSort('joined')} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>Joined <SortIcon field="joined" /></div>
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map(u => {
                    const uid = u.userId || u.id
                    const status = (u.accountStatus || u.status || 'ACTIVE').toUpperCase()
                    const role = (u.role || 'USER').toUpperCase()

                    /*
                     * isCurrentUser — prevents the admin from acting on their own account.
                     * isAdmin — admins are shown as "Protected" to prevent accidental lockout.
                     */
                    const isCurrentUser = uid === user?.userId
                    const isAdmin = role === 'ADMIN' || role === 'PLATFORM_ADMIN'

                    return (
                      <tr key={uid}>
                        <td>
                          <div className="admin-user-cell">
                            {/* Avatar initials — first character of name or username */}
                            <div className="admin-user-av">
                              {(u.fullName || u.username || '?')[0].toUpperCase()}
                            </div>
                            <div className="admin-user-info">
                              <div className="admin-user-name">{u.fullName || u.username}</div>
                              <div className="admin-user-email">{u.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>@{u.username || '—'}</td>
                        <td>
                          <span className={`admin-badge ${isAdmin ? 'admin' : 'user'}`}>
                            {isAdmin ? <><Shield size={10} /> Admin</> : 'User'}
                          </span>
                        </td>
                        <td>
                          <span className={`admin-badge ${status === 'ACTIVE' ? 'active' : status === 'SUSPENDED' ? 'suspended' : 'pending'}`}>
                            {status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {u.createdAt ? format(new Date(u.createdAt), 'MMM d, yyyy') : '—'}
                        </td>
                        <td>
                          {/* Only show action buttons for non-admin, non-self users */}
                          {!isCurrentUser && !isAdmin && (
                            <div className="admin-actions">
                              {status === 'ACTIVE' ? (
                                <button className="admin-act-btn warn"
                                  onClick={() => setConfirmAction({ type: 'suspend', userId: uid, name: u.username })}>
                                  <Ban size={12} /> Suspend
                                </button>
                              ) : (
                                <button className="admin-act-btn success"
                                  onClick={() => setConfirmAction({ type: 'reactivate', userId: uid, name: u.username })}>
                                  <CheckCircle size={12} /> Reactivate
                                </button>
                              )}
                              <button className="admin-act-btn danger"
                                onClick={() => setConfirmAction({ type: 'delete', userId: uid, name: u.username })}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                          {isCurrentUser && <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>You</span>}
                          {isAdmin && !isCurrentUser && <span style={{ fontSize: '0.76rem', color: 'var(--accent)' }}>Protected</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalUserPages > 1 && (
              <div className="admin-pagination">
                <button className="admin-page-btn"
                  disabled={validUsersPage === 0}
                  onClick={() => setUsersPage(p => p - 1)}>
                  <ChevronLeft size={14} /> Prev
                </button>
                <span className="admin-page-info">
                  Page {validUsersPage + 1} of {totalUserPages}
                </span>
                <button className="admin-page-btn"
                  disabled={validUsersPage >= totalUserPages - 1}
                  onClick={() => setUsersPage(p => p + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
            </div>
          )}
        </>
      )}

      {/* ── Audit Logs Tab ───────────────────────────────────────────── */}
      {tab === 'audit' && (
        <>
          {/* Refresh button reloads the current page of audit logs */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="admin-back-btn" onClick={() => fetchAuditLogs(auditPage.number)}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {loading && auditLogs.length === 0 ? (
            <div className="admin-empty">
              <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
              <p>Loading audit logs…</p>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><ScrollText size={24} /></div>
              <h3>No audit logs yet</h3>
              <p>Admin actions will appear here</p>
            </div>
          ) : (
            <div className="admin-tab-content">
              <div className="audit-timeline">
                {auditLogs.map((log, i) => {
                const { cls, Icon } = getAuditIcon(log.action)
                return (
                  <div key={log.id || i} className="audit-entry">
                    <div className={`audit-icon ${cls}`}>
                      <Icon size={16} />
                    </div>
                    <div className="audit-body">
                      <div className="audit-action-text">{log.action?.replace(/_/g, ' ')}</div>
                      <div className="audit-detail">{log.details || `${log.entityType} #${log.entityId}`}</div>
                      <div className="audit-meta">
                        <span>Admin #{log.adminId}</span>
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                        {log.createdAt && <span>{format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>


          {/* Pagination controls — shown only when there's more than one page */}
          {auditPage.totalPages > 1 && (
            <div className="admin-pagination">
              <button className="admin-page-btn"
                disabled={auditPage.number === 0}
                onClick={() => fetchAuditLogs(auditPage.number - 1)}>
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="admin-page-info">
                Page {auditPage.number + 1} of {auditPage.totalPages}
              </span>
              <button className="admin-page-btn"
                disabled={auditPage.number >= auditPage.totalPages - 1}
                onClick={() => fetchAuditLogs(auditPage.number + 1)}>
                Next <ChevronRight size={14} />
              </button>
              </div>
            )}
            </div>
          )}
        </>
      )}
      {/* ── Confirmation Modal ───────────────────────────────────────── */}
      {/*
       * A simple inline modal for destructive action confirmation.
       * Clicking the overlay (background) cancels the action.
       * stopPropagation on the card prevents the overlay click from firing
       * when the user clicks inside the card.
       */}
      {confirmAction && (
        <div className="admin-confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div className="admin-confirm-card" onClick={e => e.stopPropagation()}>
            <h3>
              {confirmAction.type === 'delete' ? 'Delete User Permanently?' :
               confirmAction.type === 'suspend' ? 'Suspend User?' : 'Reactivate User?'}
            </h3>
            <p>
              Are you sure you want to {confirmAction.type}{' '}
              <strong>@{confirmAction.name}</strong>?
              {confirmAction.type === 'delete' && ' This action cannot be undone.'}
            </p>
            <div className="admin-confirm-actions">
              <button className="admin-confirm-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="admin-confirm-danger" onClick={handleAction}>
                {loading ? <Loader2 size={14} className="spin" /> : null}
                {confirmAction.type === 'delete' ? 'Delete' :
                 confirmAction.type === 'suspend' ? 'Suspend' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
