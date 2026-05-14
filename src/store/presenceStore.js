/*
 * presenceStore.js — Global User Presence / Status State (Zustand)
 *
 * Purpose:
 *   Single source of truth for the current user's own presence status.
 *   Shared by Sidebar (footer dot + picker), ProfilePanel (status selector),
 *   ChatLayout (DND notification gate), and the useIdleDetector hook.
 *
 * Status values:
 *   ONLINE    — active and available
 *   AWAY      — idle / stepped away
 *   DND       — Do Not Disturb — no notification popups or sounds
 *   INVISIBLE — appears OFFLINE to others, but can still use the app
 *
 * isAutoAway flag:
 *   Set to true when the idle detector automatically switches the user to AWAY.
 *   When activity resumes, the store restores prevStatus (the last *manual* status)
 *   rather than blindly setting ONLINE — so a user who manually chose DND before
 *   going idle gets DND back, not ONLINE.
 *
 * Usage:
 *   const { userStatus, setStatus } = usePresenceStore()
 *   usePresenceStore.getState().initStatus(userId)   // call once on login
 */
import { create } from 'zustand'
import { api } from '../services/api'

export const usePresenceStore = create((set, get) => ({
  userStatus: 'ONLINE',
  isAutoAway: false,
  prevStatus: 'ONLINE',   // status in effect before auto-away kicked in

  /*
   * initStatus — loads the user's current presence from the backend.
   * Called once in ChatLayout after login to hydrate the store.
   */
  initStatus: async (userId) => {
    try {
      const p = await api.getPresence(userId)
      if (p?.status) {
        set({ userStatus: p.status, prevStatus: p.status, isAutoAway: false })
      }
    } catch {}
  },

  /*
   * setStatus — manual status change triggered by the user clicking the picker.
   * Clears the auto-away flag so the idle detector starts fresh.
   */
  setStatus: async (userId, status) => {
    set({ userStatus: status, prevStatus: status, isAutoAway: false })
    try { await api.setPresenceStatus(userId, status) } catch {}
  },

  /*
   * setAutoAway — called by useIdleDetector after the idle timeout expires.
   * Saves the current status as prevStatus so it can be restored later.
   * Does nothing if the user is already not ONLINE (e.g. manually set DND).
   */
  setAutoAway: async (userId) => {
    const { userStatus, isAutoAway } = get()
    if (isAutoAway || userStatus !== 'ONLINE') return   // don't clobber manual statuses
    set({ prevStatus: userStatus, userStatus: 'AWAY', isAutoAway: true })
    try { await api.setPresenceStatus(userId, 'AWAY') } catch {}
  },

  /*
   * clearAutoAway — called by useIdleDetector when the user becomes active again.
   * Restores prevStatus (the last manually chosen status) instead of hard-coding ONLINE.
   */
  clearAutoAway: async (userId) => {
    const { isAutoAway, prevStatus } = get()
    if (!isAutoAway) return
    const restore = prevStatus || 'ONLINE'
    set({ userStatus: restore, isAutoAway: false })
    try { await api.setPresenceStatus(userId, restore) } catch {}
  },
}))
