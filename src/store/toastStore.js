import { create } from 'zustand'

let toastIdGen = 0

// Tracks when each unique message+variant combo was last shown.
// Used to suppress duplicate toasts within a cooldown window.
const lastShownAt = {}
const DEDUP_WINDOW_MS = 4000   // ignore same message within 4 seconds

export const useToastStore = create((set) => ({
  toasts: [],

  // Adds a toast and returns its unique ID.
  // Silently drops duplicates if the same message+variant was shown
  // within DEDUP_WINDOW_MS to prevent spam from concurrent failed requests.
  addToast: (message, variant = 'info', duration = 5000) => {
    const key = `${variant}::${message}`
    const now = Date.now()

    if (lastShownAt[key] && now - lastShownAt[key] < DEDUP_WINDOW_MS) {
      return null   // duplicate — skip
    }
    lastShownAt[key] = now

    const id = ++toastIdGen
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant }]
    }))

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter(t => t.id !== id)
        }))
      }, duration)
    }

    return id
  },

  // Expose manual removal for early close button clicks
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter(t => t.id !== id)
    }))
  }
}))
