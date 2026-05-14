/*
 * AdminDashboard.jsx — Platform Administration Panel (Redesigned)
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '../../store/adminStore'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'
import { adminApi } from '../../services/adminApi'
import {
  Shield, Users, Search, ArrowLeft, Ban, CheckCircle, Trash2,
  ScrollText, Loader2, AlertCircle, RefreshCw, ChevronLeft, ChevronRight,
  UserX, UserCheck, Activity, ArrowUp, ArrowDown, ArrowUpDown, Wifi, Crown, UserCog,
  Megaphone, Send, Hash, Lock, MessageSquare, HardDrive, TrendingUp, TrendingDown,
  Minus, Circle, ShieldAlert, Clock, BarChart2, LineChart as LineChartIcon, Zap
} from 'lucide-react'
import { format } from 'date-fns'
import {
  AreaChart, Area, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import './AdminDashboard.css'

/* ── helpers ────────────────────────────────────────────────────── */
const parseTs = (s) => {
  if (!s) return null
  return new Date(s.endsWith('Z') || s.includes('+') ? s : s + 'Z')
}
const formatBytes = (bytes) => {
  if (bytes == null) return '—'
  const b = Math.round(bytes)
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB'
  return (b / 1073741824).toFixed(2) + ' GB'
}

/* Human-readable audit action labels */
const ACTION_LABELS = {
  USER_DELETE:      { label: 'User Deleted',      sub: (log) => log.details || `User #${log.entityId}` },
  USER_DELETED:     { label: 'Account Removed',   sub: (log) => `User #${log.entityId} removed from platform` },
  USER_SUSPEND:     { label: 'User Suspended',    sub: (log) => log.details || `User #${log.entityId}` },
  USER_SUSPENDED:   { label: 'Account Suspended', sub: (log) => `User #${log.entityId} access revoked` },
  USER_REACTIVATE:  { label: 'User Reactivated',  sub: (log) => log.details || `User #${log.entityId}` },
  USER_REACTIVATED: { label: 'Account Restored',  sub: (log) => `User #${log.entityId} access restored` },
  USER_ROLE_CHANGE: { label: 'Role Changed',      sub: (log) => log.details || `User #${log.entityId}` },
}
const formatAuditAction = (log) => {
  const key = log.action?.toUpperCase().replace(/ /g, '_')
  const def = ACTION_LABELS[key]
  return {
    label: def?.label ?? log.action?.replace(/_/g, ' '),
    sub:   def?.sub(log) ?? log.details ?? `${log.entityType || 'Entity'} #${log.entityId || '—'}`,
  }
}
const delta = (now, prev) => {
  if (now == null || prev == null || prev === 0) return null
  const pct = ((now - prev) / prev) * 100
  return { pct: Math.abs(pct).toFixed(1), up: pct >= 0 }
}

