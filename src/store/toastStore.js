import { create } from 'zustand'

let toastIdGen = 0

export const useToastStore = create((set) => ({
  toasts: [],
  
  // Adds a toast and returns its unique ID
  addToast: (message, variant = 'info', duration = 5000) => {
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
