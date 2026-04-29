/*
 * adminStore.js — Admin Dashboard State (Zustand)
 *
 * Purpose:
 *   Manages all state needed by the AdminDashboard component: the full user list,
 *   audit log entries, loading/error status, and the current search filter.
 *
 * How it works:
 *   Each async action (fetchUsers, suspendUser, etc.) follows the same pattern:
 *   1. Set loading=true and error=null before the API call.
 *   2. Call adminApi to talk to the backend.
 *   3. On success, update the relevant state field and set loading=false.
 *   4. On failure, save the error message to state and set loading=false.
 *
 *   After mutating actions (suspend, reactivate, delete), the store updates the
 *   local users array immediately without refetching from the server. This is called
 *   "optimistic local update" — the UI reflects the change right away.
 *
 * State fields:
 *   users        — array of all user objects fetched from /auth/users
 *   auditLogs    — array of audit log entries for the current page
 *   auditPage    — pagination metadata { number, totalPages, totalElements }
 *   loading      — true while any async operation is in progress
 *   error        — error message string if the last operation failed
 *   searchQuery  — the current text in the user search box
 *
 * The filteredUsers() method is a derived selector — it filters the users array
 * by the searchQuery without making any network call, so search is instant.
 */
import { create } from "zustand";
import { adminApi } from "../services/adminApi";

export const useAdminStore = create((set, get) => ({
  users: [],
  auditLogs: [],
  auditPage: { number: 0, totalPages: 0, totalElements: 0 },
  loading: false,
  error: null,
  searchQuery: "",
  onlineCount: null,

  /*
   * setSearchQuery(q) — updates the search filter string.
   * The AdminDashboard calls this on every keystroke in the search input.
   * filteredUsers() then returns only matching users.
   */
  setSearchQuery: (q) => set({ searchQuery: q }),

  /*
   * fetchUsers() — loads all registered users from the auth-service.
   * Populates the users array which is displayed in the AdminDashboard table.
   */
  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const data = await adminApi.getAllUsers();
      set({ users: Array.isArray(data) ? data : [], loading: false });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  /*
   * suspendUser(userId) — disables a user account.
   * After the API call succeeds, updates the matching user in the local users array
   * by setting their status to SUSPENDED so the table shows the change immediately.
   * Throws the error so AdminDashboard can show a toast notification on failure.
   */
  suspendUser: async (userId) => {
    set({ loading: true, error: null });
    try {
      await adminApi.suspendUser(userId);
      set((state) => ({
        users: state.users.map((u) =>
          u.userId === userId || u.id === userId ? { ...u, active: false } : u,
        ),
        loading: false,
      }));
    } catch (e) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  /*
   * reactivateUser(userId) — re-enables a suspended user account.
   * Updates the local user's status to ACTIVE without refetching.
   */
  reactivateUser: async (userId) => {
    set({ loading: true, error: null });
    try {
      await adminApi.reactivateUser(userId);
      set((state) => ({
        users: state.users.map((u) =>
          u.userId === userId || u.id === userId ? { ...u, active: true } : u,
        ),
        loading: false,
      }));
    } catch (e) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  /*
   * deleteUser(userId) — permanently removes a user.
   * After the API call, filters the user out of the local users array so the row
   * disappears from the table immediately without a full refresh.
   */
  deleteUser: async (userId) => {
    set({ loading: true, error: null });
    try {
      await adminApi.deleteUser(userId);
      set((state) => ({
        users: state.users.filter((u) => (u.userId || u.id) !== userId),
        loading: false,
      }));
    } catch (e) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  /*
   * fetchAuditLogs(page) — loads a page of admin audit log entries.
   * The backend returns a Spring Page object with content array and pagination metadata.
   * Handles both paginated (data.content) and plain array (data) response shapes.
   */
  fetchAuditLogs: async (page = 0) => {
    set({ loading: true, error: null });
    try {
      const data = await adminApi.getAuditLogs(page);
      set({
        auditLogs: data?.content || data || [],
        auditPage: {
          number: data?.number || page,
          totalPages: data?.totalPages || 1,
          totalElements: data?.totalElements || 0,
        },
        loading: false,
      });
    } catch (e) {
      set({ error: e.message, loading: false });
    }
  },

  changeRole: async (userId, role) => {
    set({ loading: true, error: null });
    try {
      const updated = await adminApi.changeRole(userId, role);
      set((state) => ({
        users: state.users.map((u) =>
          u.userId === userId || u.id === userId
            ? { ...u, role: updated.role }
            : u,
        ),
        loading: false,
      }));
    } catch (e) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  fetchOnlineCount: async () => {
    try {
      const count = await adminApi.getOnlineCount();
      set({ onlineCount: typeof count === "number" ? count : null });
    } catch {
      /* non-critical — leave as null */
    }
  },

  /*
   * filteredUsers() — returns the users array filtered by the current searchQuery.
   * Filters by username, email, phone number, and full name (case-insensitive).
   * Returns all users when searchQuery is empty.
   */
  filteredUsers: () => {
    const { users, searchQuery } = get();
    if (!searchQuery) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.phoneNumber || "").toLowerCase().includes(q) ||
        (u.fullName || "").toLowerCase().includes(q),
    );
  },
}));