/* ── custom recharts tooltip ─────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <div className="ct-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="ct-row">
          <span className="ct-dot" style={{ background: p.color }} />
          <span className="ct-name">{p.name}</span>
          <span className="ct-val">{p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

/* ── delta badge ─────────────────────────────────────────────────── */
const DeltaBadge = ({ d }) => {
  if (!d) return null
  return (
    <span className={`stat-delta ${d.up ? 'up' : 'down'}`}>
      {d.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {d.pct}%
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const viewerIsPlatformAdmin = (user?.role || '').toUpperCase() === 'PLATFORM_ADMIN'
  const {
    users, auditLogs, auditPage, loading, error,
    searchQuery, setSearchQuery,
    fetchUsers, fetchAuditLogs, suspendUser, reactivateUser, deleteUser, changeRole,
    filteredUsers, onlineCount, fetchOnlineCount,
  } = useAdminStore()

  const [tab, setTab] = useState('users')
  const [confirmAction, setConfirmAction] = useState(null)

  // Auto-refresh audit logs whenever the audit tab is selected
  const switchTab = (t) => {
    setTab(t)
    if (t === 'audit') fetchAuditLogs(0)
  }

  // Rooms
  const [rooms, setRooms] = useState([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsPage, setRoomsPage] = useState(0)
  const [roomsTotalPages, setRoomsTotalPages] = useState(1)
  const [confirmRoomDelete, setConfirmRoomDelete] = useState(null)

  // Analytics
  const [analytics, setAnalytics] = useState([])
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [chartWindow, setChartWindow] = useState('24h') // 6h | 12h | 24h

  // Platform stats
  const [wsConnections, setWsConnections] = useState(null)
  const [activeRoomCount, setActiveRoomCount] = useState(null)
  const [dailyMessageCount, setDailyMessageCount] = useState(null)
  const [totalStorageBytes, setTotalStorageBytes] = useState(null)

  // Broadcast
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastMessage, setBroadcastMessage] = useState('')
  const [broadcastSending, setBroadcastSending] = useState(false)

  // Users table
  const [usersPage, setUsersPage] = useState(0)
  const [sortField, setSortField] = useState('joined')
  const [sortDirection, setSortDirection] = useState('desc')

  useEffect(() => { setUsersPage(0) }, [searchQuery])

  useEffect(() => {
    const role = (user?.role || '').toUpperCase()
    if (!['ADMIN', 'PLATFORM_ADMIN'].includes(role)) navigate('/chat')
  }, [user?.role])

  useEffect(() => {
    fetchUsers()
    fetchAuditLogs(0)
    fetchOnlineCount()
    adminApi.getActiveRoomCount().then(v => setActiveRoomCount(typeof v === 'number' ? v : v?.count ?? null)).catch(() => {})
    adminApi.getDailyMessageCount().then(v => setDailyMessageCount(typeof v === 'number' ? v : v?.count ?? null)).catch(() => {})
    adminApi.getTotalStorageUsed().then(v => setTotalStorageBytes(typeof v === 'number' ? v : v?.bytes ?? v?.totalBytes ?? null)).catch(() => {})

    const onlineTimer = setInterval(fetchOnlineCount, 15_000)
    const usersTimer  = setInterval(fetchUsers, 60_000)
    return () => { clearInterval(onlineTimer); clearInterval(usersTimer) }
  }, [])

  useEffect(() => {
    if (!viewerIsPlatformAdmin) return
    const fetchWs = () => adminApi.getWsConnectionCount().then(c => setWsConnections(c ?? 0)).catch(() => {})
    fetchWs()
    const t = setInterval(fetchWs, 30_000)
    return () => clearInterval(t)
  }, [viewerIsPlatformAdmin])

  useEffect(() => {
    if (tab !== 'rooms') return
    setRoomsLoading(true)
    adminApi.getAllRooms(roomsPage, 20)
      .then(d => { setRooms(d?.content ?? []); setRoomsTotalPages(d?.totalPages ?? 1) })
      .catch(() => {})
      .finally(() => setRoomsLoading(false))
  }, [tab, roomsPage])

  useEffect(() => {
    if (tab !== 'analytics') return
    setAnalyticsLoading(true)
    adminApi.getAnalytics()
      .then(data => {
        const reversed = [...data].reverse()
        setAnalytics(reversed.map(s => ({
          ...s,
          time: s.snapshotAt ? format(parseTs(s.snapshotAt), 'HH:mm') : '',
        })))
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false))
  }, [tab])

  /* ── derived state ─────────────────────────────────────────────── */
  const filtered = filteredUsers()
  const stats = {
    total:     users.length,
    active:    users.filter(u => u.active !== false && (u.status || '').toUpperCase() !== 'SUSPENDED' && (u.accountStatus || '').toUpperCase() !== 'SUSPENDED').length,
    suspended: users.filter(u => u.active === false || (u.status || '').toUpperCase() === 'SUSPENDED' || (u.accountStatus || '').toUpperCase() === 'SUSPENDED').length,
    admins:    users.filter(u => ['ADMIN', 'PLATFORM_ADMIN'].includes((u.role || '').toUpperCase())).length,
    pro:       users.filter(u => (u.subscriptionTier || 'FREE').toUpperCase() !== 'FREE').length,
  }

  /* Sliced analytics data based on timeframe picker */
  const chartData = useMemo(() => {
    const slots = chartWindow === '6h' ? 24 : chartWindow === '12h' ? 48 : analytics.length
    return analytics.slice(-slots)
  }, [analytics, chartWindow])

  /* Sort for users table */
  const sortedUsers = [...filtered].sort((a, b) => {
    let vA, vB
    if (sortField === 'name')     { vA = (a.fullName || a.username || '').toLowerCase(); vB = (b.fullName || b.username || '').toLowerCase() }
    else if (sortField === 'username') { vA = (a.username || '').toLowerCase(); vB = (b.username || '').toLowerCase() }
    else if (sortField === 'role')    { vA = (a.role || '').toUpperCase(); vB = (b.role || '').toUpperCase() }
    else if (sortField === 'status')  {
      vA = (a.active === false || (a.status || '').toUpperCase() === 'SUSPENDED') ? 'SUSPENDED' : 'ACTIVE'
      vB = (b.active === false || (b.status || '').toUpperCase() === 'SUSPENDED') ? 'SUSPENDED' : 'ACTIVE'
    }
    else { vA = a.createdAt ? new Date(a.createdAt).getTime() : 0; vB = b.createdAt ? new Date(b.createdAt).getTime() : 0 }
    if (vA < vB) return sortDirection === 'asc' ? -1 : 1
    if (vA > vB) return sortDirection === 'asc' ? 1 : -1
    return 0
  })
  const USERS_PER_PAGE = 10
  const totalUserPages = Math.ceil(sortedUsers.length / USERS_PER_PAGE) || 1
  const validUsersPage = Math.min(usersPage, totalUserPages - 1)
  const paginatedUsers = sortedUsers.slice(validUsersPage * USERS_PER_PAGE, (validUsersPage + 1) * USERS_PER_PAGE)
  const handleSort = (field) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection(field === 'joined' ? 'desc' : 'asc') }
    setUsersPage(0)
  }
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown size={12} style={{ opacity: 0.3, marginLeft: 4 }} />
    return sortDirection === 'asc'
      ? <ArrowUp size={12} style={{ color: 'var(--primary)', marginLeft: 4 }} />
      : <ArrowDown size={12} style={{ color: 'var(--primary)', marginLeft: 4 }} />
  }

  /* ── action handlers ───────────────────────────────────────────── */
  const handleAction = async () => {
    if (!confirmAction) return
    const { type, userId, name } = confirmAction
    setConfirmAction(null)
    try {
      if (type === 'suspend')    { await suspendUser(userId);         addToast(`@${name} has been suspended.`, 'warning') }
      if (type === 'reactivate') { await reactivateUser(userId);      addToast(`@${name} has been reactivated.`, 'success') }
      if (type === 'delete')     { await deleteUser(userId);          addToast(`@${name} was permanently deleted.`, 'success') }
      if (type === 'promote')    { await changeRole(userId, 'ADMIN'); addToast(`@${name} promoted to Admin.`, 'success') }
      if (type === 'demote')     { await changeRole(userId, 'USER');  addToast(`@${name} demoted to User.`, 'info') }
      // Refresh audit logs 1s after action so Kafka has time to persist it
      setTimeout(() => fetchAuditLogs(0), 1000)
    } catch (e) { addToast(e?.message || 'Action failed.', 'error') }
  }

  const handleRoomDelete = async () => {
    if (!confirmRoomDelete) return
    const { roomId, name } = confirmRoomDelete
    setConfirmRoomDelete(null)
    try {
      await adminApi.adminDeleteRoom(roomId)
      setRooms(prev => prev.filter(r => r.roomId !== roomId))
      addToast(`Room "${name}" deleted.`, 'success')
    } catch (e) { addToast(e?.message || 'Failed to delete room.', 'error') }
  }

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return
    setBroadcastSending(true)
    try {
      await adminApi.sendBroadcast(broadcastTitle.trim(), broadcastMessage.trim())
      addToast('Broadcast sent to all connected users.', 'success')
      setBroadcastTitle('')
      setBroadcastMessage('')
    } catch (e) { addToast(e.message || 'Failed to send broadcast.', 'error') }
    finally { setBroadcastSending(false) }
  }

  const getAuditIcon = (action) => {
    if (action?.includes('SUSPEND'))    return { cls: 'suspend',    Icon: Ban }
    if (action?.includes('REACTIVATE')) return { cls: 'reactivate', Icon: UserCheck }
    if (action?.includes('DELETE'))     return { cls: 'delete',     Icon: Trash2 }
    if (action?.includes('ROLE'))       return { cls: 'default',    Icon: UserCog }
    return { cls: 'default', Icon: Activity }
  }

  /* Detect overall system health (simple heuristic) */
  const systemOk = stats.suspended === 0 || stats.suspended < stats.total * 0.1

  /* ── RENDER ─────────────────────────────────────────────────────── */
  return (
    <div className="admin-page">

      {/* ── Header ── */}
      <div className="admin-header">
        <div className="admin-header-left">
          <div className="admin-header-icon">
            <Shield size={20} />
          </div>
          <div>
            <div className="admin-header-title">
              <h1>Admin Command Center</h1>
              <span className={`sys-status ${systemOk ? 'ok' : 'warn'}`}>
                <Circle size={7} fill="currentColor" />
                {systemOk ? 'All Systems Normal' : 'Attention Required'}
              </span>
            </div>
            <p>Manage users, analyze activity, nurturing community health.</p>
          </div>
        </div>
        <button className="admin-back-btn" onClick={() => navigate('/chat')}>
          <ArrowLeft size={14} /> Back to Chat
        </button>
      </div>

      {/* ── Stats Strip ── */}
      <div className="admin-stats-strip">
        <div className="admin-stat-pill">
          <span className="asp-icon coral"><Users size={13} /></span>
          <span className="asp-value">{stats.total}</span>
          <span className="asp-label">Users</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon mint"><CheckCircle size={13} /></span>
          <span className="asp-value">{stats.active}</span>
          <span className="asp-label">Active</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon danger"><Ban size={13} /></span>
          <span className="asp-value">{stats.suspended}</span>
          <span className="asp-label">Suspended</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon lavender"><Shield size={13} /></span>
          <span className="asp-value">{stats.admins}</span>
          <span className="asp-label">Admins</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon mint"><Wifi size={13} /></span>
          <span className="asp-value">{onlineCount ?? '—'}</span>
          <span className="asp-label">Online</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon lavender"><Crown size={13} /></span>
          <span className="asp-value">{stats.pro}</span>
          <span className="asp-label">Premium</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon indigo"><Hash size={13} /></span>
          <span className="asp-value">{activeRoomCount ?? '—'}</span>
          <span className="asp-label">Rooms</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon amber"><MessageSquare size={13} /></span>
          <span className="asp-value">{dailyMessageCount ?? '—'}</span>
          <span className="asp-label">Msgs Today</span>
        </div>
        <div className="asp-divider" />
        <div className="admin-stat-pill">
          <span className="asp-icon teal"><HardDrive size={13} /></span>
          <span className="asp-value">{formatBytes(totalStorageBytes)}</span>
          <span className="asp-label">Storage</span>
        </div>
        {viewerIsPlatformAdmin && (<>
          <div className="asp-divider" />
          <div className="admin-stat-pill">
            <span className="asp-icon emerald"><Zap size={13} /></span>
            <span className="asp-value">{wsConnections ?? '—'}</span>
            <span className="asp-label">WS Conns</span>
          </div>
        </>)}
      </div>

      {/* ── Toolbar ── */}
      <div className="admin-toolbar">
        <div className="admin-tabs">
          <button role="tab" className={`admin-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => switchTab('users')}>
            <Users size={13} /> Users
          </button>
          <button role="tab" className={`admin-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => switchTab('audit')}>
            <ScrollText size={13} /> Audit Logs
          </button>
          {viewerIsPlatformAdmin && (
            <button role="tab" className={`admin-tab ${tab === 'rooms' ? 'active' : ''}`} onClick={() => switchTab('rooms')}>
              <Hash size={13} /> Rooms
            </button>
          )}
          <button role="tab" className={`admin-tab ${tab === 'analytics' ? 'active' : ''}`} onClick={() => switchTab('analytics')}>
            <BarChart2 size={13} /> Analytics
          </button>
          {viewerIsPlatformAdmin && (<>
            <button role="tab" className={`admin-tab ${tab === 'security' ? 'active' : ''}`} onClick={() => switchTab('security')}>
              <ShieldAlert size={13} /> Security
            </button>
            <button role="tab" className={`admin-tab ${tab === 'broadcast' ? 'active' : ''}`} onClick={() => switchTab('broadcast')}>
              <Megaphone size={13} /> Broadcast
            </button>
          </>)}
        </div>
        {tab === 'users' && (
          <div className="admin-search-bar">
            <Search size={14} />
            <input
              placeholder="Search name, email, or username…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="admin-error-bar">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ══════════════════════ USERS TAB ══════════════════════════ */}
      {tab === 'users' && (
        <>
          {loading && users.length === 0 ? (
            <div className="admin-empty"><Loader2 size={26} className="spin" /><p>Loading users…</p></div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><UserX size={22} /></div>
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
                        <span className="th-inner">User <SortIcon field="name" /></span>
                      </th>
                      <th>Email</th>
                      <th onClick={() => handleSort('username')} style={{ cursor: 'pointer' }}>
                        <span className="th-inner">Username <SortIcon field="username" /></span>
                      </th>
                      <th onClick={() => handleSort('role')} style={{ cursor: 'pointer' }}>
                        <span className="th-inner">Role <SortIcon field="role" /></span>
                      </th>
                      <th>Plan</th>
                      <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                        <span className="th-inner">Status <SortIcon field="status" /></span>
                      </th>
                      <th onClick={() => handleSort('joined')} style={{ cursor: 'pointer' }}>
                        <span className="th-inner">Joined <SortIcon field="joined" /></span>
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUsers.map(u => {
                      const uid = u.userId || u.id
                      const isSuspended = u.active === false || (u.status || '').toUpperCase() === 'SUSPENDED' || (u.accountStatus || '').toUpperCase() === 'SUSPENDED'
                      const status = isSuspended ? 'SUSPENDED' : 'ACTIVE'
                      const role = (u.role || 'USER').toUpperCase()
                      const tier = (u.subscriptionTier || 'FREE').toUpperCase()
                      const isPlatformAdmin = role === 'PLATFORM_ADMIN'
                      const isAdmin = role === 'ADMIN' || isPlatformAdmin
                      const isCurrentUser = uid === user?.userId
                      return (
                        <tr key={uid}>
                          <td>
                            <div className="admin-user-cell">
                              <div className="admin-user-av">{(u.fullName || u.username || '?')[0].toUpperCase()}</div>
                              <div className="admin-user-name">{u.fullName || u.username}</div>
                            </div>
                          </td>
                          <td className="td-muted">{u.email || '—'}</td>
                          <td className="td-mono">@{u.username || '—'}</td>
                          <td>
                            {isPlatformAdmin ? (
                              <span className="admin-badge admin"><Shield size={10} /> Platform Admin</span>
                            ) : isAdmin ? (
                              <span className="admin-badge admin"><Shield size={10} /> Admin</span>
                            ) : (
                              <span className="admin-badge user">User</span>
                            )}
                          </td>
                          <td>
                            {tier !== 'FREE' ? (
                              <span className="admin-badge pro"><Crown size={10} /> {tier}</span>
                            ) : (
                              <span className="td-free">FREE</span>
                            )}
                          </td>
                          <td>
                            <span className={`admin-badge ${status === 'ACTIVE' ? 'active' : 'suspended'}`}>
                              <Circle size={6} fill="currentColor" /> {status}
                            </span>
                          </td>
                          <td className="td-muted td-date">
                            {u.createdAt ? format(parseTs(u.createdAt), 'MMM d, yyyy') : '—'}
                          </td>
                          <td>
                            {!isCurrentUser && !isPlatformAdmin && (!isAdmin || viewerIsPlatformAdmin) && (
                              <div className="admin-actions">
                                {status === 'ACTIVE' ? (
                                  <button className="admin-act-btn warn" onClick={() => setConfirmAction({ type: 'suspend', userId: uid, name: u.username })}>
                                    <Ban size={11} /> Suspend
                                  </button>
                                ) : (
                                  <button className="admin-act-btn success" onClick={() => setConfirmAction({ type: 'reactivate', userId: uid, name: u.username })}>
                                    <CheckCircle size={11} /> Reactivate
                                  </button>
                                )}
                                {viewerIsPlatformAdmin && (
                                  !isAdmin ? (
                                    <button className="admin-act-btn icon-btn" title="Promote to Admin" onClick={() => setConfirmAction({ type: 'promote', userId: uid, name: u.username })}>
                                      <UserCog size={12} />
                                    </button>
                                  ) : (
                                    <button className="admin-act-btn icon-btn muted" title="Demote to User" onClick={() => setConfirmAction({ type: 'demote', userId: uid, name: u.username })}>
                                      <UserCog size={12} />
                                    </button>
                                  )
                                )}
                                <button className="admin-act-btn danger icon-btn" onClick={() => setConfirmAction({ type: 'delete', userId: uid, name: u.username })}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                            {isCurrentUser && <span className="td-you">You</span>}
                            {!isCurrentUser && isAdmin && !viewerIsPlatformAdmin && (
                              <span className="td-protected"><Lock size={10}/> Protected</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {totalUserPages > 1 && (
                <div className="admin-pagination">
                  <button className="admin-page-btn" disabled={validUsersPage === 0} onClick={() => setUsersPage(p => p - 1)}>
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <span className="admin-page-info">Page {validUsersPage + 1} of {totalUserPages} · {filtered.length} users</span>
                  <button className="admin-page-btn" disabled={validUsersPage >= totalUserPages - 1} onClick={() => setUsersPage(p => p + 1)}>
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════ AUDIT LOGS TAB ═════════════════════ */}
      {tab === 'audit' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="admin-back-btn" onClick={() => fetchAuditLogs(auditPage.number)}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {loading && auditLogs.length === 0 ? (
            <div className="admin-empty"><Loader2 size={26} className="spin" /><p>Loading audit logs…</p></div>
          ) : auditLogs.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><ScrollText size={22} /></div>
              <h3>No audit logs yet</h3>
              <p>Admin actions will appear here</p>
            </div>
          ) : (
            <div className="admin-tab-content">
              <div className="audit-timeline">
                {auditLogs.map((log, i) => {
                  const { cls, Icon } = getAuditIcon(log.action)
                  const { label, sub } = formatAuditAction(log)
                  const actor = users.find(u => (u.userId || u.id) === log.actorId)
                  const actorLabel = actor
                    ? (actor.fullName || actor.username)
                    : log.actorId > 0 ? `Admin #${log.actorId}` : 'System'
                  return (
                    <div key={log.auditId || log.id || i} className="audit-entry">
                      <div className={`audit-icon ${cls}`}><Icon size={14} /></div>
                      <div className="audit-body">
                        <div className="audit-action-text">{label}</div>
                        <div className="audit-detail">{sub}</div>
                        <div className="audit-meta">
                          <span><Shield size={10}/> {actorLabel}</span>
                          {log.ipAddress && <span><Wifi size={10}/> {log.ipAddress}</span>}
                          {log.createdAt && <span><Clock size={10}/> {format(parseTs(log.createdAt), 'MMM d, yyyy · h:mm a')}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {auditPage.totalPages > 1 && (
                <div className="admin-pagination">
                  <button className="admin-page-btn" disabled={auditPage.number === 0} onClick={() => fetchAuditLogs(auditPage.number - 1)}>
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <span className="admin-page-info">Page {auditPage.number + 1} of {auditPage.totalPages}</span>
                  <button className="admin-page-btn" disabled={auditPage.number >= auditPage.totalPages - 1} onClick={() => fetchAuditLogs(auditPage.number + 1)}>
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════ ROOMS TAB ══════════════════════════ */}
      {tab === 'rooms' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="admin-back-btn" onClick={() => { setRoomsPage(0); setRoomsLoading(true); adminApi.getAllRooms(0, 20).then(d => { setRooms(d?.content ?? []); setRoomsTotalPages(d?.totalPages ?? 1) }).catch(() => {}).finally(() => setRoomsLoading(false)) }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {roomsLoading ? (
            <div className="admin-empty"><Loader2 size={26} className="spin" /><p>Loading rooms…</p></div>
          ) : rooms.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><Hash size={22} /></div>
              <h3>No rooms found</h3><p>No rooms have been created yet</p>
            </div>
          ) : (
            <div className="admin-tab-content">
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr>
                    <th>Room</th><th>Type</th><th>Members</th><th>Created</th><th>Last Activity</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {rooms.map(r => (
                      <tr key={r.roomId}>
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-user-av" style={{ borderRadius: 8 }}>
                              {r.isPrivate ? <Lock size={13}/> : <Hash size={13}/>}
                            </div>
                            <div>
                              <div className="admin-user-name">{r.name || 'Unnamed'}</div>
                              {r.description && <div className="td-muted td-desc">{r.description}</div>}
                            </div>
                          </div>
                        </td>
                        <td><span className={`admin-badge ${r.type === 'DM' ? 'user' : 'active'}`}>{r.type || 'GROUP'}</span></td>
                        <td className="td-muted">{r.memberCount ?? '—'}</td>
                        <td className="td-muted td-date">{r.createdAt ? format(parseTs(r.createdAt), 'MMM d, yyyy') : '—'}</td>
                        <td className="td-muted td-date">{r.lastMessageAt ? format(parseTs(r.lastMessageAt), 'MMM d, yyyy') : 'No messages'}</td>
                        <td>
                          <button className="admin-act-btn danger icon-btn" onClick={() => setConfirmRoomDelete({ roomId: r.roomId, name: r.name || 'this room' })}>
                            <Trash2 size={12} /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {roomsTotalPages > 1 && (
                <div className="admin-pagination">
                  <button className="admin-page-btn" disabled={roomsPage === 0} onClick={() => setRoomsPage(p => p - 1)}><ChevronLeft size={13} /> Prev</button>
                  <span className="admin-page-info">Page {roomsPage + 1} of {roomsTotalPages}</span>
                  <button className="admin-page-btn" disabled={roomsPage >= roomsTotalPages - 1} onClick={() => setRoomsPage(p => p + 1)}>Next <ChevronRight size={13} /></button>
                </div>
              )}
            </div>
          )}
          {confirmRoomDelete && (
            <div className="admin-confirm-overlay" onClick={() => setConfirmRoomDelete(null)}>
              <div role="dialog" className="admin-confirm-card" onClick={e => e.stopPropagation()}>
                <div className="confirm-icon danger"><Trash2 size={20}/></div>
                <h3>Delete Room?</h3>
                <p>Permanently delete <strong>{confirmRoomDelete.name}</strong>? All members will be removed.</p>
                <div className="admin-confirm-actions">
                  <button className="admin-confirm-cancel" onClick={() => setConfirmRoomDelete(null)}>Cancel</button>
                  <button className="admin-confirm-danger" onClick={handleRoomDelete}>Delete Room</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════ ANALYTICS TAB ══════════════════════ */}
      {tab === 'analytics' && (
        <div className="admin-tab-content">
          {analyticsLoading ? (
            <div className="admin-empty"><Loader2 size={26} className="spin" /><p>Loading analytics…</p></div>
          ) : analytics.length === 0 ? (
            <div className="admin-empty">
              <div className="admin-empty-icon"><BarChart2 size={22} /></div>
              <h3>No analytics data yet</h3>
              <p>Snapshots are collected every 15 minutes</p>
            </div>
          ) : (() => {
            const latest = analytics[analytics.length - 1]
            const prev1h = analytics.length > 4  ? analytics[analytics.length - 5]  : null
            const prev24h = analytics.length > 1  ? analytics[0] : null
            const storageMb = latest?.storageMb ?? 0
            const storageDisplay = storageMb >= 1024 ? `${(storageMb / 1024).toFixed(2)} GB` : `${storageMb.toFixed(1)} MB`

            return (<>
              {/* ── Stat grid with deltas ── */}
              <div className="analytics-stat-grid">
                <div className="analytics-card">
                  <div className="ac-header">
                    <span className="ac-icon mint"><Wifi size={15}/></span>
                    <DeltaBadge d={delta(latest?.onlineCount, prev1h?.onlineCount)} />
                  </div>
                  <div className="ac-value">{latest?.onlineCount ?? '—'}</div>
                  <div className="ac-label">Online Now</div>
                  <div className="ac-sub">vs 1h ago</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-header">
                    <span className="ac-icon coral"><MessageSquare size={15}/></span>
                    <DeltaBadge d={delta(latest?.messagesToday, prev24h?.messagesToday)} />
                  </div>
                  <div className="ac-value">{latest?.messagesToday?.toLocaleString() ?? '—'}</div>
                  <div className="ac-label">Messages Today</div>
                  <div className="ac-sub">vs yesterday</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-header">
                    <span className="ac-icon indigo"><Hash size={15}/></span>
                    <DeltaBadge d={delta(latest?.activeRooms, prev24h?.activeRooms)} />
                  </div>
                  <div className="ac-value">{latest?.activeRooms ?? '—'}</div>
                  <div className="ac-label">Active Rooms</div>
                  <div className="ac-sub">last 24h</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-header">
                    <span className="ac-icon amber"><HardDrive size={15}/></span>
                  </div>
                  <div className="ac-value">{storageDisplay}</div>
                  <div className="ac-label">Storage Used</div>
                  <div className="ac-sub">total platform</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-header">
                    <span className="ac-icon coral"><Users size={15}/></span>
                    <DeltaBadge d={delta(latest?.totalUsers, prev24h?.totalUsers)} />
                  </div>
                  <div className="ac-value">{latest?.totalUsers ?? stats.total}</div>
                  <div className="ac-label">Total Users</div>
                  <div className="ac-sub">registered</div>
                </div>
                <div className="analytics-card">
                  <div className="ac-header">
                    <span className="ac-icon danger"><Ban size={15}/></span>
                  </div>
                  <div className="ac-value">{latest?.suspendedUsers ?? stats.suspended}</div>
                  <div className="ac-label">Suspended</div>
                  <div className="ac-sub">accounts</div>
                </div>
              </div>

              {/* ── Chart timeframe selector ── */}
              <div className="chart-toolbar">
                <span className="chart-toolbar-title"><LineChartIcon size={14}/> Platform Metrics</span>
                <div className="timeframe-pills">
                  {['6h','12h','24h'].map(w => (
                    <button key={w} className={`tf-pill ${chartWindow === w ? 'active' : ''}`} onClick={() => setChartWindow(w)}>
                      Last {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Side-by-side charts ── */}
              <div className="charts-grid">
                <div className="admin-chart-card">
                  <div className="admin-chart-title">
                    <Wifi size={13}/> Online Connections
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="gradWs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false}/>
                      <Tooltip content={<CustomTooltip />}/>
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                      <Area type="monotone" dataKey="onlineCount" stroke="var(--secondary)" strokeWidth={2} fill="url(#gradOnline)" name="Online Users" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="admin-chart-card">
                  <div className="admin-chart-title">
                    <MessageSquare size={13}/> Message Volume
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false}/>
                      <Tooltip content={<CustomTooltip />}/>
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                      <Bar dataKey="messagesToday" fill="var(--primary)" name="Messages" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="admin-chart-card">
                  <div className="admin-chart-title">
                    <Hash size={13}/> Active Rooms
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradRooms" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false}/>
                      <Tooltip content={<CustomTooltip />}/>
                      <Area type="monotone" dataKey="activeRooms" stroke="#6366F1" strokeWidth={2} fill="url(#gradRooms)" name="Active Rooms" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="admin-chart-card">
                  <div className="admin-chart-title">
                    <Users size={13}/> User Trends
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} allowDecimals={false}/>
                      <Tooltip content={<CustomTooltip />}/>
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                      <Line type="monotone" dataKey="totalUsers"     stroke="var(--primary)"   strokeWidth={2} dot={false} name="Total"/>
                      <Line type="monotone" dataKey="activeUsers"    stroke="var(--secondary)" strokeWidth={2} dot={false} name="Active"/>
                      <Line type="monotone" dataKey="suspendedUsers" stroke="var(--danger)"    strokeWidth={2} dot={false} name="Suspended"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Live Activity Feed ── */}
              {auditLogs.length > 0 && (
                <div className="activity-feed-card">
                  <div className="activity-feed-header">
                    <Activity size={14}/> Live Activity Feed
                    <span className="feed-live-dot"><Circle size={7} fill="var(--secondary)" /> Live</span>
                  </div>
                  <div className="activity-feed-list">
                    {auditLogs.slice(0, 6).map((log, i) => {
                      const { cls, Icon } = getAuditIcon(log.action)
                      const feedActor = users.find(u => (u.userId || u.id) === log.actorId)
                      const feedActorLabel = feedActor
                        ? (feedActor.fullName || feedActor.username)
                        : log.actorId > 0 ? `Admin #${log.actorId}` : 'System'
                      const { label: feedLabel } = formatAuditAction(log)
                      return (
                        <div key={i} className="feed-item">
                          <span className={`feed-dot ${cls}`}/>
                          <span className="feed-text">
                            <strong>{feedActorLabel}</strong>
                            {' '}{feedLabel.toLowerCase()}
                            {log.details ? ` · ${log.details}` : ''}
                          </span>
                          <span className="feed-time">
                            {log.createdAt ? format(parseTs(log.createdAt), 'HH:mm') : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>)
          })()}
        </div>
      )}

      {/* ══════════════════════ SECURITY TAB ═══════════════════════ */}
      {tab === 'security' && (
        <div className="admin-tab-content">
          <div className="security-grid">
            {/* Suspended accounts panel */}
            <div className="security-card">
              <div className="security-card-header">
                <span className="sc-icon danger"><Ban size={16}/></span>
                <div>
                  <div className="sc-title">Suspended Accounts</div>
                  <div className="sc-sub">{stats.suspended} account{stats.suspended !== 1 ? 's' : ''} currently suspended</div>
                </div>
              </div>
              {stats.suspended === 0 ? (
                <div className="sc-empty"><CheckCircle size={18} style={{ color: 'var(--success)' }}/> No suspended accounts</div>
              ) : (
                <div className="sc-list">
                  {users.filter(u => u.active === false || (u.status || '').toUpperCase() === 'SUSPENDED').slice(0, 8).map(u => {
                    const uid = u.userId || u.id
                    return (
                      <div key={uid} className="sc-row">
                        <div className="admin-user-av sc-av">{(u.fullName || u.username || '?')[0].toUpperCase()}</div>
                        <div className="sc-row-info">
                          <span className="sc-row-name">{u.username}</span>
                          <span className="sc-row-email">{u.email}</span>
                        </div>
                        <button className="admin-act-btn success sc-btn" onClick={() => setConfirmAction({ type: 'reactivate', userId: uid, name: u.username })}>
                          <CheckCircle size={11}/> Reactivate
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Recent security events */}
            <div className="security-card">
              <div className="security-card-header">
                <span className="sc-icon amber"><ShieldAlert size={16}/></span>
                <div>
                  <div className="sc-title">Recent Security Events</div>
                  <div className="sc-sub">Last admin actions involving access control</div>
                </div>
              </div>
              {auditLogs.filter(l => l.action?.includes('SUSPEND') || l.action?.includes('DELETE') || l.action?.includes('ROLE')).length === 0 ? (
                <div className="sc-empty"><CheckCircle size={18} style={{ color: 'var(--success)' }}/> No recent security events</div>
              ) : (
                <div className="sc-list">
                  {auditLogs.filter(l => l.action?.includes('SUSPEND') || l.action?.includes('DELETE') || l.action?.includes('ROLE')).slice(0, 8).map((log, i) => {
                    const { cls } = getAuditIcon(log.action)
                    return (
                      <div key={i} className="sc-row">
                        <span className={`feed-dot ${cls}`} style={{ flexShrink: 0 }}/>
                        <div className="sc-row-info">
                          <span className="sc-row-name">{log.action?.replace(/_/g, ' ')}</span>
                          <span className="sc-row-email">{log.details || '—'}</span>
                        </div>
                        <span className="feed-time">{log.createdAt ? format(parseTs(log.createdAt), 'MMM d, HH:mm') : ''}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Platform health summary */}
            <div className="security-card security-card--health">
              <div className="security-card-header">
                <span className="sc-icon mint"><Activity size={16}/></span>
                <div>
                  <div className="sc-title">Platform Health</div>
                  <div className="sc-sub">Real-time system indicators</div>
                </div>
              </div>
              <div className="health-rows">
                <div className="health-row">
                  <span className="health-label">User Activation Rate</span>
                  <div className="health-bar-wrap">
                    <div className="health-bar" style={{ width: stats.total ? `${(stats.active/stats.total*100).toFixed(0)}%` : '0%', background: 'var(--success)' }}/>
                  </div>
                  <span className="health-val">{stats.total ? `${(stats.active/stats.total*100).toFixed(1)}%` : '—'}</span>
                </div>
                <div className="health-row">
                  <span className="health-label">Premium Adoption</span>
                  <div className="health-bar-wrap">
                    <div className="health-bar" style={{ width: stats.total ? `${(stats.pro/stats.total*100).toFixed(0)}%` : '0%', background: 'var(--accent)' }}/>
                  </div>
                  <span className="health-val">{stats.total ? `${(stats.pro/stats.total*100).toFixed(1)}%` : '—'}</span>
                </div>
                <div className="health-row">
                  <span className="health-label">Suspension Rate</span>
                  <div className="health-bar-wrap">
                    <div className="health-bar" style={{ width: stats.total ? `${Math.min(100,(stats.suspended/stats.total*100)).toFixed(0)}%` : '0%', background: stats.suspended > 0 ? 'var(--danger)' : 'var(--success)' }}/>
                  </div>
                  <span className="health-val">{stats.total ? `${(stats.suspended/stats.total*100).toFixed(1)}%` : '—'}</span>
                </div>
                <div className="health-row">
                  <span className="health-label">Online / Total</span>
                  <div className="health-bar-wrap">
                    <div className="health-bar" style={{ width: stats.total && onlineCount ? `${Math.min(100,(onlineCount/stats.total*100)).toFixed(0)}%` : '0%', background: 'var(--secondary)' }}/>
                  </div>
                  <span className="health-val">{stats.total && onlineCount != null ? `${(onlineCount/stats.total*100).toFixed(1)}%` : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ BROADCAST TAB ══════════════════════ */}
      {tab === 'broadcast' && (
        <div className="admin-tab-content">
          <div className="admin-broadcast-card">
            <div className="admin-broadcast-header">
              <span style={{ color: 'var(--accent)' }}><Megaphone size={20} /></span>
              <div>
                <div className="admin-broadcast-title">Platform Broadcast</div>
                <div className="admin-broadcast-sub">Message will appear as a banner to all currently connected users.</div>
              </div>
            </div>
            <div className="admin-broadcast-field">
              <label>Title <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
              <input className="admin-broadcast-input" placeholder="e.g. Scheduled Maintenance" value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} maxLength={80}/>
            </div>
            <div className="admin-broadcast-field">
              <label>Message <span style={{ color: 'var(--danger)', fontWeight: 700 }}>*</span></label>
              <textarea className="admin-broadcast-textarea" placeholder="Type your platform-wide announcement here…" value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} rows={4} maxLength={500}/>
              <div className="admin-broadcast-chars">{broadcastMessage.length}/500</div>
            </div>
            <button className="admin-broadcast-send" disabled={!broadcastMessage.trim() || broadcastSending} onClick={handleBroadcast}>
              {broadcastSending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
              {broadcastSending ? 'Sending…' : 'Send Broadcast'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════ CONFIRM MODAL ══════════════════════ */}
      {confirmAction && (
        <div className="admin-confirm-overlay" onClick={() => setConfirmAction(null)}>
          <div role="dialog" className="admin-confirm-card" onClick={e => e.stopPropagation()}>
            <div className={`confirm-icon ${confirmAction.type === 'delete' ? 'danger' : confirmAction.type === 'suspend' ? 'warn' : 'success'}`}>
              {confirmAction.type === 'delete'     ? <Trash2 size={20}/> :
               confirmAction.type === 'suspend'    ? <Ban size={20}/> :
               confirmAction.type === 'reactivate' ? <CheckCircle size={20}/> :
               <UserCog size={20}/>}
            </div>
            <h3>
              {confirmAction.type === 'delete'     ? 'Delete User Permanently?' :
               confirmAction.type === 'suspend'    ? 'Suspend User?' :
               confirmAction.type === 'reactivate' ? 'Reactivate User?' :
               confirmAction.type === 'promote'    ? 'Promote to Admin?' : 'Demote to User?'}
            </h3>
            <p>
              Are you sure you want to {confirmAction.type}{' '}
              <strong>@{confirmAction.name}</strong>?
              {confirmAction.type === 'delete'  && ' This action cannot be undone.'}
              {confirmAction.type === 'promote' && ' They will gain full admin privileges.'}
              {confirmAction.type === 'demote'  && ' They will lose admin privileges.'}
            </p>
            <div className="admin-confirm-actions">
              <button className="admin-confirm-cancel" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className={`admin-confirm-danger ${confirmAction.type === 'reactivate' ? 'success-btn' : ''}`} onClick={handleAction}>
                {loading ? <Loader2 size={13} className="spin" /> : null}
                {confirmAction.type === 'delete'     ? 'Delete' :
                 confirmAction.type === 'suspend'    ? 'Suspend' :
                 confirmAction.type === 'reactivate' ? 'Reactivate' :
                 confirmAction.type === 'promote'    ? 'Promote' : 'Demote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
