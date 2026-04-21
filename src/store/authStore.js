/*
 * authStore.js — Global Authentication State (Zustand)
 *
 * Purpose:
 *   Provides a single source of truth for the currently logged-in user and their
 *   JWT access token. Every component that needs to know "who is logged in" reads
 *   from this store instead of touching localStorage directly.
 *
 * How it works:
 *   Zustand is a lightweight state management library. `create()` returns a hook
 *   (useAuthStore) that any React component can call to read or update auth state.
 *
 *   On page load, the store is initialized from localStorage so the user does not
 *   get logged out when they refresh the page. On login, setAuth() writes to both
 *   localStorage (for persistence) and the Zustand store (for reactivity). On
 *   logout, clearAuth() wipes both so the user is fully signed out.
 *
 * State fields:
 *   token — the JWT access token. ProtectedRoute in App.jsx checks this to decide
 *            whether to allow or block access to a route.
 *   user  — the full user object { id, username, email, subscriptionTier, role, etc. }
 *
 * Methods:
 *   setAuth(token, refreshToken, user)
 *     — called after a successful login or token refresh. Saves all three values to
 *       localStorage and updates the Zustand store so the UI re-renders immediately.
 *
 *   clearAuth()
 *     — called on logout. Wipes all localStorage keys (tokens, user, theme) and
 *       sets both token and user to null, which causes ProtectedRoute to redirect to /login.
 *
 *   updateUser(updates)
 *     — merges partial changes into the user object. Used after profile edits or after
 *       a subscription upgrade so the UI reflects the new subscriptionTier without
 *       needing a full re-login.
 */
import { create } from 'zustand'

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('accessToken'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  setAuth: (token, refreshToken, user) => {
    localStorage.setItem('accessToken', token)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token, user })
  },

  clearAuth: () => {
    localStorage.clear()
    set({ token: null, user: null })
  },

  updateUser: (updates) => {
    set(state => {
      const user = { ...state.user, ...updates }
      localStorage.setItem('user', JSON.stringify(user))
      return { user }
    })
  }
}))
